const { test, before, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { row, settle, installServer } = require("./harness.cjs");
const { runMigrations } = require("../../src/db/migrations.ts");
const { messageStore } = require("../../src/db/MessageStore.ts");
const { receiptQueue } = require("../../src/db/receiptQueue.ts");
const { socketReceiver } = require("../../src/services/SocketReceiver.ts");
const reads = socket => socket.emitted.filter(item => item.event === "message:read");
before(async () => { await runMigrations(); });
beforeEach(async () => {
  socketReceiver.disconnect();
  await messageStore.deleteAll(); await receiptQueue.clear();
  installServer();
});
afterEach(() => socketReceiver.disconnect());
async function connectAndSee(user = "me") {
  socketReceiver.connect(user, "token");
  const socket = socketReceiver.socket;
  socket.receive("connect");
  await settle();
  await messageStore.save(row(1, { receiverId: user }));
  await messageStore.markVisibleReadIds([row(1).id], "room", user);
  await socketReceiver.flushReceipts(); await settle();
  return socket;
}

test("actual success-only read ACK binds exact IDs and retires durable work without requiring an echo", async () => {
  const socket = await connectAndSee();
  assert.equal(reads(socket).length, 1);
  assert.equal((await receiptQueue.getBatch("READ")).length, 1, "emit alone is not a persistence acknowledgement");
  assert.deepEqual(reads(socket)[0].data, { conversationId: "room", messageId: row(1).id });
  reads(socket)[0].acknowledge({ success: true });
  await settle();
  assert.equal((await receiptQueue.getBatch("READ")).length, 0);
  await socketReceiver.flushReceipts();
  assert.equal(reads(socket).length, 1);
});

test("negative or malformed ACK keeps retryable work, reports server failure, and does not spam identical receipts", async () => {
  const socket = await connectAndSee();
  const errors = [];
  const stop = socketReceiver.on("sync:error", error => errors.push(error));
  try {
    reads(socket)[0].acknowledge({ success: false, error: "Receipt database unavailable" });
    reads(socket)[0].acknowledge({ ok: true });
    await settle();
    assert.equal((await receiptQueue.getBatch("READ")).length, 1);
    assert.match(errors[0].message, /Receipt database unavailable/);
    await socketReceiver.flushReceipts();
    assert.equal(reads(socket).length, 1);
    await socketReceiver.recoverReceipts(); await settle();
    assert.equal(reads(socket).length, 2, "explicit recovery gets a new durable attempt token");
    reads(socket)[1].acknowledge({ success: true }); await settle();
    assert.equal((await receiptQueue.getBatch("READ")).length, 0);
  } finally { stop(); }
});

test("a stale socket/account ACK cannot clear the next account's read for the same group message ID", async () => {
  const old = await connectAndSee("me");
  const oldAck = reads(old)[0].acknowledge;
  socketReceiver.disconnect();
  await messageStore.deleteAll(); await receiptQueue.clear();
  const next = await connectAndSee("next-user");
  assert.equal((await receiptQueue.getBatch("READ")).length, 1);
  oldAck({ success: true }); await settle();
  assert.equal((await receiptQueue.getBatch("READ")).length, 1);
  reads(next)[0].acknowledge({ success: true }); await settle();
  assert.equal((await receiptQueue.getBatch("READ")).length, 0);
});

test("a successful delivery HTTP request never generates a read socket receipt", async () => {
  socketReceiver.connect("me", "token");
  const socket = socketReceiver.socket;
  socket.receive("connect"); await settle();
  await messageStore.save(row(1));
  await receiptQueue.enqueue("DELIVERED", "room", [row(1).id]);
  await socketReceiver.flushReceipts(); await settle();
  assert.equal(reads(socket).length, 0);
  assert.equal((await messageStore.getById(row(1).id)).isRead, false);
  assert.equal((await receiptQueue.getBatch("DELIVERED")).length, 0);
});

for (const readByMe of [false, true]) {
  test(`group history confirms durable receipt work only for this reader, not aggregate READ (readByMe=${readByMe})`, async () => {
    const { remote } = require("./harness.cjs");
    const { MessageService } = require("../../src/services/MessageService.ts");
    await messageStore.save(row(1, { receiverId: null }));
    await messageStore.markVisibleReadIds([row(1).id], "room", "me");
    installServer([remote(1, { receiverId: null, isGroup: true, readByMe, status: "READ", isRead: true })]);
    const service = new MessageService("https://example.test/api/v1", "token");
    await service.syncFromServer("room", "me");
    assert.equal((await receiptQueue.getBatch("READ")).length, readByMe ? 0 : 1);
  });
}
