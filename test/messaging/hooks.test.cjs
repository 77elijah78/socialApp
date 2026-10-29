const { test, before, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const { act, create } = require("react-test-renderer");
const {
  row,
  remote,
  deferred,
  settle,
  installServer,
  appState,
} = require("./harness.cjs");
const { runMigrations } = require("../../src/db/migrations.ts");
const { messageStore } = require("../../src/db/MessageStore.ts");
const { roomStore } = require("../../src/db/RoomStore.ts");
const { syncStateStore } = require("../../src/db/syncStateStore.ts");
const { receiptQueue } = require("../../src/db/receiptQueue.ts");
const {
  clearRecentMessageCache,
} = require("../../src/utils/recentMessageCache.ts");
const { useChat } = require("../../src/hooks/useChat.ts");
const { mediaService } = require("../../src/services/MediaService.ts");
const { socketReceiver } = require("../../src/services/SocketReceiver.ts");
let renderer, chat, server;
function Probe({ room = "room", focused = true }) {
  chat = useChat({
    conversationId: room,
    currentUser: { id: "me", token: "token" },
    isFocused: focused,
  });
  return null;
}
async function mount(props) {
  await act(async () => {
    renderer = create(React.createElement(Probe, props));
    await settle();
  });
}
before(async () => {
  await runMigrations();
});
beforeEach(async () => {
  mediaService.message.resetSession();
  mediaService.message.setAuthToken("token");
  mediaService.disconnectSocket();
  await messageStore.deleteAll();
  await roomStore.deleteAll();
  await receiptQueue.clear();
  await syncStateStore.clear();
  clearRecentMessageCache();
  server = installServer();
  appState.currentState = "active";
});
afterEach(async () => {
  if (renderer)
    await act(async () => {
      renderer.unmount();
    });
  renderer = null;
});

test("cached conversation and multiple cached pages remain available offline and after reopen", async () => {
  await messageStore.saveMany(Array.from({ length: 101 }, (_, i) => row(i)));
  server.failure = new Error("offline");
  await mount();
  assert.equal(chat.messages.length, 30);
  assert.equal(chat.messages.at(-1).id, row(100).id);
  assert.ok(chat.syncError);
  for (let page = 0; page < 3; page++)
    await act(async () => {
      await chat.loadMore();
    });
  assert.equal(chat.messages.length, 101);
  assert.equal(new Set(chat.messages.map((item) => item.id)).size, 101);
  await act(async () => {
    renderer.unmount();
  });
  renderer = null;
  clearRecentMessageCache();
  await mount();
  assert.equal(chat.messages.length, 30);
  assert.equal(chat.messages.at(-1).id, row(100).id);
});
test("uncached initial network load paints the latest page", async () => {
  server.messages = Array.from({ length: 72 }, (_, i) => remote(i));
  await mount();
  assert.equal(chat.messages.length, 30);
  assert.equal(chat.messages.at(-1).id, row(71).id);
  assert.equal(chat.isSyncing, false);
});
test("send, edit, receipt and delete do not truncate already-loaded history", async () => {
  const history = Array.from({ length: 121 }, (_, i) => row(i));
  await messageStore.saveMany(history);
  server.messages = history.map((item) =>
    remote(Number(item.localId.slice(3))),
  );
  await mount();
  await act(async () => {
    await chat.loadMore();
    await chat.loadMore();
  });
  assert.equal(chat.messages.length, 90);
  const first = chat.messages[0].localId;
  await act(async () => {
    await chat.send("optimistic send", "other");
  });
  assert.equal(chat.messages.length, 91);
  assert.equal(chat.messages[0].localId, first);
  await act(async () => {
    await messageStore.editText(history[90].id, "edited");
    await messageStore.markRead(history[91].id, "room");
  });
  assert.equal(chat.messages.length, 91);
  assert.equal(
    chat.messages.find((item) => item.id === history[90].id).content,
    "edited",
  );
  await act(async () => {
    await messageStore.deleteOne(history[92].id);
  });
  assert.equal(chat.messages.length, 90);
  assert.equal(chat.messages[0].localId, first);
});
test("overlapping pagination requests use one cursor; a failure can safely retry", async () => {
  server.messages = Array.from({ length: 100 }, (_, i) => remote(i));
  await mount();
  server.failure = new Error("offline");
  const before = server.calls.length;
  await act(async () => {
    await Promise.all([chat.loadMore(), chat.loadMore(), chat.loadMore()]);
  });
  assert.equal(server.calls.length - before, 1);
  assert.ok(chat.paginationError);
  assert.equal(chat.hasMore, true);
  assert.equal(chat.isLoadingMore, false);
  server.failure = null;
  await act(async () => {
    await Promise.all([chat.loadMore(), chat.loadMore()]);
  });
  assert.equal(chat.messages.length, 60);
  assert.equal(chat.paginationError, null);
  assert.equal(server.calls.at(-1).path, server.calls.at(-2).path);
});
test("late old-room initialization and pagination never paint the new room", async () => {
  const pending = deferred();
  const original = messageStore.getRecent.bind(messageStore);
  messageStore.getRecent = (room, ...args) =>
    room === "old-room" ? pending.promise : original(room, ...args);
  try {
    await messageStore.save(row(1, { conversationId: "new-room" }));
    await mount({ room: "old-room" });
    await act(async () => {
      renderer.update(React.createElement(Probe, { room: "new-room" }));
      await settle();
    });
    assert.equal(chat.messages[0].conversationId, "new-room");
    await act(async () => {
      pending.resolve([row(9, { conversationId: "old-room" })]);
      await settle();
    });
    assert.equal(chat.messages.length, 1);
    assert.equal(chat.messages[0].conversationId, "new-room");
  } finally {
    messageStore.getRecent = original;
  }
});
test("visibility reads only received visible messages; blur and room changes cancel timers", async () => {
  await messageStore.saveMany([row(1), row(2), row(3, { senderId: "me" })]);
  await mount();
  await act(async () => {
    chat.markVisibleRead([row(1).localId, row(3).localId]);
    await new Promise((done) => setTimeout(done, 280));
  });
  assert.equal((await messageStore.getById(row(1).id)).status, "READ");
  assert.equal((await messageStore.getById(row(2).id)).status, "SENT");
  assert.equal((await messageStore.getById(row(3).id)).status, "SENT");
  chat.markVisibleRead([row(2).localId]);
  await act(async () => {
    renderer.update(React.createElement(Probe, { room: "other-room" }));
  });
  await act(async () => {
    await new Promise((done) => setTimeout(done, 280));
  });
  assert.equal((await messageStore.getById(row(2).id)).status, "SENT");
});
test("typing is room filtered, listeners clean up, background app cannot generate reads", async () => {
  await messageStore.save(row(1));
  await mount();
  await act(async () => {
    socketReceiver.emit("typing:start", {
      conversationId: "another",
      userId: "other",
    });
  });
  assert.equal(chat.isTyping, false);
  await act(async () => {
    socketReceiver.emit("typing:start", {
      conversationId: "room",
      userId: "other",
    });
  });
  assert.equal(chat.isTyping, true);
  appState.currentState = "background";
  chat.markVisibleRead([row(1).id]);
  await settle();
  assert.equal((await receiptQueue.getBatch("READ")).length, 0);
  await act(async () => {
    renderer.unmount();
  });
  renderer = null;
  assert.equal(socketReceiver.listeners.get("typing:start"), undefined);
});
test("reconnect catches up through store events without discarding history", async () => {
  await messageStore.saveMany(Array.from({ length: 100 }, (_, i) => row(i)));
  server.failure = new Error("offline");
  await mount();
  await act(async () => {
    await chat.loadMore();
  });
  const oldest = chat.messages[0].id;
  server.failure = null;
  server.messages = Array.from({ length: 150 }, (_, i) => remote(i));
  await act(async () => {
    socketReceiver.emit("connect");
    await settle();
  });
  assert.equal(chat.messages.at(-1).id, row(149).id);
  assert.equal(chat.messages[0].id, oldest);
  assert.equal(
    new Set(chat.messages.map((item) => item.id)).size,
    chat.messages.length,
  );
});
test("deletion in a mounted background room does not navigate the active screen away", async () => {
  const { router } = require("expo-router");
  const back = router.back;
  let navigations = 0;
  router.back = () => navigations++;
  server.failure = new Error("offline");
  try {
    await mount({ focused: false });
    socketReceiver.emit("conversation:deleted", { conversationId: "room" });
    assert.equal(navigations, 0);
    await act(async () =>
      renderer.update(React.createElement(Probe, { focused: true })),
    );
    socketReceiver.emit("conversation:deleted", { conversationId: "room" });
    assert.equal(navigations, 1);
  } finally {
    router.back = back;
  }
});
