import { db } from "./db";
import { messages, NewMessageRow, MessageRow, NewRoomRow, RoomRow, rooms } from "./schema";
import { eq, or } from "drizzle-orm";

/**
 * MessageInsertQueries
 *
 * Handles all INSERT operations for the messages table.
 */
export class MessageInsertQueries {
  /**
   * Insert a single new message.
   * Safe to call for both optimistic (sending) and confirmed (sent) messages.
   *
   * @param message - Full message object (localId must be set by caller)
   * @returns        The inserted row
   */
  async insert(message: NewMessageRow): Promise<MessageRow> {
    const [row] = await db
      .insert(messages)
      .values(message)
      .returning();
    return row;
  }

  /**
   * Insert a batch of messages (e.g. history fetched from server).
   * Uses INSERT OR IGNORE to skip rows that already exist by localId.
   * Rows that exist but have different data should be handled by update().
   *
   * @param batch - Array of message objects
   * @returns       Array of inserted rows (skipped rows not returned)
   */
  async insertMany(batch: NewMessageRow[]): Promise<MessageRow[]> {
    if (batch.length === 0) return [];
    const rows = await db
      .insert(messages)
      .values(batch)
      .onConflictDoNothing()   // skip duplicates by localId (PK)
      .returning();
    return rows;
  }

  /**
   * Upsert a single message — insert if new, merge if exists.
   * Used when syncing from server where we may or may not have the row locally.
   *
   * @param message - Message to upsert
   * @returns         The final row
   */
  async upsert(message: NewMessageRow): Promise<MessageRow> {
    const [row] = await db
      .insert(messages)
      .values(message)
      .onConflictDoUpdate({
        target: messages.localId,
        set: {
          id:        message.id,
          status:    message.status,
          text:      message.text,
          mediaUrl:  message.mediaUrl,
          timestamp: message.timestamp,
        },
      })
      .returning();
    return row;
  }

  /**
   * Upsert many messages at once (bulk server sync).
   *
   * @param batch - Array of messages
   * @returns       Array of final rows
   */
  async upsertMany(batch: NewMessageRow[]): Promise<MessageRow[]> {
    if (batch.length === 0) return [];
    const rows = await db
      .insert(messages)
      .values(batch)
      .onConflictDoUpdate({
        target: messages.localId,
        set: {
          id:        messages.id,
          status:    messages.status,
          text:      messages.text,
          mediaUrl:  messages.mediaUrl,
          timestamp: messages.timestamp,
        },
      })
      .returning();
    return rows;
  }
}

export class RoomsInsertQueries {
  async insert(room: NewRoomRow): Promise<RoomRow> {
    const [row] = await db
      .insert(rooms)
      .values(room)
      .returning();
    return row;
  }
}

export const messageInsertQueries = new MessageInsertQueries();
export const roomInsertQueries = new RoomsInsertQueries();
