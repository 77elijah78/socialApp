const { test, before, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const {
  row,
  remote,
  installServer,
  sockets,
  settle,
  deferred,
} = require("./harness.cjs");
const { runMigrations } = require("../../src/db/migrations.ts");
const { messageStore } = require("../../src/db/MessageStore.ts");
const { roomStore } = require("../../src/db/RoomStore.ts");
const { receiptQueue } = require("../../src/db/receiptQueue.ts");
const { SocketReceiver } = require("../../src/services/SocketReceiver.ts");
let receiver, socket, server;
before(async () => {
  await runMigrations();
});
beforeEach(async () => {
  await messageStore.deleteAll();
  await roomStore.deleteAll();
  await receiptQueue.clear();
  server = installServer();
  receiver = new SocketReceiver("https://example.test");
  receiver.connect("me", "token");
  socket = sockets.at(-1);
});
afterEach(() => receiver.disconnect());
test("duplicate new + notification persist once without downgrading READ or incrementing unread twice", async () => {
  await messageStore.save(row(1, { status: "READ", isRead: true }));
  socket.receive("connect");
  socket.receive("message:new", remote(1));
  socket.receive("message:notification", remote(1));
  await settle();
  const rows = await messageStore.getRecent("room");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, "READ");
  assert.equal((await roomStore.getAllRooms())[0].unreadCount, 0);
});
test("offline visibility receipts are replayed and retained until server echo acknowledgement", async () => {
  await messageStore.save(row(1));
  await messageStore.markVisibleReadIds([row(1).id], "room", "me");
  assert.equal((await receiptQueue.getBatch("READ")).length, 1);
  socket.receive("connect");
  await settle();
  assert.ok(
    socket.emitted.some(
      (event) =>
        event.event === "message:read" && event.data.messageId === row(1).id,
    ),
  );
  assert.equal((await receiptQueue.getBatch("READ")).length, 1);
  socket.receive("message:read", {
    userId: "me",
    messageId: row(1).id,
    conversationId: "room",
  });
  await settle();
  assert.equal((await receiptQueue.getBatch("READ")).length, 0);
});
test("idless and self-read events cannot mark outgoing messages read; explicit recipient receipt can", async () => {
  await messageStore.save(row(1, { senderId: "me" }));
  socket.receive("message:read", { userId: "me", conversationId: "room" });
  await settle();
  assert.equal((await messageStore.getById(row(1).id)).status, "SENT");
  socket.receive("message:read", { userId: "other", conversationId: "room" });
  await settle();
  assert.equal((await messageStore.getById(row(1).id)).status, "SENT");
  socket.receive("message:read", {
    userId: "me",
    messageId: row(1).id,
    conversationId: "room",
  });
  await settle();
  assert.equal((await messageStore.getById(row(1).id)).status, "SENT");
  socket.receive("message:read", {
    userId: "other",
    messageId: row(1).id,
    conversationId: "room",
  });
  await settle();
  assert.equal((await messageStore.getById(row(1).id)).status, "READ");
});
test("pending delivery uses acknowledged batches beyond 200 and updates persisted state", async () => {
  const pending = Array.from({ length: 245 }, (_, i) => remote(i));
  server.response = async (url, options) => {
    if (url.includes("/pending/delivery"))
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: pending.slice(0, 200) }),
      };
    const ids = JSON.parse(options.body).messageIds;
    for (const id of ids) {
      const index = pending.findIndex((message) => message.id === id);
      if (index >= 0) pending.splice(index, 1);
    }
    return { ok: true, status: 200, json: async () => ({ success: true }) };
  };
  socket.connected = true;
  await receiver.syncPendingDelivery();
  assert.equal((await messageStore.getByRoom("room")).length, 245);
  assert.equal(pending.length, 0);
});
test("old-account pending response cannot populate a new account cache", async () => {
  const pending = deferred();
  server.response = () => pending.promise;
  socket.connected = true;
  const sync = receiver.syncPendingDelivery();
  await settle();
  receiver.disconnect();
  pending.resolve({
    ok: true,
    status: 200,
    json: async () => ({ data: [remote(1)] }),
  });
  await sync;
  assert.equal((await messageStore.getRecent("room")).length, 0);
});
test("overlapping screens retain a room until the last subscriber leaves; new accounts never rejoin old rooms", async () => {
  socket.connected = true;
  const releaseA = receiver.retainRoom("room");
  const releaseB = receiver.retainRoom("room");
  releaseA();
  assert.equal(
    socket.emitted.filter((event) => event.event === "conversation:leave")
      .length,
    0,
  );
  releaseB();
  assert.equal(
    socket.emitted.filter((event) => event.event === "conversation:leave")
      .length,
    1,
  );
  receiver.retainRoom("old-user-room");
  receiver.connect("new-user", "new-token");
  const newSocket = sockets.at(-1);
  newSocket.receive("connect");
  await settle();
  assert.equal(
    newSocket.emitted.filter((event) => event.event === "conversation:join")
      .length,
    0,
  );
});
test("a receipt arriving before REST confirmation waits for canonical local identity", async () => {
  const release = messageStore.beginOutgoing("me");
  await messageStore.save(
    row(1, {
      localId: "optimistic",
      id: "optimistic",
      senderId: "me",
      status: "SENDING",
    }),
  );
  socket.receive("message:read", {
    userId: "other",
    messageId: "confirmed-id",
    conversationId: "room",
  });
  await settle();
  await messageStore.confirm("optimistic", "confirmed-id");
  release();
  await settle();
  assert.equal((await messageStore.getByLocalId("optimistic")).status, "READ");
});
test("a notification paused after message persistence cannot recreate a deleted conversation summary", async () => {
  const original = roomStore.findRoom;
  const pending = deferred();
  let calls = 0;
  roomStore.findRoom = function (...args) {
    return ++calls === 1 ? pending.promise : original.apply(this, args);
  };
  try {
    socket.receive("message:notification", remote(1));
    await settle();
    assert.equal(calls, 1);
    socket.receive("conversation:deleted", { conversationId: "room" });
    await settle();
    pending.resolve([]);
    await settle();
    assert.equal((await roomStore.getAllRooms()).length, 0);
    assert.equal((await messageStore.getRecent("room")).length, 0);
  } finally {
    roomStore.findRoom = original;
    pending.resolve([]);
  }
});

