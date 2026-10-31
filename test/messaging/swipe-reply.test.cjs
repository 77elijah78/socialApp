const { test, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const { act, create } = require("react-test-renderer");
require("./harness.cjs");
const { State, drive, swipe, replyPans } = require("./gesture-driver.cjs");
const { REPLY_SWIPE, replySwipeIntent, shouldReplyFromSwipe } = require("../../src/utils/messaging/swipeReply.ts");
const SwipeToReply = require("../../src/components/chat/SwipeToReply.tsx").default;
let renderer;
let replies;
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
  renderer = null;
});
async function mount(enabled = true, Component = SwipeToReply) {
  replies = 0;
  await act(async () => { renderer = create(React.createElement(Component, {
    enabled, onReply: () => replies++,
  }, React.createElement("MediaControl"))); });
  return replyPans(renderer)[0];
}

test("direction locks clear left intent before the old 18-point/12-point rejection window", () => {
  for (const [x, y] of [[0, 0], [-4, 3], [-11, 8], [5, 7]]) assert.equal(replySwipeIntent(x, y), "pending");
  for (const [x, y] of [[-12, 0], [-14, 11], [-18, 14], [-24, -18]]) assert.equal(replySwipeIntent(x, y), "reply");
  for (const [x, y] of [[0, 10], [-9, -10], [-12, 14], [10, 0], [15, 7], [NaN, 0], [-40, Infinity]])
    assert.equal(replySwipeIntent(x, y), "scroll");
});

test("completion needs initial intent, not a second absolute vertical veto at finger-up", () => {
  assert.equal(REPLY_SWIPE.complete, 48);
  for (const y of [0, 18, 32, -45, 70]) assert.equal(shouldReplyFromSwipe(-60, y, true), true);
  for (const [x, y, locked] of [[-47, 0, true], [-3, 0, true], [60, 0, true], [-80, 0, false], [NaN, 0, true], [-80, Infinity, true]])
    assert.equal(shouldReplyFromSwipe(x, y, locked), false);
});

test("Expo Babel registers the manual callbacks and both helpers as UI worklets, with capped visual travel", async () => {
  const Module = require("node:module");
  const path = require("node:path");
  const babel = require("@babel/core");
  function compile(file, overrides = {}) {
    const mod = new Module(file, module);
    mod.filename = file;
    mod.paths = Module._nodeModulePaths(path.dirname(file));
    const original = mod.require.bind(mod);
    mod.require = request => overrides[request] ?? original(request);
    mod._compile(babel.transformFileSync(file, {
      babelrc: false, configFile: false, presets: ["babel-preset-expo"],
      caller: { name: "metro", platform: "android", isDev: false, isServer: false },
    }).code, file);
    return mod.exports;
  }
  const helpers = compile(require.resolve("../../src/utils/messaging/swipeReply.ts"));
  for (const name of ["replySwipeIntent", "shouldReplyFromSwipe"])
    assert.equal(typeof helpers[name].__workletHash, "number", name);
  const compiled = compile(require.resolve("../../src/components/chat/SwipeToReply.tsx"), {
    "@/utils/messaging/swipeReply": helpers,
  });
  const gesture = await mount(true, compiled.default);
  assert.equal(gesture.shouldUseReanimated, true, "synchronous state-manager calls must not fall back to the JS dispatcher");
  assert.equal(gesture.config.manualActivation, true);
  assert.equal(gesture.config.maxPointers, 1);
  assert.equal(gesture.config.runOnJS, undefined);
  assert.equal(gesture.config.activeOffsetXStart, undefined);
  assert.equal(gesture.config.failOffsetYStart, undefined);
  assert.equal(gesture.config.failOffsetYEnd, undefined);
  for (const name of ["onTouchesDown", "onTouchesMove", "onTouchesUp", "onTouchesCancelled", "onStart", "onUpdate", "onEnd", "onFinalize"])
    assert.equal(typeof gesture.handlers[name].__workletHash, "number", name);
  const driver = drive(gesture);
  const translation = gesture.handlers.onUpdate.__closure.translation;
  try {
    await act(async () => { driver.down(); driver.move(-14, 1); driver.move(-140, 50); });
    assert.equal(translation.get(), -72);
    await act(async () => driver.move(10, 2));
    assert.equal(translation.get(), 0, "a reversal never pulls the row to the right");
    await act(async () => driver.up());
    assert.equal(translation.get(), 0, "finalize targets the resting position (spring physics are mocked)");
    assert.equal(replies, 0);
  } finally { driver.dispose(); }
});

