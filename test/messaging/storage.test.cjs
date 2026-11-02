const { test, before, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const {
  row,
  remote,
  installServer,
  metrics,
  deferred,
  settle,
} = require("./harness.cjs");
const { runMigrations } = require("../../src/db/migrations.ts");
const { messageStore } = require("../../src/db/MessageStore.ts");
const { roomStore } = require("../../src/db/RoomStore.ts");
const { receiptQueue } = require("../../src/db/receiptQueue.ts");
const { syncStateStore } = require("../../src/db/syncStateStore.ts");
const { MessageService } = require("../../src/services/MessageService.ts");
const { cursorFor } = require("../../src/utils/messaging/timeline.ts");
let service, server;
before(async () => {
  await runMigrations();
});
beforeEach(async () => {
  await messageStore.deleteAll();
  await roomStore.deleteAll();
  await receiptQueue.clear();
  await syncStateStore.clear();
  service = new MessageService("https://example.test/api/v1", "test-token");
  server = installServer();
});
test("SQLite tie cursor traverses several pages without omissions or duplicates offline", async () => {
  const rows = Array.from({ length: 117 }, (_, i) =>
    row(i, { timestamp: 1700000000000 }),
  );
  await messageStore.saveMany(rows);
  let page = await messageStore.getRecent("room", 30);
  const loaded = [...page];
  while (page.length) {
    page = await messageStore.getOlderThan("room", cursorFor(page[0]), 20);
    loaded.unshift(...page);
  }
  assert.equal(loaded.length, 117);
  assert.equal(new Set(loaded.map((item) => item.id)).size, 117);
  assert.equal(server.calls.length, 0);
  assert.equal(
    metrics.prepared,
    metrics.finalized,
    "all async native statements are finalized",
  );
});
test("optimistic message is observable before POST resolves; confirmed and synced localId stays stable", async () => {
  server.pendingPost = deferred();
  const observed = [];
  const unsub = messageStore.subscribe((event) => {
    if (event.type === "upsert") observed.push(...event.rows);
  });
  const sending = service.send("hello", {
    senderId: "me",
    receiverId: "other",
    conversationId: "room",
  });
  await settle();
  assert.equal(observed[0].status, "SENDING");
  const localId = observed[0].localId;
  server.pendingPost.resolve({
    ok: true,
    status: 200,
    json: async () => ({
      data: { id: "server-id", createdAt: new Date().toISOString() },
    }),
  });
  await sending;
  await messageStore.saveMany([
    row(1, {
      localId: "server-id",
      id: "server-id",
      senderId: "me",
      status: "DELIVERED",
    }),
  ]);
  const persisted = await messageStore.getRecent("room");
  assert.equal(persisted.length, 1);
  assert.equal(persisted[0].localId, localId);
  assert.equal(persisted[0].status, "DELIVERED");
  unsub();
});
test("own echo before REST response waits for identity reconciliation instead of duplicating", async () => {
  server.pendingPost = deferred();
  const sending = service.send("hello", {
    senderId: "me",
    receiverId: "other",
    conversationId: "room",
  });
  await settle();
  const optimistic = (await messageStore.getRecent("room"))[0];
  const receiving = messageStore.saveReceived(
    row(1, { localId: "server-id", id: "server-id", senderId: "me" }),
  );
  await settle();
  assert.equal((await messageStore.getRecent("room")).length, 1);
  server.pendingPost.resolve({
    ok: true,
    status: 200,
    json: async () => ({
      data: { id: "server-id", createdAt: new Date().toISOString() },
    }),
  });
  await Promise.all([sending, receiving]);
  const rows = await messageStore.getRecent("room");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].localId, optimistic.localId);
});
test("failed reply retry reuses row and payload; concurrent retry emits one POST", async () => {
  server.failure = new Error("offline");
  await assert.rejects(
    service.replyMessage(
      "reply",
      { senderId: "me", receiverId: "other", conversationId: "room" },
      "original",
    ),
  );
  const failed = (await messageStore.getRecent("room"))[0];
  assert.equal(failed.status, "FAILED");
  server.failure = null;
  await Promise.all([
    service.retry("room", failed.localId, {
      senderId: "me",
      receiverId: "other",
    }),
    service.retry("room", failed.localId, {
      senderId: "me",
      receiverId: "other",
    }),
  ]);
  const rows = await messageStore.getRecent("room");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].localId, failed.localId);
  assert.equal(rows[0].repliedToId, "original");
  assert.equal(rows[0].retryCount, 1);
  assert.equal(
    server.calls.filter((call) => call.path.endsWith("/reply")).length,
    2,
    "one failed attempt and one retry",
  );
});
test("failed media retry preserves media type and upload result", async () => {
  service.uploadMedia = async () => ({
    url: "https://cdn.test/a.mp4",
    thumbnailUrl: "https://cdn.test/a.jpg",
  });
  server.failure = new Error("offline");
  await assert.rejects(
    service.sendMediaRecord("video/mp4", "file:///video.mp4", {
      senderId: "me",
      receiverId: "other",
      conversationId: "room",
    }),
  );
  const failed = (await messageStore.getRecent("room"))[0];
  assert.equal(failed.type, "VIDEO");
  server.failure = null;
  await service.retry("room", failed.localId, {
    senderId: "me",
    receiverId: "other",
  });
  const body = JSON.parse(server.calls.at(-1).options.body);
  assert.equal(body.type, "VIDEO");
  assert.equal(body.mediaUrl, "https://cdn.test/a.mp4");
});
test("READ never regresses after late delivery, duplicate incoming events, or stale history", async () => {
  await messageStore.save(row(1, { status: "READ", isRead: true }));
  await messageStore.markDelivered(row(1).id, "room");
  await messageStore.saveReceived(row(1, { status: "DELIVERED" }));
  assert.equal((await messageStore.getRecent("room"))[0].status, "READ");
});
test("local tombstone survives stale server sync and does not appear in cached pages", async () => {
  await messageStore.save(row(1));
  await messageStore.deleteOne(row(1).id);
  await messageStore.saveMany([row(1)]);
  assert.equal((await messageStore.getRecent("room")).length, 0);
  assert.ok((await messageStore.getById(row(1).id)).deletedAt);
});
test("persisted read outbox is atomic with visibility READ and survives cache reopening", async () => {
  await messageStore.saveMany([row(1), row(2, { senderId: "me" })]);
  await messageStore.markVisibleReadIds([row(1).id, row(2).id], "room", "me");
  const queue = await receiptQueue.getBatch("READ");
  assert.equal(queue.length, 1);
  assert.equal(queue[0].messageId, row(1).id);
  assert.equal(
    (await messageStore.getById(row(2).id)).status,
    "SENT",
    "own messages are not read by visibility",
  );
  assert.equal((await messageStore.getRecent("room"))[0].status, "READ");
});
test("latest sync fills an offline gap and deduplicates concurrent callers", async () => {
  server.messages = Array.from({ length: 121 }, (_, i) => remote(i));
  await messageStore.saveMany([row(0)]);
  await Promise.all([
    service.syncLatest("room", "me"),
    service.syncLatest("room", "me"),
  ]);
  assert.equal((await messageStore.getByRoom("room")).length, 121);
  assert.equal(server.calls.length, 5);
  assert.equal(await syncStateStore.get("room"), null);
});
test("interrupted catch-up retains checkpoint and safe retry fills the gap", async () => {
  server.messages = Array.from({ length: 121 }, (_, i) => remote(i));
  await messageStore.save(row(0));
  const originalFetch = global.fetch;
  let calls = 0;
  global.fetch = (...args) => {
    if (++calls === 3) throw new Error("offline during catch-up");
    return originalFetch(...args);
  };
  await assert.rejects(service.syncLatest("room", "me"));
  assert.ok((await syncStateStore.get("room")).beforeId);
  global.fetch = originalFetch;
  await service.syncLatest("room", "me");
  assert.equal((await messageStore.getByRoom("room")).length, 121);
  assert.equal(await syncStateStore.get("room"), null);
});
test("account/session reset prevents an old network response from writing messages", async () => {
  const pending = deferred();
  server.response = () => pending.promise;
  const syncing = service.syncFromServer("room", "me");
  await settle();
  service.resetSession();
  pending.resolve({
    ok: true,
    status: 200,
    json: async () => ({ data: [remote(1)] }),
  });
  await syncing;
  assert.equal((await messageStore.getRecent("room")).length, 0);
});
test("room upsert has a valid unique conflict target and exact unread updates", async () => {
  const room = {
    id: "room",
    conversationId: "room",
    name: "Other",
    avatarUrl: "",
    lastMessage: "one",
    lastMessageType: "TEXT",
    lastMessageTimestamp: 1,
    unreadCount: 1,
    cachedAt: 1,
    updatedAt: 1,
  };
  await roomStore.upsertRoom(room);
  await roomStore.upsertRoom({ ...room, unreadCount: 0 });
  assert.equal((await roomStore.getAllRooms()).length, 1);
  assert.equal((await roomStore.getAllRooms())[0].unreadCount, 0);
});

