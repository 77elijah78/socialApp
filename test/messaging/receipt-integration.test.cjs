const { test, before, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const {
  row,
  installServer,
  deferred,
  settle,
  sockets,
  database,
} = require("./harness.cjs");
const { runMigrations } = require("../../src/db/migrations.ts");
const { messageStore } = require("../../src/db/MessageStore.ts");
const { receiptQueue } = require("../../src/db/receiptQueue.ts");
const { SocketReceiver } = require("../../src/services/SocketReceiver.ts");
const {
  normalizeRemoteMessage,
} = require("../../src/utils/messaging/serialization.ts");
const { remote } = require("./harness.cjs");
const {
  createListItemBuilder,
} = require("../../src/utils/messaging/listItems.ts");
let receiver, server;
before(runMigrations);
beforeEach(async () => {
  await messageStore.deleteAll();
  await receiptQueue.clear();
  server = installServer();
  receiver = new SocketReceiver("https://example.test");
  receiver.connect("me", "token");
});
afterEach(() => receiver.disconnect());
test("status recovery updates an old outgoing cached message without loading or resetting history", async () => {
  const rows = Array.from({ length: 150 }, (_, i) =>
    row(i, { senderId: "me" }),
  );
  await messageStore.saveMany(rows);
  await messageStore.save(row(500));
  server.receiptStates = [
    { messageId: row(1).id, conversationId: "room", status: "READ" },
  ];
  await receiver.syncReceiptStatuses();
  assert.equal((await messageStore.getById(row(1).id)).status, "READ");
  assert.equal((await messageStore.getById(row(149).id)).status, "SENT");
  assert.equal((await messageStore.getById(row(500).id)).status, "SENT");
  assert.ok(server.calls.every((call) => call.path.endsWith("/receipts/sync")));
  assert.equal(server.calls.length, 2);
  assert.ok(
    server.calls.every(
      (call) => JSON.parse(call.options.body).messageIds.length <= 100,
    ),
  );
});
test("unrequested identities and wrong-conversation status rows cannot mutate cached messages", async () => {
  await messageStore.saveMany([row(1, { senderId: "me" }), row(2)]);
  server.receiptStates = [
    { messageId: row(2).id, conversationId: "room", status: "READ" },
    { messageId: row(1).id, conversationId: "foreign-room", status: "READ" },
  ];
  await receiver.syncReceiptStatuses();
  assert.equal((await messageStore.getById(row(1).id)).status, "SENT");
  assert.equal((await messageStore.getById(row(2).id)).status, "SENT");
});
test("recovery is single-flight and cannot write after logout/account generation changes", async () => {
  await messageStore.save(row(1, { senderId: "me" }));
  const response = deferred();
  server.response = () => response.promise;
  const first = receiver.syncReceiptStatuses();
  assert.equal(receiver.syncReceiptStatuses(), first);
  await settle();
  receiver.disconnect();
  response.resolve({
    ok: true,
    status: 200,
    json: async () => ({
      data: [{ messageId: row(1).id, conversationId: "room", status: "READ" }],
    }),
  });
  await first;
  assert.equal((await messageStore.getById(row(1).id)).status, "SENT");
});
test("read snapshots are monotonic, and a receipt changes only the affected model", async () => {
  await messageStore.saveMany(
    Array.from({ length: 30 }, (_, i) => row(i, { senderId: "me" })),
  );
  const before = await messageStore.getRecent("room");
  const build = createListItemBuilder();
  const models = build(before, "me", null);
  server.receiptStates = [
    { messageId: row(15).id, conversationId: "room", status: "READ" },
  ];
  await receiver.syncReceiptStatuses();
  const after = build(
    require("../../src/utils/messaging/timeline.ts").mergeMessageRows(
      before,
      await messageStore.getRecent("room"),
    ),
    "me",
    null,
  );
  assert.equal(after.filter((item, i) => item !== models[i]).length, 1);
  server.receiptStates = [
    { messageId: row(15).id, conversationId: "room", status: "DELIVERED" },
  ];
  await receiver.syncReceiptStatuses();
  assert.equal((await messageStore.getById(row(15).id)).status, "READ");
});
test("backend group readByMe is distinct from any-reader aggregate status, with legacy fallback", () => {
  const base = remote(1, {
    receiverId: null,
    status: "READ",
    isRead: true,
    isGroup: true,
  });
  assert.equal(
    normalizeRemoteMessage({ ...base, readByMe: false }, "me").isRead,
    false,
  );
  assert.equal(
    normalizeRemoteMessage({ ...base, readByMe: false }, "me").status,
    "DELIVERED",
  );
  assert.equal(
    normalizeRemoteMessage({ ...base, readByMe: true }, "me").status,
    "READ",
  );
  assert.equal(normalizeRemoteMessage(base, "me").isRead, false);
  assert.equal(
    normalizeRemoteMessage({ ...base, senderId: "me", readByMe: false }, "me")
      .status,
    "READ",
  );
});
test("only eligible outgoing cache IDs are selected and the additive v3 recovery index exists", async () => {
  await messageStore.saveMany([
    row(1, { senderId: "me" }),
    row(2),
    row(3, { senderId: "me", status: "READ" }),
    row(4, { senderId: "me", status: "FAILED" }),
  ]);
  const candidates = await messageStore.getReceiptCandidates("me");
  assert.deepEqual(
    candidates.map((row) => row.id),
    [row(1).id],
  );
  assert.deepEqual(Object.keys(candidates[0]).sort(), [
    "conversationId",
    "id",
    "localId",
  ]);
  assert.ok(
    database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_messages_receipt_recovery'",
      )
      .get(),
  );
});
test("a server recovery signal replays unconfirmed reads without another touch or chat message", async () => {
  await messageStore.save(row(1));
  await messageStore.markVisibleReadIds([row(1).id], "room", "me");
  const socket = sockets.at(-1);
  socket.receive("connect");
  await settle();
  const count = () =>
    socket.emitted.filter((event) => event.event === "message:read").length;
  assert.equal(count(), 1);
  await receiver.flushReceipts();
  assert.equal(count(), 1);
  socket.receive("receipts:resync");
  await settle();
  assert.equal(count(), 2);
  socket.receive("message:read", {
    messageId: row(1).id,
    conversationId: "room",
    userId: "me",
  });
  await settle();
  assert.equal((await receiptQueue.getBatch("READ")).length, 0);
});

test("v2 to v3 preserves messages and durable read claims while adding only the recovery index", async () => {
  await messageStore.save(row(1));
  await messageStore.markVisibleReadIds([row(1).id], "room", "me");
  await receiptQueue.claimReads("existing-connection");
  database.exec(
    "DROP INDEX idx_messages_receipt_recovery; PRAGMA user_version=2;",
  );
  const file = require.resolve("../../src/db/migrations.ts");
  delete require.cache[file];
  await require(file).runMigrations();
  assert.equal(database.prepare("PRAGMA user_version").get().user_version, 3);
  assert.equal((await messageStore.getById(row(1).id)).status, "READ");
  assert.equal(
    (await receiptQueue.getBatch("READ"))[0].attemptToken,
    "existing-connection",
  );
  assert.ok(
    database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_messages_receipt_recovery'",
      )
      .get(),
  );
});
