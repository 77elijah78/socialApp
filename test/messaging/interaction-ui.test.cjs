const { test, before, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const { act, create } = require("react-test-renderer");
const { row, mock, native, scrolls, resetScrolls, settle } = require("./harness.cjs");
const { drive, swipe, replyPans } = require("./gesture-driver.cjs");
let renders = 0;
mock("@/components/messages/MessageCard", props => { renders++; return React.createElement("MessageCard", props); });
const noop = () => {};
const chat = {
  messages: [], markVisibleRead: noop, isSyncing: false, onTyping: noop,
  loadMore: async () => {}, refresh: async () => {}, releaseHistory: noop,
};
mock("@/hooks/useChat", { useChat: () => chat });
const { runMigrations } = require("../../src/db/migrations.ts");
const { messageStore } = require("../../src/db/MessageStore.ts");
let keyboardProgress = 0;
mock("react-native-keyboard-controller", {
  KeyboardAvoidingView: "KeyboardAvoidingView",
  useKeyboardState: select => select({ isVisible: keyboardProgress === 1 }),
  useReanimatedKeyboardAnimation: () => ({ progress: { value: keyboardProgress } }),
});
const Screen = require("../../src/app/(chatRoom)/privateRoom.tsx").default;
const Row = require("../../src/components/chat/ChatMessageRow.tsx").default;
const { replySwipeIntent, shouldReplyFromSwipe } = require("../../src/utils/messaging/swipeReply.ts");
const { router } = require("expo-router");
let renderer;
const button = label => renderer.root.findByProps({ accessibilityLabel: label });
before(runMigrations);
beforeEach(async () => {
  await messageStore.deleteAll();
  chat.getLoadedMessage = undefined;
  chat.messages = Array.from({ length: 30 }, (_, i) => row(i));
  await messageStore.saveMany(chat.messages);
  resetScrolls(); renders = 0; keyboardProgress = 0;
  native.Platform.OS = "ios";
});
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
  renderer = null;
  native.Platform.OS = "ios";
});
async function mount() { await act(async () => { renderer = create(React.createElement(Screen)); }); }

test("left reply thresholds reject taps, tiny/right/vertical movements regardless of message kind", () => {
  for (const [x, y] of [[-2, 0], [-11, 0], [-47, 0], [90, 0], [-30, 60], [-60, 90], [NaN, 0], [-60, Infinity]])
    assert.equal(shouldReplyFromSwipe(x, y, replySwipeIntent(x, y) === "reply"), false);
  assert.equal(shouldReplyFromSwipe(-48, 0, true), true);
  assert.equal(shouldReplyFromSwipe(-70, 32, true), true);
});

test("the real common row installs the same one-finger horizontal gesture for all seven supported types", async () => {
  const types = ["TEXT", "IMAGE", "VIDEO", "AUDIO", "DOCUMENT", "SHARED_POST", "SHARED_STORY"];
  const messages = types.map((type, i) => row(i, { type }));
  const replied = [];
  await act(async () => { renderer = create(React.createElement(React.Fragment, null, messages.map(message =>
    React.createElement(Row, { key: message.id, item: { kind: "message", id: `message:${message.localId}`, message },
      userId: "me", receiverName: "Other", onAction: noop, onRetry: noop, onReply: row => replied.push(row),
      onNavigate: noop, onContextClose: noop, onContextPage: noop, onContextRefresh: noop })))); });
  for (const gesture of replyPans(renderer)) {
    assert.equal(gesture.config.enabled, true);
    assert.equal(gesture.config.maxPointers, 1);
    assert.equal(gesture.config.manualActivation, true);
    swipe(gesture, -20, 0);
    const vertical = drive(gesture);
    try { vertical.down(); vertical.move(-4, 14); vertical.move(-80, 60); vertical.up(); }
    finally { vertical.dispose(); }
    const cancelled = drive(gesture);
    try { cancelled.down(); cancelled.move(-14, 1); cancelled.move(-80, 0); cancelled.cancel(); }
    finally { cancelled.dispose(); }
    swipe(gesture, -60, 34);
  }
  assert.deepEqual(replied, messages, "reply callback receives the actual canonical row, not a text-only reconstruction");
});

