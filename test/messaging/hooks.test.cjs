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
  const value = useChat({
    conversationId: room,
    currentUser: { id: "me", token: "token" },
    isFocused: focused,
  });
  React.useLayoutEffect(() => {
    chat = value;
  }, [value]);
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
test("visibility reads immediately for received visible messages; blurred and old-room callbacks cannot read", async () => {
  await messageStore.saveMany([row(1), row(2), row(3, { senderId: "me" })]);
  await mount();
  await act(async () => {
    chat.markVisibleRead([row(1).localId, row(3).localId]);
    await settle();
  });
  assert.equal((await messageStore.getById(row(1).id)).status, "READ");
  assert.equal((await messageStore.getById(row(2).id)).status, "SENT");
  assert.equal((await messageStore.getById(row(3).id)).status, "SENT");
  await act(async () =>
    renderer.update(React.createElement(Probe, { focused: false })),
  );
  chat.markVisibleRead([row(2).localId]);
  await act(async () => {
    renderer.update(React.createElement(Probe, { room: "other-room" }));
    await settle();
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

test("visible messages are replayed on focus without a touch or a new viewability callback", async () => {
  await messageStore.save(row(1));
  server.failure = new Error("offline");
  await mount({ focused: false });
  chat.markVisibleRead([row(1).localId]);
  await settle();
  assert.equal((await messageStore.getById(row(1).id)).status, "SENT");
  await act(async () => {
    renderer.update(React.createElement(Probe, { focused: true }));
    await settle();
  });
  assert.equal((await messageStore.getById(row(1).id)).status, "READ");
  assert.equal((await receiptQueue.getBatch("READ")).length, 1);
});
test("foreground return replays the existing visible viewport without waiting for network or interaction", async () => {
  await messageStore.save(row(1));
  server.failure = new Error("offline");
  await mount();
  appState.change("background");
  chat.markVisibleRead([row(1).id]);
  await settle();
  assert.equal((await messageStore.getById(row(1).id)).status, "SENT");
  await act(async () => {
    appState.change("active");
    await settle();
  });
  assert.equal((await messageStore.getById(row(1).id)).status, "READ");
});
test("an early viewport report before session effects is not lost", async () => {
  await messageStore.save(row(1));
  server.failure = new Error("offline");
  function EarlyView({ value }) {
    const mark = value.markVisibleRead;
    React.useLayoutEffect(() => {
      mark([row(1).localId]);
    }, [mark]);
    return null;
  }
  function Parent() {
    const value = useChat({
      conversationId: "room",
      currentUser: { id: "me", token: "token" },
      isFocused: true,
    });
    React.useLayoutEffect(() => {
      chat = value;
    }, [value]);
    return React.createElement(EarlyView, { value });
  }
  await act(async () => {
    renderer = create(React.createElement(Parent));
    await settle();
  });
  assert.equal((await messageStore.getById(row(1).id)).status, "READ");
});
test("rows committed after their viewport report are read immediately without another scroll event", async () => {
  server.failure = new Error("offline");
  await mount();
  chat.markVisibleRead([row(22).localId]);
  await act(async () => {
    await messageStore.saveReceived(row(22), () => true, "me");
    await settle();
  });
  assert.equal((await messageStore.getById(row(22).id)).status, "READ");
});
test("rapid duplicate visibility reports start one immediate durable read transaction", async () => {
  await messageStore.save(row(1));
  server.failure = new Error("offline");
  await mount();
  const original = messageStore.markVisibleReadIds;
  let calls = 0;
  messageStore.markVisibleReadIds = function (...args) {
    calls++;
    return original.apply(this, args);
  };
  try {
    await act(async () => {
      chat.markVisibleRead([row(1).localId]);
      assert.equal(
        calls,
        1,
        "the write starts in this event, not after a timeout",
      );
      for (let i = 0; i < 10; i++) chat.markVisibleRead([row(1).localId]);
      await settle();
    });
    assert.equal(calls, 1);
    assert.equal((await receiptQueue.getBatch("READ")).length, 1);
    assert.equal(
      server.calls.some((call) => /\/read$/.test(call.path)),
      false,
      "never mark unseen conversation messages read via REST",
    );
  } finally {
    messageStore.markVisibleReadIds = original;
  }
});
test("a far cached reply target extends loaded history without dropping current messages", async () => {
  await messageStore.saveMany(
    Array.from({ length: 550 }, (_, index) => row(index)),
  );
  server.failure = new Error("offline");
  await mount();
  const latest = chat.messages.at(-1).id;
  await act(async () => {
    const result = await chat.loadReplyTarget(row(5).id, () => true);
    assert.equal(result.complete, false);
  });
  assert.equal(chat.messages[0].id, row(5).id);
  assert.equal(chat.messages.at(-1).id, latest);
  assert.equal(chat.messages.length, 545);
  assert.equal(new Set(chat.messages.map((row) => row.id)).size, 545);
});

test("native modal coverage gates otherwise visible messages until the chat is uncovered", async () => {
  await messageStore.save(row(1));
  server.failure = new Error("offline");
  let covered = true;
  const canRead = () => !covered;
  function CoveredProbe() {
    const value = useChat({
      conversationId: "room",
      currentUser: { id: "me", token: "token" },
      isFocused: true,
      canRead,
    });
    React.useLayoutEffect(() => {
      chat = value;
    }, [value]);
    return null;
  }
  await act(async () => {
    renderer = create(React.createElement(CoveredProbe));
    await settle();
  });
  await act(async () => {
    chat.markVisibleRead([row(1).id]);
    await settle();
  });
  assert.equal((await messageStore.getById(row(1).id)).status, "SENT");
  covered = false;
  await act(async () => {
    chat.markVisibleRead([row(1).id]);
    await settle();
  });
  assert.equal((await messageStore.getById(row(1).id)).status, "READ");
});

test("old cached rows recover real author names from the existing persisted participant roster offline", async () => {
  await roomStore.upsertRoom({
    id: "room",
    conversationId: "room",
    name: "Group",
    avatarUrl: "",
    lastMessage: "",
    lastMessageType: "TEXT",
    lastMessageTimestamp: 0,
    unreadCount: 0,
    cachedAt: 1,
    updatedAt: 1,
    isGroup: true,
    participantsData: JSON.stringify([
      {
        id: "other",
        username: "yuki",
        displayName: "Yuki Tanaka",
        avatarUrl: "https://cdn.test/yuki.jpg",
      },
    ]),
  });
  await messageStore.save(row(1));
  server.failure = new Error("offline");
  await mount();
  assert.equal(
    JSON.parse(chat.messages[0].senderData).displayName,
    "Yuki Tanaka",
  );
});

test("an unloaded original's edit/delete updates only its loaded reply previews and stays redacted offline", async () => {
  const original = row(1, { content: "old original" });
  const quote = JSON.stringify({
    id: original.id,
    content: original.content,
    senderId: "other",
    type: "TEXT",
  });
  await messageStore.saveMany([
    original,
    ...Array.from({ length: 80 }, (_, index) =>
      row(index + 2, {
        repliedToId: index === 79 ? original.id : null,
        replyData: index === 79 ? quote : null,
      }),
    ),
  ]);
  server.failure = new Error("offline");
  await mount();
  assert.equal(
    chat.messages.some((message) => message.id === original.id),
    false,
  );
  await act(async () => {
    await messageStore.editText(original.id, "edited original");
    await settle();
  });
  const reply = chat.messages.at(-1);
  assert.equal(JSON.parse(reply.replyData).content, "edited original");
  await act(async () => {
    await messageStore.deleteOne(original.id);
    await settle();
  });
  assert.equal(JSON.parse(chat.messages.at(-1).replyData).deleted, true);
  assert.equal(
    JSON.parse((await messageStore.getById(reply.id)).replyData).content,
    "",
  );
});

test("a cached unloaded media original supplies a real thumbnail/duration without inserting it into visible history", async () => {
  const original = row(1, {
    type: "VIDEO",
    thumbnailUrl: "https://cdn.test/original.jpg",
    duration: 47,
  });
  await messageStore.saveMany([
    original,
    ...Array.from({ length: 80 }, (_, i) =>
      row(i + 2, { repliedToId: i === 0 || i === 79 ? original.id : null }),
    ),
  ]);
  server.failure = new Error("offline");
  await mount();
  assert.equal(
    chat.messages.some((row) => row.id === original.id),
    false,
  );
  const quote = JSON.parse(chat.messages.at(-1).replyData);
  assert.equal(quote.type, "VIDEO");
  assert.equal(quote.duration, 47);
  assert.equal(quote.thumbnailUrl, original.thumbnailUrl);
  await act(async () => {
    await chat.loadReplyTarget(original.id, () => true);
  });
  await act(async () => {
    await messageStore.deleteOne(original.id);
    await settle();
  });
  assert.equal(
    JSON.parse(
      chat.messages.find((message) => message.id === row(2).id).replyData,
    ).deleted,
    true,
  );
});

test("a pending quote hydration cannot repopulate a conversation after deletion", async () => {
  const original = row(1),
    response = deferred(),
    get = messageStore.getByIds;
  await messageStore.saveMany([
    original,
    ...Array.from({ length: 80 }, (_, i) =>
      row(i + 2, { repliedToId: i === 79 ? original.id : null }),
    ),
  ]);
  server.failure = new Error("offline");
  messageStore.getByIds = (...args) =>
    args[1].includes(original.id)
      ? response.promise
      : get.apply(messageStore, args);
  try {
    await mount();
    await act(async () => {
      await messageStore.deleteRoom("room");
      response.resolve([original]);
      await settle();
    });
    assert.equal(chat.messages.length, 0);
  } finally {
    messageStore.getByIds = get;
    response.resolve([]);
  }
});

test("a receipt for an unloaded reply cannot hydrate it into the current timeline or create a history gap", async () => {
  await messageStore.saveMany(
    Array.from({ length: 90 }, (_, i) =>
      row(i, { repliedToId: i === 2 ? row(1).id : null }),
    ),
  );
  server.failure = new Error("offline");
  await mount();
  const before = chat.messages.map((row) => row.id);
  await act(async () => {
    await messageStore.markRead(row(2).id, "room");
    await settle();
  });
  assert.deepEqual(
    chat.messages.map((row) => row.id),
    before,
  );
  assert.equal(
    chat.messages.some((message) => message.id === row(2).id),
    false,
  );
});
