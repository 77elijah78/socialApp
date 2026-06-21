import { db } from "./db";
import { sql } from "drizzle-orm";

/**
 * runMigrations — creates all tables if they don't exist.
 * Call once at app startup before any db operations.
 *
 * Place in src/app/_layout.tsx inside a useEffect or
 * before the NavigationContainer renders.
 */
export async function runMigrations(): Promise<void> {
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS messages (
      local_id    TEXT PRIMARY KEY NOT NULL,
      id          TEXT,
      text        TEXT,
      type        TEXT NOT NULL DEFAULT 'text',
      media_url   TEXT,
      sender_id   TEXT NOT NULL,
      receiver_id TEXT NOT NULL,
      room_id     TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'sending',
      direction   TEXT NOT NULL,
      timestamp   INTEGER NOT NULL
    );
  `);

  await db.run(sql`
    CREATE TABLE IF NOT EXISTS rooms (
      id          TEXT PRIMARY KEY NOT NULL,
      name        TEXT,
      conversation_id TEXT,
      avatar_url      TEXT,
      last_message TEXT,
      last_message_ctype  TEXT,
      last_message_timestamp INTEGER,
      unread_count INTEGER
    )`);

  // Index for fast room queries (most common read pattern)
  await db.run(sql`
    CREATE INDEX IF NOT EXISTS idx_messages_room_ts
    ON messages (room_id, timestamp);
  `);

  // Index for unread count queries
  await db.run(sql`
    CREATE INDEX IF NOT EXISTS idx_messages_unread
    ON messages (room_id, direction, status);
  `);
}