test("selection disables pan replies and intercepts row/media taps without changing card geometry", async () => {
  let actions = 0;
  const message = row(1, { type: "VIDEO", mediaUrl: "https://files.test/video.mp4" });
  await act(async () => { renderer = create(React.createElement(Row, {
    item: { kind: "message", id: "message:one", message }, userId: "me", receiverName: "Other",
    selectionMode: true, selected: true, onAction: () => actions++, onRetry: noop, onReply: noop,
    onNavigate: noop, onContextClose: noop, onContextPage: noop, onContextRefresh: noop,
  })); });
  assert.equal(renderer.root.findByType("GestureDetector").props.gesture.config.enabled, false);
  const overlay = renderer.root.findByProps({ testID: `message-select-${message.localId}` });
  assert.equal(overlay.props.accessibilityState.checked, true);
  assert.ok(renderer.root.findAllByProps({ pointerEvents: "none", accessibilityElementsHidden: true }).length);
  await act(async () => overlay.props.onPress());
  assert.equal(actions, 1);
  assert.equal(renderer.root.findByType("MessageCard").props.uri, message.mediaUrl);
});

test("actual screen preserves draft/composer identity, multi-selects with only the changed row rerendering, and hardware back exits first", async t => {
  native.Platform.OS = "android";
  await mount();
  const input = renderer.root.findByType("TextInput");
  await act(async () => input.props.onChangeText("Keep this draft"));
  const composerBefore = renderer.root.findByProps({ testID: "chat-composer" });
  const first = renderer.root.findAllByType("MessageCard")[0];
  const queuedGesture = drive(replyPans(renderer)[0]);
  t.after(() => queuedGesture.dispose());
  await act(async () => { queuedGesture.down(); queuedGesture.move(-14, 1); queuedGesture.move(-60, 0); });
  await act(async () => first.props.onLongPress());
  assert.equal(renderer.root.findByProps({ testID: "message-selection-toolbar" }).findAllByType("Text")[0].props.children[0], 1);
  assert.equal(renderer.root.findByType("TextInput").props.editable, false);
  assert.equal(renderer.root.findByType("TextInput").props.value, "Keep this draft");
  assert.equal(renderer.root.findByProps({ testID: "chat-composer" }), composerBefore);
  const secondId = renderer.root.findAllByType("MessageCard")[1].props.playbackId;
  const before = renders;
  await act(async () => renderer.root.findByProps({ testID: `message-select-${secondId}` }).props.onPress());
  assert.ok(renders - before <= 1, `selection rerendered ${renders - before} cards, not the unchanged visible window`);
  assert.ok(renderer.root.findAllByProps({ accessibilityRole: "checkbox" }).filter(item => item.props.accessibilityState.checked).length === 2);
  await act(async () => queuedGesture.up());
  assert.equal(renderer.root.findAllByProps({ accessibilityLabel: "Cancel reply" }).length, 0, "a late UI-thread reply cannot bypass active selection");
  await act(async () => assert.equal(native.BackHandler.press(), true));
  assert.equal(renderer.root.findAllByProps({ testID: "message-selection-toolbar" }).length, 0);
  assert.equal(renderer.root.findByType("TextInput").props.editable, true);
  assert.equal(renderer.root.findByType("TextInput").props.value, "Keep this draft");
  assert.equal(native.BackHandler.press(), false);
  assert.equal(scrolls.length, 0, "selection is not a navigation/scroll workaround");
  await act(async () => renderer.unmount()); renderer = null;
  assert.equal(native.BackHandler.listeners.size, 0);
});

test("swipe and single-selection reply share the existing composer/cancel path, not a parallel reply sender", async () => {
  await mount();
  await act(async () => swipe(replyPans(renderer)[0], -60, 32));
  assert.equal(renderer.root.findAllByProps({ accessibilityLabel: "Cancel reply" }).length, 1);
  await act(async () => button("Cancel reply").props.onPress());
  const message = renderer.root.findAllByType("MessageCard")[1];
  await act(async () => message.props.onLongPress());
  await act(async () => button("Reply to selected message").props.onPress());
  assert.equal(renderer.root.findAllByProps({ testID: "message-selection-toolbar" }).length, 0);
  assert.equal(renderer.root.findAllByProps({ accessibilityLabel: "Cancel reply" }).length, 1);
  assert.equal(renderer.root.findAllByType("TextInput").length, 1);
  assert.equal(scrolls.length, 0);
  let back = 0;
  const original = router.back;
  router.back = () => back++;
  try {
    // With no selection, the existing header still navigates normally.
    await act(async () => button("Go back to messages").props.onPress());
    assert.equal(back, 1);
  } finally { router.back = original; }
});