test("an existing outgoing receipt updates while an unrelated upload is still pending", async () => {
  await messageStore.save(row(1, { senderId: "me" }));
  const release = messageStore.beginOutgoing("me");
  try {
    socket.receive("message:read", {
      userId: "other",
      conversationId: "room",
      messageId: row(1).id,
    });
    await settle();
    assert.equal(
      (await messageStore.getById(row(1).id)).status,
      "READ",
      "must not wait for the other outgoing request",
    );
  } finally {
    release();
  }
});
test("delivery, visibility read, and read-replay stay distinct without duplicate online emissions", async () => {
  await messageStore.saveMany([row(1), row(2)]);
  socket.receive("connect");
  await settle();
  receiver.emitMessageDelivered("room", row(1).id);
  await settle();
  assert.equal((await messageStore.getById(row(1).id)).status, "DELIVERED");
  assert.equal((await receiptQueue.getBatch("READ")).length, 0);
  await messageStore.markVisibleReadIds([row(1).id], "room", "me");
  receiver.emitMessageRead("room", row(1).id);
  await settle();
  for (let i = 0; i < 4; i++) await receiver.flushReceipts();
  receiver.emitMessageDelivered("room", row(2).id);
  await settle();
  assert.equal(
    socket.emitted.filter((event) => event.event === "message:read").length,
    1,
  );
  assert.equal(
    (await receiptQueue.getBatch("READ")).length,
    1,
    "legacy server has not acknowledged it",
  );
  socket.receive("disconnect");
  socket.receive("connect");
  await settle();
  assert.equal(
    socket.emitted.filter((event) => event.event === "message:read").length,
    2,
    "reconnect replays the durable unconfirmed receipt once",
  );
});
test("another group member's receipt cannot mark my incoming messages read; any reader can read my outgoing", async () => {
  await messageStore.saveMany([row(1), row(2, { senderId: "me" })]);
  socket.receive("message:read", {
    userId: "third-member",
    conversationId: "room",
    messageId: row(1).id,
  });
  socket.receive("message:read", {
    userId: "third-member",
    conversationId: "room",
    messageId: row(2).id,
  });
  await settle();
  assert.equal((await messageStore.getById(row(1).id)).isRead, false);
  assert.equal((await messageStore.getById(row(1).id)).status, "SENT");
  assert.equal((await messageStore.getById(row(2).id)).status, "READ");
});
test("pending status applies to its canonical ID without waiting for other outstanding sends", async () => {
  const releaseA = messageStore.beginOutgoing("me"),
    releaseB = messageStore.beginOutgoing("me");
  await messageStore.save(
    row(1, {
      id: "temporary",
      localId: "stable",
      senderId: "me",
      status: "SENDING",
    }),
  );
  try {
    socket.receive("message:read", {
      userId: "other",
      messageId: "confirmed",
      conversationId: "room",
    });
    socket.receive("message:delivered", {
      userId: "other",
      messageId: "confirmed",
      conversationId: "room",
    });
    await settle();
    await messageStore.confirm("stable", "confirmed");
    await settle();
    assert.equal((await messageStore.getByLocalId("stable")).status, "READ");
  } finally {
    releaseA();
    releaseB();
  }
});
test("socket refresh/disconnect removes its store subscription instead of accumulating listeners", async () => {
  const count = messageStore.subscribers.size;
  receiver.connect("me", "refreshed-token");
  assert.equal(messageStore.subscribers.size, count);
  receiver.connect("me", "another-token");
  assert.equal(messageStore.subscribers.size, count);
  receiver.disconnect();
  assert.equal(messageStore.subscribers.size, count - 1);
});

test("slow delivery HTTP cannot block an immediate visibility read over the existing socket", async () => {
  const response = deferred();
  let deliveryStarted = false;
  server.response = async (url) => {
    if (url.includes("/messages/delivered")) {
      deliveryStarted = true;
      return response.promise;
    }
    return { ok: true, status: 200, json: async () => ({ data: [] }) };
  };
  await messageStore.save(row(1));
  socket.receive("connect");
  await settle();
  receiver.emitMessageDelivered("room", row(1).id);
  await settle();
  assert.equal(deliveryStarted, true);
  try {
    await messageStore.markVisibleReadIds([row(1).id], "room", "me");
    receiver.emitMessageRead("room", row(1).id);
    await settle();
    assert.equal(
      socket.emitted.filter((event) => event.event === "message:read").length,
      1,
    );
  } finally {
    response.resolve({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    });
    await settle();
  }
});
