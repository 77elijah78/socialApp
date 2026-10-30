import { db, withDatabaseTransaction } from "./db";
import { sql } from "drizzle-orm";

async function addColumn(
  table: string,
  column: string,
  definition: string,
): Promise<void> {
  const columns = await db.values(sql.raw(`PRAGMA table_info(${table})`));
  if (columns.some((row) => row[1] === column)) return;
  await db.run(
    sql`ALTER TABLE ${sql.raw(table)} ADD COLUMN ${sql.raw(column)} ${sql.raw(definition)}`,
  );
}

let migrations: Promise<void> | undefined;
export function runMigrations(): Promise<void> {
  return (migrations ??= migrate());
}

async function migrateV1(): Promise<void> {
  const versions = await db.values<[number]>(sql`PRAGMA user_version`);
  if (Number(versions[0]?.[0] ?? 0) >= 1) return;
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS messages (
      local_id    TEXT PRIMARY KEY NOT NULL,
      id          TEXT,
      content     TEXT,
      media_url   TEXT,
      thumbnail_url TEXT,
      type        TEXT NOT NULL DEFAULT 'TEXT',
      status      TEXT NOT NULL DEFAULT 'SENT',
      sender_id   TEXT NOT NULL,
      receiver_id TEXT,
      conversation_id TEXT NOT NULL,
      is_read     INTEGER NOT NULL DEFAULT 0,
      timestamp   INTEGER NOT NULL,
      edited_at   TEXT,
      deleted_at  TEXT,
      deleted_by  TEXT,
      duration    REAL,
      replied_to_id TEXT,
      forwarded_from_id TEXT,
      delivered_at TEXT,
      read_at     TEXT,
      failed_at   TEXT,
      retry_count INTEGER NOT NULL DEFAULT 0,
      updated_at  TEXT
    );
  `);

  await db.run(sql`
    CREATE TABLE IF NOT EXISTS rooms (
      id          TEXT PRIMARY KEY NOT NULL,
      name        TEXT,
      conversation_id TEXT,
      avatar_url    TEXT,
      last_message TEXT,
      last_message_type  TEXT,
      last_message_timestamp INTEGER,
      unread_count INTEGER,
      receiver_id TEXT,
      last_message_status TEXT NOT NULL DEFAULT 'SENT',
      cached_at   INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL,
      muted       INTEGER NOT NULL DEFAULT 0,
      pinned      INTEGER NOT NULL DEFAULT 0,
      archived    INTEGER NOT NULL DEFAULT 0,
      cursor_oldest_ts INTEGER,
      cursor_oldest_id TEXT
    )`);

  await addColumn("messages", "delivered_at", "TEXT");
  await addColumn("messages", "read_at", "TEXT");
  await addColumn("messages", "failed_at", "TEXT");
  await addColumn("messages", "retry_count", "INTEGER NOT NULL DEFAULT 0");
  await addColumn("messages", "updated_at", "TEXT");

  await addColumn("rooms", "receiver_id", "TEXT");
  await addColumn(
    "rooms",
    "last_message_status",
    "TEXT NOT NULL DEFAULT 'SENT'",
  );
  await addColumn("rooms", "cached_at", "INTEGER NOT NULL DEFAULT 0");
  await addColumn("rooms", "updated_at", "INTEGER NOT NULL DEFAULT 0");
  await addColumn("rooms", "muted", "INTEGER NOT NULL DEFAULT 0");
  await addColumn("rooms", "pinned", "INTEGER NOT NULL DEFAULT 0");
  await addColumn("rooms", "archived", "INTEGER NOT NULL DEFAULT 0");
  await addColumn("rooms", "cursor_oldest_ts", "INTEGER");
  await addColumn("rooms", "cursor_oldest_id", "TEXT");

  await db.run(sql`
    CREATE INDEX IF NOT EXISTS idx_messages_conversation_ts
    ON messages (conversation_id, timestamp);
  `);

  await db.run(sql`
    CREATE INDEX IF NOT EXISTS idx_messages_unread
    ON messages (conversation_id, sender_id, status);
  `);

  await db.run(sql`
    CREATE INDEX IF NOT EXISTS idx_messages_replied_to
    ON messages (replied_to_id);
  `);

  await db.run(sql`
    CREATE INDEX IF NOT EXISTS idx_messages_id
    ON messages (id);
  `);

  await db.run(sql`
    CREATE INDEX IF NOT EXISTS idx_messages_conversation_id
    ON messages (conversation_id, id);
  `);

  await db.run(sql`
    CREATE INDEX IF NOT EXISTS idx_rooms_pinned_ts
    ON rooms (pinned DESC, last_message_timestamp DESC);
  `);

  await db.run(sql`
    CREATE INDEX IF NOT EXISTS idx_rooms_conversation_id
    ON rooms (conversation_id);
  `);
  await db.run(sql`CREATE TABLE IF NOT EXISTS message_receipt_outbox (
    key TEXT PRIMARY KEY NOT NULL, message_id TEXT NOT NULL,
    conversation_id TEXT NOT NULL, kind TEXT NOT NULL
  )`);

  await db.run(sql`CREATE TABLE IF NOT EXISTS message_sync_state (
    conversation_id TEXT PRIMARY KEY NOT NULL, before_id TEXT, before_timestamp INTEGER,
    target_id TEXT NOT NULL, target_timestamp INTEGER NOT NULL
  )`);

  // Repair historical sync duplicates before enforcing server identity. Prefer
  // the original optimistic localId; aggregate receipts so READ never regresses.
  await withDatabaseTransaction(async (tx) => {
    const versions = await tx.values<[number]>(sql`PRAGMA user_version`);
    if (Number(versions[0]?.[0] ?? 0) >= 1) return;
    await tx.run(sql`UPDATE messages SET
      status = CASE
        WHEN EXISTS(SELECT 1 FROM messages AS d WHERE d.id = messages.id AND d.status = 'READ') THEN 'READ'
        WHEN EXISTS(SELECT 1 FROM messages AS d WHERE d.id = messages.id AND d.status = 'DELIVERED') THEN 'DELIVERED'
        ELSE status END,
      is_read = CASE WHEN EXISTS(SELECT 1 FROM messages AS d WHERE d.id = messages.id AND (d.is_read = 1 OR d.status = 'READ')) THEN 1 ELSE is_read END,
      content = (SELECT d.content FROM messages AS d WHERE d.id = messages.id ORDER BY (d.edited_at IS NOT NULL) DESC, d.edited_at DESC, d.timestamp DESC, d.local_id DESC LIMIT 1),
      edited_at = (SELECT MAX(d.edited_at) FROM messages AS d WHERE d.id = messages.id),
      deleted_at = (SELECT MAX(d.deleted_at) FROM messages AS d WHERE d.id = messages.id),
      deleted_by = (SELECT d.deleted_by FROM messages AS d WHERE d.id = messages.id AND d.deleted_at IS NOT NULL ORDER BY d.deleted_at DESC LIMIT 1)
      WHERE id IN (SELECT id FROM messages WHERE id IS NOT NULL GROUP BY id HAVING COUNT(*) > 1)`);
    await tx.run(sql`DELETE FROM messages WHERE local_id IN (
      SELECT local_id FROM (
        SELECT local_id, ROW_NUMBER() OVER (
          PARTITION BY id ORDER BY (local_id <> id) DESC, timestamp ASC, local_id ASC
        ) AS duplicate_rank FROM messages WHERE id IS NOT NULL
      ) WHERE duplicate_rank > 1
    )`);
    await tx.run(
      sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_server_id_unique ON messages(id) WHERE id IS NOT NULL`,
    );
    await tx.run(
      sql`CREATE INDEX IF NOT EXISTS idx_messages_conversation_order ON messages(conversation_id, timestamp, local_id)`,
    );
    await tx.run(
      sql`DELETE FROM rooms WHERE rowid NOT IN (SELECT MAX(rowid) FROM rooms GROUP BY conversation_id)`,
    );
    await tx.run(
      sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_rooms_conversation_unique ON rooms(conversation_id)`,
    );
    await tx.run(sql`PRAGMA user_version = 1`);
  });
}

/** Additive v2 upgrade. An interrupted ALTER is safe to resume; never replace
 * app.db or discard historical messages, queues, or account ownership. */
async function migrate(): Promise<void> {
  await migrateV1();
  const version = await db.values<[number]>(sql`PRAGMA user_version`);
  if (Number(version[0]?.[0] ?? 0) >= 2) return;
  await addColumn("messages", "sender_data", "TEXT");
  await addColumn("messages", "reply_data", "TEXT");
  await addColumn("messages", "attachment_data", "TEXT");
  await addColumn("rooms", "is_group", "INTEGER NOT NULL DEFAULT 0");
  await addColumn("rooms", "participants_data", "TEXT");
  await addColumn("message_receipt_outbox", "attempt_token", "TEXT");
  await withDatabaseTransaction(async (tx) => {
    await tx.run(sql`CREATE INDEX IF NOT EXISTS idx_messages_reply_context
      ON messages(conversation_id, replied_to_id, timestamp, local_id)`);
    await tx.run(sql`CREATE INDEX IF NOT EXISTS idx_receipt_attempt
      ON message_receipt_outbox(kind, attempt_token, key)`);
    await tx.run(sql`PRAGMA user_version = 2`);
  });
}
