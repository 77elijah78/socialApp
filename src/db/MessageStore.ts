import { messageInsertQueries } from "./insertQueries";
import { messageGetQueries } from "./getQueries";
import { messageUpdateQueries } from "./updateQueries";
import { messageDeleteQueries } from "./deleteQueries";
import { MessageRow, NewMessageRow } from "./schema";

// Re-export so callers only need to import from MessageStore
export type Message = MessageRow;

/**
 * MessageStore
 *
 * Single API the rest of the app uses for local message persistence.
 *
 * Wraps the four query classes so nothing outside db/
 * needs to know about Drizzle or SQLite directly.
 */
export class MessageStore {
  // =========================================================
  // READ
  // =========================================================

  /**
   * All messages for a room, oldest → newest
   */
  getByRoom(roomId: string) {
    return messageGetQueries.getByRoom(roomId);
  }

  /**
   * Last N messages for initial FlatList render
   */
  getRecent(roomId: string, limit = 30) {
    return messageGetQueries.getRecent(roomId, limit);
  }

  /**
   * Older messages for infinite scroll
   */
  getOlderThan(roomId: string, beforeTimestamp: number, limit = 20) {
    return messageGetQueries.getOlderThan(roomId, beforeTimestamp, limit);
  }

  /**
   * Single message by localId
   */
  getByLocalId(localId: string) {
    return messageGetQueries.getByLocalId(localId);
  }

  /**
   * Single message by server id
   */
  getById(id: string) {
    return messageGetQueries.getById(id);
  }

  /**
   * Unread badge count for one room
   */
  getUnreadCount(roomId: string) {
    return messageGetQueries.getUnreadCount(roomId);
  }

  /**
   * Unread counts for all rooms
   */
  getAllUnreadCounts() {
    return messageGetQueries.getAllUnreadCounts();
  }

  /**
   * Last message preview for conversation list
   */
  getLastMessage(roomId: string) {
    return messageGetQueries.getLastMessage(roomId);
  }

  /**
   * Batch last-message fetch for multiple rooms
   */
  getLastMessages(roomIds: string[]) {
    return messageGetQueries.getLastMessages(roomIds);
  }

  /**
   * All failed messages in a room
   */
  getFailed(roomId: string) {
    return messageGetQueries.getFailed(roomId);
  }

  // =========================================================
  // WRITE
  // =========================================================

  /**
   * Save an optimistic outgoing message.
   */
  save(message: NewMessageRow) {
    return messageInsertQueries.insert(message);
  }

  /**
   * Save an incoming received message.
   *
   * IMPORTANT:
   * This should remain an UPSERT.
   */
  saveReceived(message: NewMessageRow) {
    return messageInsertQueries.upsert(message);
  }

  /**
   * Bulk upsert from server history sync.
   */
  saveMany(batch: NewMessageRow[]) {
    return messageInsertQueries.upsertMany(batch);
  }

  // =========================================================
  // UPDATE
  // =========================================================

  /**
   * Confirm an optimistic message after
   * the server responds.
   */
  confirm(localId: string, serverId: string, serverTimestamp?: number) {
    return messageUpdateQueries.confirm(localId, serverId, serverTimestamp);
  }

  /**
   * Mark a message as failed.
   */
  markFailed(localId: string) {
    return messageUpdateQueries.markFailed(localId);
  }

  /**
   * Mark a message as delivered.
   */
  markDelivered(messageId: string, roomId: string) {
    return messageUpdateQueries.markDelivered(messageId, roomId);
  }

  /**
   * Mark ONE specific message as read.
   *
   * This is the preferred method for read receipts.
   */
  markRead(messageId: string, roomId: string) {
    return messageUpdateQueries.markRead(messageId, roomId);
  }

  /**
   * Mark all RECEIVED messages in a room as read.
   *
   * Used when the current user opens the chat.
   */
  markRoomAsRead(roomId: string, upToTimestamp?: number) {
    return messageUpdateQueries.markRoomAsRead(roomId, upToTimestamp);
  }

  /**
   * ========================================================
   * NEW
   * ========================================================
   *
   * Mark the current user's SENT messages as READ.
   *
   * This is different from markRoomAsRead().
   *
   * markRoomAsRead():
   *   "I have read messages that I received."
   *
   * markSentMessagesAsRead():
   *   "The other person has read messages that I sent."
   *
   * This is used when the server sends:
   *
   * {
   *   conversationId,
   *   userId
   * }
   *
   * without a specific messageId.
   */
  async markSentMessagesAsRead(
    roomId: string,
    currentUserId: string,
  ): Promise<void> {
    const messages = await this.getByRoom(roomId);

    if (!messages || messages.length === 0) {
      return;
    }

    /**
     * Find messages that:
     *
     * 1. Were sent by the current user
     * 2. Are not already READ
     */
    const unreadSentMessages = messages.filter((message) => {
      const senderId = String(message.senderId ?? "");

      const status = String(message.status ?? "").toUpperCase();

      return senderId === currentUserId && status !== "READ";
    });

    if (unreadSentMessages.length === 0) {
      return;
    }

    /**
     * Update each message using the existing
     * markRead() query.
     *
     * This avoids needing another SQL query.
     */
    await Promise.all(
      unreadSentMessages.map((message) => this.markRead(message.id!, roomId)),
    );
  }

  /**
   * Update message text.
   */
  editText(localId: string, newText: string) {
    return messageUpdateQueries.editText(localId, newText);
  }

  /**
   * Reset status to sending before retry.
   */
  resetForRetry(localId: string) {
    return messageUpdateQueries.resetForRetry(localId);
  }

  /**
   * Generic patch.
   */
  patch(localId: string, patch: Partial<Omit<Message, "localId">>) {
    return messageUpdateQueries.patch(localId, patch);
  }

  // =========================================================
  // DELETE
  // =========================================================

  /**
   * Delete one message by localId or server id.
   */
  deleteOne(messageId: string) {
    return messageDeleteQueries.deleteOne(messageId);
  }

  /**
   * Delete multiple messages.
   */
  deleteMany(localIds: string[]) {
    return messageDeleteQueries.deleteMany(localIds);
  }

  /**
   * Clear all messages in a room.
   */
  deleteRoom(roomId: string) {
    return messageDeleteQueries.deleteRoom(roomId);
  }

  /**
   * Delete messages older than a given time.
   */
  deleteOlderThan(roomId: string, olderThanMs: number) {
    return messageDeleteQueries.deleteOlderThan(roomId, olderThanMs);
  }

  /**
   * Delete all failed messages in a room.
   */
  deleteAllFailed(roomId: string) {
    return messageDeleteQueries.deleteAllFailed(roomId);
  }

  /**
   * Wipe everything on logout.
   */
  deleteAll() {
    return messageDeleteQueries.deleteAll();
  }
}

export const messageStore = new MessageStore();