test("48 points from touch-down completes even with Android activation translation reset", async () => {
  const gesture = await mount();
  await act(async () => swipe(gesture, -48, 5, { translationReset: true }));
  assert.equal(replies, 1);
});

test("curved left swipes keep the reply lock despite later vertical drift on either platform model", async () => {
  const gesture = await mount();
  for (const translationReset of [true, false]) {
    const driver = drive(gesture, { translationReset });
    try {
      await act(async () => {
        driver.down(); driver.move(-14, 11); driver.move(-30, 23); driver.move(-62, 40); driver.up();
      });
      assert.deepEqual(driver.calls, [State.ACTIVE]);
    } finally { driver.dispose(); }
  }
  assert.equal(replies, 2);
});

test("vertical/right intent fails early and cannot become reply later in the same touch stream", async () => {
  const gesture = await mount();
  for (const [x, y] of [[-4, 10], [0, -10], [-12, 15], [10, 2]]) {
    const driver = drive(gesture);
    try {
      await act(async () => { driver.down(); driver.move(x, y); driver.move(-80, y); driver.up(); });
      assert.deepEqual(driver.calls, [State.FAILED], "failure releases the list before a late direction change");
    } finally { driver.dispose(); }
  }
  assert.equal(replies, 0);
});

test("stationary taps/long presses do not activate the reply gesture or remove the media child", async () => {
  const gesture = await mount();
  const driver = drive(gesture);
  try {
    await act(async () => { driver.down(); driver.move(-3, 2); driver.up(); });
    assert.deepEqual(driver.calls, [State.FAILED]);
    assert.equal(replies, 0);
    assert.equal(renderer.root.findAllByType("MediaControl").length, 1);
  } finally { driver.dispose(); }
});

test("short, reversed and native-cancelled gestures never reply; finalize resets for the next attempt", async () => {
  const gesture = await mount();
  await act(async () => { swipe(gesture, -47, 0); swipe(gesture, -4, 1); swipe(gesture, 10, 1); });
  for (const action of ["cancel", "interrupt"]) {
    const driver = drive(gesture);
    try {
      await act(async () => { driver.down(); driver.move(-14, 1); driver.move(-80, 4); driver[action](); driver.up(); });
      assert.equal(replies, 0);
    } finally { driver.dispose(); }
  }
  await act(async () => swipe(gesture));
  assert.equal(replies, 1);
});

test("a second or replaced pointer invalidates both pending and activated swipes", async () => {
  const gesture = await mount();
  for (const active of [false, true]) for (const action of ["secondPointer", "replacePointer"]) {
    const driver = drive(gesture);
    try {
      await act(async () => {
        driver.down(); if (active) driver.move(-14, 1);
        driver[action](); driver.move(-80, 1); driver.up();
      });
      assert.equal(driver.state, State.FAILED);
    } finally { driver.dispose(); }
  }
  assert.equal(replies, 0);
  await act(async () => swipe(gesture));
  assert.equal(replies, 1);
});

test("disabled replies never capture touches and one successful lifecycle emits exactly once", async () => {
  let gesture = await mount(false);
  await act(async () => swipe(gesture));
  assert.equal(replies, 0);
  await act(async () => renderer.unmount()); renderer = null;
  gesture = await mount();
  const driver = drive(gesture);
  try {
    await act(async () => { driver.down(); driver.move(-14, 1); driver.move(-60, 8); driver.up(); driver.up(); });
    assert.equal(replies, 1);
    gesture.handlers.onEnd({ absoluteX: 100, absoluteY: 320 }, true);
    assert.equal(replies, 1, "a duplicate/stale end after finalize cannot emit again");
  } finally { driver.dispose(); }
});
