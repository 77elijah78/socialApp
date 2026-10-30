const { test } = require("node:test");
const assert = require("node:assert/strict");
const { database } = require("./harness.cjs");

test("legacy duplicate repair preserves optimistic key and strongest receipt; indexes enforce identity", async () => {
  database.exec(`CREATE TABLE messages (
    local_id TEXT PRIMARY KEY NOT NULL, id TEXT, content TEXT, media_url TEXT, thumbnail_url TEXT,
    type TEXT NOT NULL DEFAULT 'TEXT', status TEXT NOT NULL DEFAULT 'SENT', sender_id TEXT NOT NULL,
    receiver_id TEXT, conversation_id TEXT NOT NULL, is_read INTEGER NOT NULL DEFAULT 0,
    timestamp INTEGER NOT NULL, edited_at TEXT, deleted_at TEXT, deleted_by TEXT, duration REAL,
    replied_to_id TEXT, forwarded_from_id TEXT
  );
  INSERT INTO messages (local_id,id,content,status,sender_id,conversation_id,timestamp) VALUES
    ('original-local','server-id','Hello','SENT','me','room',1),
    ('server-id','server-id','Hello','READ','me','room',2);
  UPDATE messages SET content='Edited hello', edited_at='2026-10-28T12:00:00.000Z', deleted_at='2026-10-29T12:00:00.000Z', deleted_by='me' WHERE local_id='server-id';`);
  const { runMigrations } = require("../../src/db/migrations.ts");
  await runMigrations();
  const rows = database
    .prepare(
      "SELECT local_id, status, is_read, content, edited_at, deleted_at, deleted_by FROM messages",
    )
    .all();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].local_id, "original-local");
  assert.equal(rows[0].status, "READ");
  assert.equal(rows[0].is_read, 1);
  assert.equal(rows[0].content, null, "legacy tombstone payload is scrubbed without losing identity/receipts");
  assert.equal(rows[0].edited_at, "2026-10-28T12:00:00.000Z");
  assert.equal(rows[0].deleted_at, "2026-10-29T12:00:00.000Z");
  assert.equal(rows[0].deleted_by, "me");
  assert.throws(() =>
    database.exec(
      "INSERT INTO messages(local_id,id,sender_id,conversation_id,timestamp) VALUES('duplicate','server-id','me','room',3)",
    ),
  );
  const plan = database
    .prepare(
      "EXPLAIN QUERY PLAN SELECT * FROM messages WHERE conversation_id = ? AND (timestamp < ? OR (timestamp = ? AND local_id < ?)) ORDER BY timestamp DESC, local_id DESC LIMIT 30",
    )
    .all("room", 10, 10, "z");
  assert.ok(
    plan.some((entry) =>
      entry.detail.includes("idx_messages_conversation_order"),
    ),
  );
  const count = database
    .prepare("SELECT COUNT(*) AS count FROM messages")
    .get().count;
  await runMigrations();
  assert.equal(
    database.prepare("SELECT COUNT(*) AS count FROM messages").get().count,
    count,
    "migration is idempotent",
  );
});
