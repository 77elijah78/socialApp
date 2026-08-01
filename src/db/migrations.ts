import { db } from "./db";
import { sql } from "drizzle-orm";

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
      forwarded_from_id TEXT
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
      unread_count INTEGER
    )`);

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
}
