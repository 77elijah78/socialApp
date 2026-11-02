const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const { act, create } = require("react-test-renderer");
const { row, mock, scrolls, resetScrolls } = require("./harness.cjs");
let rendered = [];
function MessageCard(props) {
  rendered.push(props);
  return React.createElement("MessageCard", props);
}
mock("@/components/messages/MessageCard", MessageCard);
const noop = () => {};
const asyncNoop = async () => {};
const chat = {
  messages: [],
  send: asyncNoop,
  replyMsg: asyncNoop,
  retry: asyncNoop,
  sendMedia: asyncNoop,
  onTyping: noop,
  markVisibleRead: noop,
  isTyping: false,
  isSyncing: false,
  isLoadingMore: false,
  isOffline: false,
  syncError: null,
  paginationError: null,
  loadMore: asyncNoop,
  hasMore: true,
  refresh: asyncNoop,
  releaseHistory: noop,
};
mock("@/hooks/useChat", { useChat: () => chat });
const PrivateRoom = require("../../src/app/(chatRoom)/privateRoom.tsx").default;
let renderer;
const list = () => renderer.root.findByType("FlatList");
const scrollEvent = (y) => ({
  nativeEvent: {
    contentOffset: { x: 0, y },
    layoutMeasurement: { height: 550, width: 390 },
    contentSize: { height: 2000, width: 390 },
  },
});
beforeEach(() => {
  rendered = [];
  resetScrolls();
  chat.messages = Array.from({ length: 30 }, (_, i) => row(i));
});
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
  renderer = null;
});
async function mount() {
  await act(async () => {
    renderer = create(React.createElement(PrivateRoom));
  });
}

test("actual screen has one in-flow composer below an inverted measured list, with no hidden first paint", async () => {
  await mount();
  const avoider = renderer.root.findByType("KeyboardAvoidingView");
  assert.equal(avoider.props.enabled, true);
  assert.equal(avoider.findAllByProps({ testID: "chat-composer" }).length, 1);
  const composer = avoider.findByProps({ testID: "chat-composer" });
  assert.notEqual(composer.props.style.position, "absolute");
  assert.equal(list().props.inverted, true);
  assert.equal(list().props.style.opacity, undefined);
  assert.equal(list().props.data[0].message.id, row(29).id);
  await act(async () => {
    list().props.onContentSizeChange(390, 2200);
  });
  assert.equal(scrolls.length, 0);
  await act(async () => {
    list().props.onLayout({ nativeEvent: { layout: { height: 550 } } });
  });
  assert.deepEqual(scrolls, [{ offset: 0, animated: false }]);
});
test("new messages and keyboard layout stick only at latest, not while reading older history", async () => {
  await mount();
  await act(async () => {
    list().props.onLayout({ nativeEvent: { layout: { height: 550 } } });
    list().props.onContentSizeChange(390, 2200);
  });
  resetScrolls();
  chat.messages = [...chat.messages, row(30)];
  await act(async () => {
    renderer.update(React.createElement(PrivateRoom));
  });
  await act(async () => {
    list().props.onContentSizeChange(390, 2300);
  });
  assert.equal(scrolls.length, 1);
  await act(async () => {
    list().props.onScrollBeginDrag();
    list().props.onScroll(scrollEvent(500));
    list().props.onScrollEndDrag(scrollEvent(500));
  });
  resetScrolls();
  chat.messages = [...chat.messages, row(31)];
  await act(async () => {
    renderer.update(React.createElement(PrivateRoom));
    list().props.onContentSizeChange(390, 2400);
    list().props.onLayout({ nativeEvent: { layout: { height: 300 } } });
  });
  assert.equal(scrolls.length, 0);
});
test("typing does not render message rows; one receipt renders just one representative row", async () => {
  await mount();
  rendered = [];
  const input = renderer.root.findByType("TextInput");
  for (let i = 0; i < 10; i++)
    await act(async () => {
      input.props.onChangeText(`typing ${i}`);
    });
  assert.equal(rendered.length, 0);
  chat.messages = chat.messages.map((message, index) =>
    index === 15 ? { ...message, status: "READ", isRead: true } : message,
  );
  await act(async () => {
    renderer.update(React.createElement(PrivateRoom));
  });
  assert.equal(rendered.length, 1);
  assert.equal(rendered[0].message, "Message 15");
});
test("pagination indicator stays outside list content and read divider is stable after read receipt", async () => {
  await mount();
  const before = list().props.data.find((item) => item.kind === "unread").id;
  chat.messages = chat.messages.map((message) => ({
    ...message,
    status: "READ",
    isRead: true,
  }));
  chat.isLoadingMore = true;
  await act(async () => {
    renderer.update(React.createElement(PrivateRoom));
  });
  assert.equal(
    list().props.data.find((item) => item.kind === "unread").id,
    before,
  );
  assert.equal(list().props.ListHeaderComponent, undefined);
  assert.equal(list().props.ListFooterComponent, undefined);
  chat.isLoadingMore = false;
});
test("Android uses the same single controller KAV because KeyboardProvider owns IME insets", async () => {
  const { native } = require("./harness.cjs");
  native.Platform.OS = "android";
  try {
    await mount();
    const avoider = renderer.root.findByType("KeyboardAvoidingView");
    assert.equal(avoider.props.enabled, true);
    assert.equal(avoider.props.behavior, "padding");
  } finally {
    native.Platform.OS = "ios";
  }
});
test("composer accepts a second draft while the first acknowledgement is pending without double-tap duplicates", async () => {
  const { deferred } = require("./harness.cjs");
  const pending = deferred();
  const sent = [];
  const original = chat.send;
  chat.send = (text) => {
    sent.push(text);
    return pending.promise;
  };
  try {
    await mount();
    await act(async () => {
      renderer.root.findByType("TextInput").props.onChangeText("first");
    });
    const firstButton = renderer.root.findByProps({
      accessibilityLabel: "Send message",
    });
    await act(async () => {
      firstButton.props.onPress();
      firstButton.props.onPress();
    });
    await act(async () => {
      renderer.root.findByType("TextInput").props.onChangeText("second");
    });
    await act(async () => {
      renderer.root
        .findByProps({ accessibilityLabel: "Send message" })
        .props.onPress();
    });
    assert.deepEqual(sent, ["first", "second"]);
    await act(async () => {
      pending.resolve();
    });
  } finally {
    chat.send = original;
  }
});
