import { messageInsertQueries } from "./insertQueries";
import { messageGetQueries }    from "./getQueries";
import { messageUpdateQueries } from "./updateQueries";
import { messageDeleteQueries } from "./deleteQueries";
import { MessageRow, NewMessageRow } from "./schema";

// Re-export so callers only need to import from MessageStore
export type Message = MessageRow;

/**
 * MessageStore — the single API the rest of the app uses for local message persistence.
 *
 * Wraps the four query classes so nothing outside db/ needs to know about
 * Drizzle or SQLite directly.
 *
 * Used by:
 *   - MessageService  (save optimistic, confirm, mark failed)
 *   - SocketReceiver  (save incoming messages)
 *   - useChat hook    (read messages, trigger re-renders)
 */
export class MessageStore {

  // ─── READ ─────────────────────────────────────────────────────────────────

  /** All messages for a room, oldest → newest */
  getByRoom(roomId: string) {
    return messageGetQueries.getByRoom(roomId);
  }

  /** Last N messages for initial FlatList render */
  getRecent(roomId: string, limit = 30) {
    return messageGetQueries.getRecent(roomId, limit);
  }

  /** Older messages for infinite scroll (load more) */
  getOlderThan(roomId: string, beforeTimestamp: number, limit = 20) {
    return messageGetQueries.getOlderThan(roomId, beforeTimestamp, limit);
  }

  /** Single message by localId */
  getByLocalId(localId: string) {
    return messageGetQueries.getByLocalId(localId);
  }

  /** Single message by server id */
  getById(id: string) {
    return messageGetQueries.getById(id);
  }

  /** Unread badge count for one room */
  getUnreadCount(roomId: string) {
    return messageGetQueries.getUnreadCount(roomId);
  }

  /** Unread counts for all rooms — for conversation list badges */
  getAllUnreadCounts() {
    return messageGetQueries.getAllUnreadCounts();
  }

  /** Last message preview for conversation list */
  getLastMessage(roomId: string) {
    return messageGetQueries.getLastMessage(roomId);
  }

  /** Batch last-message fetch for multiple rooms */
  getLastMessages(roomIds: string[]) {
    return messageGetQueries.getLastMessages(roomIds);
  }

  /** All failed messages in a room */
  getFailed(roomId: string) {
    return messageGetQueries.getFailed(roomId);
  }

  // ─── WRITE ────────────────────────────────────────────────────────────────

  /**
   * Save an optimistic message (direction: "sent", status: "sending").
   * Call immediately on user tap — before the network request.
   */
  save(message: NewMessageRow) {
    return messageInsertQueries.insert(message);
  }

  /**
   * Save an incoming received message (direction: "received").
   * Call from SocketReceiver on "message:new".
   */
  saveReceived(message: NewMessageRow) {
    return messageInsertQueries.upsert(message);
    
  }

  /**
   * Bulk upsert from server history sync.
   * Safe to call repeatedly — existing rows are updated, new rows inserted.
   */
  saveMany(batch: NewMessageRow[]) {
    return messageInsertQueries.upsertMany(batch);
  }

  // ─── UPDATE ───────────────────────────────────────────────────────────────

  /**
   * Confirm an optimistic message after server responds.
   * Sets real server id + transitions status to "sent".
   */
  confirm(localId: string, serverId: string, serverTimestamp?: number) {
    return messageUpdateQueries.confirm(localId, serverId, serverTimestamp);
  }

  /** Mark a message as failed after a network error */
  markFailed(localId: string) {
    return messageUpdateQueries.markFailed(localId);
  }

  /** Mark a message as delivered (server receipt) */
  markDelivered(messageId: string, roomId: string) {
    return messageUpdateQueries.markDelivered(messageId, roomId);
  }

  /** Mark a single message as read */
  markRead(messageId: string, roomId: string) {
    return messageUpdateQueries.markRead(messageId, roomId);
  }

  /** Mark all received messages in a room as read */
  markRoomAsRead(roomId: string, upToTimestamp?: number) {
    return messageUpdateQueries.markRoomAsRead(roomId, upToTimestamp);
  }

  /** Update the text of a message (after edit) */
  editText(localId: string, newText: string) {
    return messageUpdateQueries.editText(localId, newText);
  }

  /** Reset status to "sending" before a retry */
  resetForRetry(localId: string) {
    return messageUpdateQueries.resetForRetry(localId);
  }

  /** Generic patch — for any field update not covered above */
  patch(localId: string, patch: Partial<Omit<Message, "localId">>) {
    return messageUpdateQueries.patch(localId, patch);
  }

  // ─── DELETE ───────────────────────────────────────────────────────────────

  /** Delete one message by localId or server id */
  deleteOne(messageId: string) {
    return messageDeleteQueries.deleteOne(messageId);
  }

  /** Delete multiple messages */
  deleteMany(localIds: string[]) {
    return messageDeleteQueries.deleteMany(localIds);
  }

  /** Clear all messages in a room */
  deleteRoom(roomId: string) {
    return messageDeleteQueries.deleteRoom(roomId);
  }

  /** Delete messages older than a given time (storage cleanup) */
  deleteOlderThan(roomId: string, olderThanMs: number) {
    return messageDeleteQueries.deleteOlderThan(roomId, olderThanMs);
  }

  /** Delete all failed messages in a room */
  deleteAllFailed(roomId: string) {
    return messageDeleteQueries.deleteAllFailed(roomId);
  }

  /** Wipe everything — call on logout */
  deleteAll() {
    return messageDeleteQueries.deleteAll();
  }
}

export const messageStore = new MessageStore();
