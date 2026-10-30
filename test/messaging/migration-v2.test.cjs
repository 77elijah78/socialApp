const { test } = require("node:test");
const assert = require("node:assert/strict");
const { database } = require("./harness.cjs");

test("v1 to v2 is additive: messages, flags, room state and durable receipts survive", async () => {
  database.exec(`CREATE TABLE messages (
    local_id TEXT PRIMARY KEY NOT NULL, id TEXT, content TEXT, media_url TEXT, thumbnail_url TEXT,
    type TEXT NOT NULL DEFAULT 'TEXT', status TEXT NOT NULL DEFAULT 'SENT', sender_id TEXT NOT NULL,
    receiver_id TEXT, conversation_id TEXT NOT NULL, is_read INTEGER NOT NULL DEFAULT 0,
    timestamp INTEGER NOT NULL, edited_at TEXT, deleted_at TEXT, deleted_by TEXT, duration REAL,
    replied_to_id TEXT, forwarded_from_id TEXT, delivered_at TEXT, read_at TEXT, failed_at TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0, updated_at TEXT
  );
  CREATE TABLE rooms (id TEXT PRIMARY KEY NOT NULL, name TEXT, conversation_id TEXT, avatar_url TEXT,
    last_message TEXT, last_message_type TEXT, last_message_timestamp INTEGER, unread_count INTEGER,
    receiver_id TEXT, last_message_status TEXT, cached_at INTEGER, updated_at INTEGER, muted INTEGER,
    pinned INTEGER, archived INTEGER, cursor_oldest_ts INTEGER, cursor_oldest_id TEXT);
  CREATE TABLE message_receipt_outbox (key TEXT PRIMARY KEY, message_id TEXT, conversation_id TEXT, kind TEXT);
  INSERT INTO messages(local_id,id,content,status,sender_id,conversation_id,is_read,timestamp) VALUES('stable','server','History intact','READ','other','room',1,123);
  INSERT INTO rooms(id,conversation_id,name,unread_count,pinned) VALUES('room','room','Room',7,1);
  INSERT INTO message_receipt_outbox VALUES('READ:server','server','room','READ');
  PRAGMA user_version=1;`);
  const { runMigrations } = require("../../src/db/migrations.ts");
  await runMigrations();
  assert.equal(database.prepare("PRAGMA user_version").get().user_version, 2);
  const message = database.prepare("SELECT * FROM messages").get();
  assert.equal(message.local_id, "stable");
  assert.equal(message.content, "History intact");
  assert.equal(message.status, "READ");
  assert.equal(message.is_read, 1);
  assert.equal(message.sender_data, null);
  assert.equal(message.reply_data, null);
  assert.equal(message.attachment_data, null);
  const room = database.prepare("SELECT * FROM rooms").get();
  assert.equal(room.unread_count, 7);
  assert.equal(room.pinned, 1);
  assert.equal(room.is_group, 0);
  const receipt = database
    .prepare("SELECT * FROM message_receipt_outbox")
    .get();
  assert.equal(receipt.message_id, "server");
  assert.equal(receipt.attempt_token, null);
  const { receiptQueue } = require("../../src/db/receiptQueue.ts");
  assert.equal((await receiptQueue.claimReads("connection-a")).length, 1);
  assert.equal((await receiptQueue.claimReads("connection-a")).length, 0);
  assert.equal((await receiptQueue.claimReads("connection-b")).length, 1);
  assert.equal(
    (await receiptQueue.getBatch("READ")).length,
    1,
    "claiming/emitting is not server acknowledgment",
  );
  const plan = database
    .prepare(
      "EXPLAIN QUERY PLAN SELECT * FROM messages WHERE conversation_id=? AND replied_to_id=? ORDER BY timestamp,local_id",
    )
    .all("room", "parent");
  assert.ok(
    plan.some((row) => row.detail.includes("idx_messages_reply_context")),
  );
  await runMigrations();
  assert.equal(
    database.prepare("SELECT COUNT(*) AS count FROM messages").get().count,
    1,
  );
});
