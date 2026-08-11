import { db } from "./db";
import { sql } from "drizzle-orm";

async function addColumn(table: string, column: string, definition: string): Promise<void> {
  try {
    await db.run(sql`ALTER TABLE ${sql.raw(table)} ADD COLUMN ${sql.raw(column)} ${sql.raw(definition)}`);
  } catch {
    // Column already exists or table doesn't exist yet — safe to ignore
  }
}

export async function runMigrations(): Promise<void> {
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
  await addColumn("rooms", "last_message_status", "TEXT NOT NULL DEFAULT 'SENT'");
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
}