test("metadata commits keep the row's gesture/action callbacks stable while using the latest message", async () => {
  const initial = row(1);
  const replied = [], pressed = [];
  const props = { item: { kind: "message", id: "message:stable", message: initial }, userId: "me", receiverName: "Other",
    onAction: message => pressed.push(message), onRetry: noop, onReply: message => replied.push(message),
    onNavigate: noop, onContextClose: noop, onContextPage: noop, onContextRefresh: noop };
  await act(async () => { renderer = create(React.createElement(Row, props)); });
  const gesture = renderer.root.findByType("GestureDetector").props.gesture;
  const press = renderer.root.findByType("MessageCard").props.onLongPress;
  const updated = { ...initial, status: "READ", isRead: true, content: "Updated original" };
  await act(async () => renderer.update(React.createElement(Row, { ...props, item: { ...props.item, message: updated } })));
  assert.equal(renderer.root.findByType("GestureDetector").props.gesture, gesture);
  assert.equal(renderer.root.findByType("MessageCard").props.onLongPress, press);
  swipe(gesture);
  press();
  assert.equal(replied[0], updated);
  assert.equal(pressed[0], updated);
});

test("a queued swipe consults canonical session identity instead of a just-deleted rendered row", async () => {
  let canonical = chat.messages;
  chat.getLoadedMessage = id => canonical.find(message => message.localId === id);
  await mount();
  const gesture = replyPans(renderer)[0];
  canonical = [];
  await act(async () => swipe(gesture));
  assert.equal(renderer.root.findAllByProps({ accessibilityLabel: "Cancel reply" }).length, 0);
  assert.equal(scrolls.length, 0);
});

test("reply-source cache validation covers a deletion missed before the composer subscription without losing its draft", async () => {
  await mount();
  await act(async () => renderer.root.findByType("TextInput").props.onChangeText("Keep my draft"));
  const staleGesture = replyPans(renderer)[0];
  const id = renderer.root.findAllByType("MessageCard")[0].props.playbackId;
  await messageStore.deleteOne(id, "me", { conversationId: "room", deleteFor: "everyone" });
  // The adapted screen deliberately still has the previous render. The real
  // useChat lookup is tested separately; this exercises the subscription gap.
  await act(async () => { swipe(staleGesture); await settle(); });
  assert.equal(renderer.root.findAllByProps({ accessibilityLabel: "Cancel reply" }).length, 0);
  assert.equal(renderer.root.findByType("TextInput").props.value, "Keep my draft");
  assert.ok(renderer.root.findAllByType("Text").some(node => String(node.props.children).includes("was removed")));
});

test("screen coordinates every row with exactly one native handler directly on the existing RN list", async () => {
  await mount();
  const nativeDetectors = renderer.root.findAllByType("GestureDetector")
    .filter(detector => detector.props.gesture.handlerName === "NativeViewGestureHandler");
  assert.equal(nativeDetectors.length, 1);
  const detector = nativeDetectors[0];
  const nativeGesture = detector.props.gesture;
  assert.equal(detector.props.children.props.testID, "chat-message-list", "no extra native layout view surrounds the list");
  assert.equal(nativeGesture.config.shouldCancelWhenOutside, false);
  assert.equal(nativeGesture.config.shouldActivateOnStart, undefined);
  assert.equal(nativeGesture.config.disallowInterruption, undefined, "the scroll handler must remain interruptible during intent arbitration");
  const pans = replyPans(renderer);
  assert.ok(pans.length > 0);
  for (const pan of pans) {
    assert.deepEqual(pan.config.blocksHandlers, [nativeGesture]);
    assert.equal(pan.config.simultaneousWith, undefined, "do not enable simultaneous scrolling while replying");
    assert.equal(pan.config.requireToFail, undefined, "the list waits for row intent, not vice versa");
  }
});

