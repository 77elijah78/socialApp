const { test, before, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const { act, create } = require("react-test-renderer");
const { row, mock, native, scrolls, resetScrolls, settle } = require("./harness.cjs");
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
const Screen = require("../../src/app/(chatRoom)/privateRoom.tsx").default;
const Row = require("../../src/components/chat/ChatMessageRow.tsx").default;
const { shouldReplyFromSwipe } = require("../../src/utils/messaging/swipeReply.ts");
const { router } = require("expo-router");
let renderer;
const button = label => renderer.root.findByProps({ accessibilityLabel: label });
before(runMigrations);
beforeEach(async () => {
  await messageStore.deleteAll();
  chat.getLoadedMessage = undefined;
  chat.messages = Array.from({ length: 30 }, (_, i) => row(i));
  await messageStore.saveMany(chat.messages);
  resetScrolls(); renders = 0;
  native.Platform.OS = "ios";
});
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
  renderer = null;
  native.Platform.OS = "ios";
});
async function mount() { await act(async () => { renderer = create(React.createElement(Screen)); }); }

test("left reply thresholds reject taps, tiny/right/vertical/failed movements regardless of message kind", () => {
  for (const [x, y] of [[-2, 0], [-17, 0], [-55, 0], [90, 0], [-70, 40], [-90, 80], [NaN, 0], [-60, Infinity]])
    assert.equal(shouldReplyFromSwipe(x, y), false);
  assert.equal(shouldReplyFromSwipe(-56, 0), true);
  assert.equal(shouldReplyFromSwipe(-70, 8), true);
});

test("the real common row installs the same one-finger horizontal gesture for all seven supported types", async () => {
  const types = ["TEXT", "IMAGE", "VIDEO", "AUDIO", "DOCUMENT", "SHARED_POST", "SHARED_STORY"];
  const messages = types.map((type, i) => row(i, { type }));
  const replied = [];
  await act(async () => { renderer = create(React.createElement(React.Fragment, null, messages.map(message =>
    React.createElement(Row, { key: message.id, item: { kind: "message", id: `message:${message.localId}`, message },
      userId: "me", receiverName: "Other", onAction: noop, onRetry: noop, onReply: row => replied.push(row),
      onNavigate: noop, onContextClose: noop, onContextPage: noop, onContextRefresh: noop })))); });
  for (const detector of renderer.root.findAllByType("GestureDetector")) {
    const gesture = detector.props.gesture;
    assert.equal(gesture.config.enabled, true);
    assert.equal(gesture.config.maxPointers, 1);
    assert.equal(gesture.config.activeOffsetX, -18);
    assert.deepEqual(gesture.config.failOffsetY, [-12, 12]);
    gesture.handlers.end({ translationX: -20, translationY: 0 }, true);
    gesture.handlers.end({ translationX: -80, translationY: 60 }, true);
    gesture.handlers.end({ translationX: -80, translationY: 0 }, false);
    gesture.handlers.end({ translationX: -60, translationY: 4 }, true);
    gesture.handlers.finalize();
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

test("actual screen preserves draft/composer identity, multi-selects with only the changed row rerendering, and hardware back exits first", async () => {
  native.Platform.OS = "android";
  await mount();
  const input = renderer.root.findByType("TextInput");
  await act(async () => input.props.onChangeText("Keep this draft"));
  const composerBefore = renderer.root.findByProps({ testID: "chat-composer" });
  const first = renderer.root.findAllByType("MessageCard")[0];
  const queuedGesture = renderer.root.findAllByType("GestureDetector")[0].props.gesture;
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
  await act(async () => queuedGesture.handlers.end({ translationX: -60, translationY: 0 }, true));
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
  await act(async () => renderer.root.findAllByType("GestureDetector")[0].props.gesture.handlers.end({ translationX: -60, translationY: 1 }, true));
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
  gesture.handlers.end({ translationX: -60, translationY: 0 }, true);
  press();
  assert.equal(replied[0], updated);
  assert.equal(pressed[0], updated);
});

test("a queued swipe consults canonical session identity instead of a just-deleted rendered row", async () => {
  let canonical = chat.messages;
  chat.getLoadedMessage = id => canonical.find(message => message.localId === id);
  await mount();
  const gesture = renderer.root.findAllByType("GestureDetector")[0].props.gesture;
  canonical = [];
  await act(async () => gesture.handlers.end({ translationX: -60, translationY: 0 }, true));
  assert.equal(renderer.root.findAllByProps({ accessibilityLabel: "Cancel reply" }).length, 0);
  assert.equal(scrolls.length, 0);
});

test("reply-source cache validation covers a deletion missed before the composer subscription without losing its draft", async () => {
  await mount();
  await act(async () => renderer.root.findByType("TextInput").props.onChangeText("Keep my draft"));
  const staleGesture = renderer.root.findAllByType("GestureDetector")[0].props.gesture;
  const id = renderer.root.findAllByType("MessageCard")[0].props.playbackId;
  await messageStore.deleteOne(id, "me", { conversationId: "room", deleteFor: "everyone" });
  // The adapted screen deliberately still has the previous render. The real
  // useChat lookup is tested separately; this exercises the subscription gap.
  await act(async () => { staleGesture.handlers.end({ translationX: -60, translationY: 0 }, true); await settle(); });
  assert.equal(renderer.root.findAllByProps({ accessibilityLabel: "Cancel reply" }).length, 0);
  assert.equal(renderer.root.findByType("TextInput").props.value, "Keep my draft");
  assert.ok(renderer.root.findAllByType("Text").some(node => String(node.props.children).includes("was removed")));
});
