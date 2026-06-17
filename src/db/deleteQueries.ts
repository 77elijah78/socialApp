import { db } from "./db";
import { messages } from "./schema";
import { eq, and, lt, or } from "drizzle-orm";

/**
 * MessageDeleteQueries
 *
 * Handles all DELETE operations for the messages table.
 */
export class MessageDeleteQueries {
  /**
   * Delete a single message by localId or server id.
   * Called when the user deletes a message or the server emits message:deleted.
   *
   * @param messageId  localId or server id
   * @returns           true if a row was deleted
   */
  async deleteOne(messageId: string): Promise<boolean> {
    const rows = await db
      .delete(messages)
      .where(
        or(
          eq(messages.localId, messageId),
          eq(messages.id, messageId)
        )
      )
      .returning();
    return rows.length > 0;
  }

  /**
   * Delete multiple messages by their localIds.
   * Used for bulk delete (select multiple + delete).
   *
   * @param localIds
   * @returns          Number of rows deleted
   */
  async deleteMany(localIds: string[]): Promise<number> {
    if (localIds.length === 0) return 0;
    let count = 0;
    await Promise.all(
      localIds.map(async (id) => {
        const rows = await db
          .delete(messages)
          .where(eq(messages.localId, id))
          .returning();
        count += rows.length;
      })
    );
    return count;
  }

  /**
   * Delete all messages in a room.
   * Called on "Clear chat" or when a room is deleted.
   *
   * @param roomId
   * @returns       Number of rows deleted
   */
  async deleteRoom(roomId: string): Promise<number> {
    const rows = await db
      .delete(messages)
      .where(eq(messages.roomId, roomId))
      .returning();
    return rows.length;
  }

  /**
   * Delete messages older than a given timestamp in a room.
   * Useful for auto-cleanup / storage management.
   *
   * @param roomId
   * @param olderThanMs  Unix ms — delete messages with timestamp < this value
   * @returns             Number of rows deleted
   */
  async deleteOlderThan(roomId: string, olderThanMs: number): Promise<number> {
    const rows = await db
      .delete(messages)
      .where(
        and(
          eq(messages.roomId, roomId),
          lt(messages.timestamp, olderThanMs)
        )
      )
      .returning();
    return rows.length;
  }

  /**
   * Delete all failed messages in a room.
   * Called on "Clear failed" or before a full retry sweep.
   *
   * @param roomId
   * @returns       Number of rows deleted
   */
  async deleteAllFailed(roomId: string): Promise<number> {
    const rows = await db
      .delete(messages)
      .where(
        and(
          eq(messages.roomId, roomId),
          eq(messages.status, "failed")
        )
      )
      .returning();
    return rows.length;
  }

  /**
   * Wipe every message across all rooms.
   * Only call on full logout / account deletion.
   *
   * @returns  Number of rows deleted
   */
  async deleteAll(): Promise<number> {
    const rows = await db.delete(messages).returning();
    return rows.length;
  }
}

export const messageDeleteQueries = new MessageDeleteQueries();