test("startup recovers interrupted SENDING as explicit retryable FAILED, without unsafe automatic replay", async () => {
  await messageStore.save(row(1, { senderId: "me", status: "SENDING" }));
  await messageStore.recoverUnfinishedSends();
  assert.equal((await messageStore.getRecent("room"))[0].status, "FAILED");
  assert.equal(server.calls.length, 0);
});
test("transaction rollback cannot roll back a concurrent unrelated write", async () => {
  const { withDatabaseTransaction } = require("../../src/db/db.ts");
  const { messages } = require("../../src/db/schema.ts");
  const entered = deferred();
  const release = deferred();
  const transaction = withDatabaseTransaction(async (tx) => {
    await tx.insert(messages).values(row(1));
    entered.resolve();
    await release.promise;
    throw new Error("rollback");
  });
  await entered.promise;
  const other = messageStore.save(row(2));
  release.resolve();
  await assert.rejects(transaction, /rollback/);
  await other;
  assert.equal(await messageStore.getById(row(1).id), null);
  assert.ok(await messageStore.getById(row(2).id));
});
test("account switching clears bodies, room summaries, memory prefetch, receipt outbox and gap checkpoint", async () => {
  const {
    prepareMessagingAccount,
  } = require("../../src/services/MessagingCache.ts");
  const {
    setRecentMessageCache,
    getRecentMessageCache,
  } = require("../../src/utils/recentMessageCache.ts");
  await prepareMessagingAccount("me");
  await messageStore.save(row(1));
  setRecentMessageCache("room", [row(1)]);
  await receiptQueue.enqueue("READ", "room", [row(1).id]);
  await syncStateStore.set({
    conversationId: "room",
    targetId: row(0).id,
    targetTimestamp: row(0).timestamp,
    beforeId: row(1).id,
    beforeTimestamp: row(1).timestamp,
  });
  await prepareMessagingAccount("another-account");
  assert.equal((await messageStore.getRecent("room")).length, 0);
  assert.equal(getRecentMessageCache("room"), null);
  assert.equal((await receiptQueue.getBatch("READ")).length, 0);
  assert.equal(await syncStateStore.get("room"), null);
});
test("deleting a room invalidates an in-flight history response and its receipt queue", async () => {
  const pending = deferred();
  server.response = () => pending.promise;
  await receiptQueue.enqueue("READ", "room", [row(1).id]);
  const sync = service.syncFromServer("room", "me");
  await settle();
  await messageStore.deleteRoom("room");
  pending.resolve({
    ok: true,
    status: 200,
    json: async () => ({ data: [remote(1)] }),
  });
  await sync;
  assert.equal((await messageStore.getRecent("room")).length, 0);
  assert.equal((await receiptQueue.getBatch("READ")).length, 0);
});
test("duplicate entries in one persisted page retain READ instead of last-write regression", async () => {
  const rows = await messageStore.saveMany([
    row(1, { status: "READ", isRead: true }),
    row(1),
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, "READ");
  assert.equal(rows[0].isRead, true);
});
test("catch-up traverses equal-timestamp pages to the cached ID boundary", async () => {
  server.messages = Array.from({ length: 117 }, (_, i) =>
    remote(i, { createdAt: new Date(1700000000000).toISOString() }),
  );
  await messageStore.save(row(0));
  await service.syncLatest("room", "me");
  assert.equal((await messageStore.getRecent("room", 200)).length, 117);
  assert.equal(server.calls.length, 4);
});
test("catch-up uses remote cursor order, not the immutable optimistic clock", async () => {
  server.messages = Array.from({ length: 121 }, (_, i) => remote(i));
  await messageStore.saveMany([
    row(0),
    row(95, { localId: "outgoing-local", timestamp: 1, senderId: "me" }),
  ]);
  await service.syncLatest("room", "me");
  assert.equal((await messageStore.getRecent("room", 200)).length, 121);
  assert.equal(
    (await messageStore.getByLocalId("outgoing-local")).timestamp,
    1,
  );
});
test("completion of an old-account send cannot release a new same-user outgoing barrier", async () => {
  const releaseOld = messageStore.beginOutgoing("me");
  service.resetSession();
  await messageStore.deleteAll();
  const releaseNew = messageStore.beginOutgoing("me");
  releaseOld();
  let complete = false;
  const waiting = messageStore.waitForOutgoing("me").then(() => {
    complete = true;
  });
  await settle();
  assert.equal(complete, false);
  releaseNew();
  await waiting;
  assert.equal(complete, true);
});
test("global unread uses atomic received/read deltas instead of a partial cached-row count", async () => {
  await roomStore.upsertRoom({
    id: "room",
    conversationId: "room",
    name: "Other",
    avatarUrl: "",
    lastMessage: "",
    lastMessageType: "text",
    lastMessageTimestamp: 1,
    unreadCount: 100,
    cachedAt: 1,
    updatedAt: 1,
  });
  await Promise.all([
    messageStore.saveReceived(row(1), () => true, "me"),
    messageStore.saveReceived(row(1), () => true, "me"),
  ]);
  assert.equal((await roomStore.findRoom("room"))[0].unreadCount, 101);
  await messageStore.markVisibleReadIds([row(1).id], "room", "me");
  await messageStore.markVisibleReadIds([row(1).id], "room", "me");
  assert.equal((await roomStore.findRoom("room"))[0].unreadCount, 100);
});
test("duplicate incoming deletion decrements global unread once and removes stale receipt work", async () => {
  await roomStore.upsertRoom({
    id: "room",
    conversationId: "room",
    name: "Other",
    avatarUrl: "",
    lastMessage: "",
    lastMessageType: "text",
    lastMessageTimestamp: 1,
    unreadCount: 100,
    cachedAt: 1,
    updatedAt: 1,
  });
  await messageStore.save(row(1));
  await receiptQueue.enqueue("DELIVERED", "room", [row(1).id]);
  await messageStore.deleteOne(row(1).id, "me");
  await messageStore.deleteOne(row(1).id, "me");
  await messageStore.markVisibleReadIds([row(1).id], "room", "me");
  assert.equal((await roomStore.findRoom("room"))[0].unreadCount, 99);
  assert.equal((await receiptQueue.getBatch("DELIVERED")).length, 0);
  assert.equal((await receiptQueue.getBatch("READ")).length, 0);
});
test("an interrupted checkpoint with a remotely removed cursor falls back to a fresh head walk", async () => {
  server.messages = Array.from({ length: 121 }, (_, i) => remote(i));
  await messageStore.save(row(0));
  const fetch = global.fetch;
  let calls = 0;
  global.fetch = (...args) => {
    if (++calls === 3) throw new Error("interrupted");
    return fetch(...args);
  };
  await assert.rejects(service.syncLatest("room", "me"));
  const checkpoint = await syncStateStore.get("room");
  server.messages = server.messages.filter(
    (message) => message.id !== checkpoint.beforeId,
  );
  global.fetch = fetch;
  await service.syncLatest("room", "me");
  assert.ok(await messageStore.getById(row(1).id));
  assert.ok(await messageStore.getById(row(50).id));
  assert.equal(await syncStateStore.get("room"), null);
});
