/* global __dirname */
// Use the installed RNGH builders and JS lifecycle dispatcher, not a copied
// gesture builder. Native recognition/state transitions remain a test boundary;
// these tests cannot certify Android/iOS touch arbitration or media responders.
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const root = path.resolve(__dirname, "../../node_modules/react-native-gesture-handler/src");
const cache = new Map();
const controllers = new Map();
function load(name) {
  const file = path.resolve(root, `${name}.ts`);
  if (cache.has(file)) return cache.get(file).exports;
  const mod = new Module(file, module);
  cache.set(file, mod);
  mod.filename = file;
  mod.paths = Module._nodeModulePaths(root);
  mod.require = request => {
    if (request === "react-native") return { DeviceEventEmitter: { addListener: () => ({ remove() {} }) } };
    const dependency = path.resolve(path.dirname(file), request);
    if (dependency === path.join(root, "utils")) return { isTestEnv: () => true, isRemoteDebuggingEnabled: () => false, tagMessage: value => value };
    if (dependency === path.join(root, "handlers/gestures/reanimatedWrapper")) return { Reanimated: {
      useSharedValue() {}, setGestureState: (tag, state) => controllers.get(tag)?.transition(state),
    } };
    if (request.startsWith(".")) return load(path.relative(root, dependency));
    return require(request);
  };
  mod._compile(ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: file,
  }).outputText, file);
  return mod.exports;
}
const { PanGesture } = load("handlers/gestures/panGesture");
const { NativeGesture } = load("handlers/gestures/nativeGesture");
const { registerHandler, unregisterHandler } = load("handlers/handlersRegistry");
const { onGestureHandlerEvent } = load("handlers/gestures/eventReceiver");
const { State } = load("State");
const { TouchEventType } = load("TouchEventType");
const Gesture = { Pan: () => new PanGesture(), Native: () => new NativeGesture() };
const replyPans = renderer => renderer.root.findAllByType("GestureDetector")
  .map(detector => detector.props.gesture).filter(gesture => gesture.handlerName === "PanGestureHandler");

function drive(gesture, { translationReset = true } = {}) {
  gesture.initialize();
  registerHandler(gesture.handlerTag, gesture);
  let state = State.UNDETERMINED;
  let x = 0, y = 0, activatedX = 0, activatedY = 0;
  const calls = [];
  const terminal = () => [State.FAILED, State.CANCELLED, State.END].includes(state);
  const payload = () => ({ handlerTag: gesture.handlerTag, state, numberOfPointers: 1,
    absoluteX: 240 + x, absoluteY: 320 + y, x: 240 + x, y: 320 + y,
    translationX: x - activatedX, translationY: y - activatedY, velocityX: 0, velocityY: 0 });
  const transition = next => {
    if (terminal() || next === state) return;
    const oldState = state;
    state = next;
    if (next === State.ACTIVE && translationReset) { activatedX = x; activatedY = y; }
    onGestureHandlerEvent({ ...payload(), oldState, state });
  };
  controllers.set(gesture.handlerTag, { transition: next => {
    calls.push(next);
    transition(next);
  } });
  const point = (id = 1) => ({ id, x: 240 + x, y: 320 + y, absoluteX: 240 + x, absoluteY: 320 + y });
  const touches = (eventType, points, numberOfTouches = points.length) => {
    if (terminal() || gesture.config.enabled === false) return;
    onGestureHandlerEvent({ handlerTag: gesture.handlerTag, state, eventType,
      numberOfTouches, allTouches: points, changedTouches: points, pointerType: 0 });
  };
  return {
    calls, get state() { return state; },
    down() {
      if (gesture.config.enabled === false) return;
      transition(State.BEGAN);
      touches(TouchEventType.TOUCHES_DOWN, [point()]);
    },
    move(nextX, nextY = 0) {
      x = nextX; y = nextY;
      // Web's automatic pan recognizes before delivering pointer-move callbacks.
      // This models the configured offsets, not DOM/native event arbitration.
      if (state === State.BEGAN && gesture.config.manualActivation !== true) {
        const c = gesture.config;
        if (x < c.failOffsetXStart || x > c.failOffsetXEnd || y < c.failOffsetYStart || y > c.failOffsetYEnd)
          transition(State.FAILED);
        else if (x < c.activeOffsetXStart || x > c.activeOffsetXEnd)
          transition(State.ACTIVE);
      }
      touches(TouchEventType.TOUCHES_MOVE, [point()]);
      if (state === State.ACTIVE) onGestureHandlerEvent(payload());
    },
    secondPointer() { touches(TouchEventType.TOUCHES_DOWN, [point(), point(2)]); },
    replacePointer() { touches(TouchEventType.TOUCHES_MOVE, [point(2)]); },
    up() {
      touches(TouchEventType.TOUCHES_UP, [], 0);
      if (!terminal()) transition(state === State.ACTIVE ? State.END : State.FAILED);
    },
    cancel() {
      touches(TouchEventType.TOUCHES_CANCELLED, []);
      transition(State.CANCELLED);
    },
    interrupt() { transition(State.CANCELLED); },
    dispose() { controllers.delete(gesture.handlerTag); unregisterHandler(gesture.handlerTag); },
  };
}
function swipe(gesture, x = -60, y = 0, options) {
  const driver = drive(gesture, options);
  try { driver.down(); driver.move(-14, 2); driver.move(x, y); driver.up(); }
  finally { driver.dispose(); }
}
module.exports = { Gesture, State, drive, swipe, replyPans };