test("the native list relationship and every row gesture survive typing/receipt commits without reattachment", async () => {
  await mount();
  const nativeGesture = renderer.root.findAllByType("GestureDetector")
    .find(detector => detector.props.gesture.handlerName === "NativeViewGestureHandler").props.gesture;
  const pans = replyPans(renderer);
  await act(async () => renderer.root.findByType("TextInput").props.onChangeText("Still typing"));
  chat.messages = chat.messages.map((message, index) => index === 0 ? { ...message, status: "READ", isRead: true } : message);
  await act(async () => renderer.update(React.createElement(Screen)));
  assert.equal(renderer.root.findAllByType("GestureDetector")
    .find(detector => detector.props.gesture.handlerName === "NativeViewGestureHandler").props.gesture, nativeGesture);
  assert.deepEqual(replyPans(renderer), pans);
  await act(async () => swipe(pans[0], -48, 25));
  assert.equal(renderer.root.findAllByProps({ accessibilityLabel: "Cancel reply" }).length, 1);
  assert.equal(renderer.root.findByType("TextInput").props.value, "Still typing");
  assert.equal(scrolls.length, 0);
});

test("web retains automatic pan and browser vertical scrolling without unsupported native state-manager calls", async () => {
  native.Platform.OS = "web";
  await mount();
  const detectors = renderer.root.findAllByType("GestureDetector");
  assert.ok(detectors.length > 0);
  assert.equal(detectors.filter(detector => detector.props.gesture.handlerName === "NativeViewGestureHandler").length, 0);
  for (const detector of detectors) {
    assert.equal(detector.props.touchAction, "pan-y");
    assert.equal(detector.props.gesture.config.manualActivation, false);
    assert.equal(detector.props.gesture.config.blocksHandlers, undefined);
  }
  const driver = drive(replyPans(renderer)[0]);
  try {
    await act(async () => { driver.down(); driver.move(-14, 2); driver.move(-48, 25); driver.up(); });
    assert.deepEqual(driver.calls, [], "web must not call Reanimated's native-only setGestureState API");
    assert.equal(renderer.root.findAllByProps({ accessibilityLabel: "Cancel reply" }).length, 1);
  } finally { driver.dispose(); }
});


test("composer safe bottom follows the controller progress continuously, with no JS visibility-edge padding jump", async () => {
  await mount();
  const composer = renderer.root.findByProps({ testID: "chat-composer" });
  const wrapper = () => renderer.root.findAllByType("ReanimatedView").find(node => node.findAllByProps({ testID: "chat-composer" }).length > 0);
  for (const progress of [0, 0.25, 0.5, 0.75, 1, 0.75, 0.5, 0.25, 0]) {
    keyboardProgress = progress;
    await act(async () => renderer.update(React.createElement(Screen)));
    const styles = wrapper().props.style.flat();
    assert.equal(styles.at(-1).paddingBottom, 34 * (1 - progress));
    assert.equal(renderer.root.findByProps({ testID: "chat-composer" }), composer, "composer is not remounted for keyboard frames");
  }
  assert.equal(renderer.root.findAllByType("KeyboardAvoidingView").length, 1);
  assert.equal(scrolls.length, 0, "keyboard animation does not schedule scroll correction calls");
});


for (const type of ["TEXT", "IMAGE", "VIDEO", "AUDIO", "DOCUMENT", "SHARED_POST", "SHARED_STORY"]) test(`${type}: fast rebound selects the canonical reply immediately and survives keyboard changes until send`, async () => {
  const target = row(1, { type, mediaUrl: "https://cdn.test/file" });
  chat.messages = [target];
  const sent = [];
  chat.replyMsg = async (...args) => sent.push(args);
  await mount();
  const driver = drive(replyPans(renderer)[0]);
  try {
    await act(async () => { driver.down(); driver.move(-14, 1); driver.move(-61, 5); driver.up(-44, 8); });
    assert.equal(renderer.root.findAllByProps({ accessibilityLabel: "Cancel reply" }).length, 1);
    assert.equal(scrolls.length, 0);
    keyboardProgress = 1;
    await act(async () => renderer.update(React.createElement(Screen)));
    keyboardProgress = 0;
    await act(async () => renderer.update(React.createElement(Screen)));
    assert.equal(renderer.root.findAllByProps({ accessibilityLabel: "Cancel reply" }).length, 1);
    await act(async () => renderer.root.findByType("TextInput").props.onChangeText("Fast reply"));
    await act(async () => button("Send message").props.onPress());
    assert.equal(sent.length, 1);
    assert.equal(sent[0][1], target.id);
  } finally { driver.dispose(); }
});
