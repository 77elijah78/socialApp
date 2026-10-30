import { receiptQueue } from "./receiptQueue";
import { syncStateStore } from "./syncStateStore";
import { messageInsertQueries } from "./insertQueries";
import { messageGetQueries } from "./getQueries";
import { messageUpdateQueries } from "./updateQueries";
import { messageDeleteQueries } from "./deleteQueries";
import type { MessageRow, NewMessageRow } from "./schema";
import type { MessageCursor } from "../utils/messaging/timeline";
import {
  invalidateRecentMessageCache,
  clearRecentMessageCache,
} from "../utils/recentMessageCache";

export type Message = MessageRow;
export type MessageChange =
  | { type: "upsert"; conversationId: string; rows: MessageRow[] }
  | { type: "clear"; conversationId?: string };
type Subscriber = (change: MessageChange) => void;

/** One persistence boundary and one incremental notification per committed write. */
export class MessageStore {
  private subscribers = new Set<Subscriber>();
  private cacheGeneration = 0;
  private roomVersions = new Map<string, number>();

  getRoomVersion(conversationId: string) {
    return `${this.cacheGeneration}:${this.roomVersions.get(conversationId) ?? 0}`;
  }
  private outgoing = new Map<
    string,
    { count: number; settled: Promise<void>; resolve: () => void }
  >();

  subscribe(listener: Subscriber): () => void {
    this.subscribers.add(listener);
    return () => {
      this.subscribers.delete(listener);
    };
  }

  private publish(change: MessageChange) {
    if (change.conversationId)
      invalidateRecentMessageCache(change.conversationId);
    else clearRecentMessageCache();
    for (const listener of this.subscribers) {
      try {
        listener(change);
      } catch (error) {
        if (__DEV__) console.warn("[MessageStore] subscriber failed", error);
      }
    }
  }

  private publishRows(rows: MessageRow[]) {
    const byRoom = new Map<string, MessageRow[]>();
    for (const row of rows) {
      const group = byRoom.get(row.conversationId) ?? [];
      group.push(row);
      byRoom.set(row.conversationId, group);
    }
    for (const [conversationId, group] of byRoom)
      this.publish({ type: "upsert", conversationId, rows: group });
    return rows;
  }

  private async changed(work: Promise<MessageRow | null>) {
    const row = await work;
    if (row) this.publishRows([row]);
    return row;
  }

  /** Defer uncorrelated own echoes until REST confirms the canonical localId. No content guessing. */
  beginOutgoing(senderId: string): () => void {
    let entry = this.outgoing.get(senderId);
    if (!entry) {
      let resolve!: () => void;
      const settled = new Promise<void>((done) => {
        resolve = done;
      });
      entry = { count: 0, settled, resolve };
      this.outgoing.set(senderId, entry);
    }
    entry.count += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      if (--entry.count === 0) {
        if (this.outgoing.get(senderId) === entry)
          this.outgoing.delete(senderId);
        entry.resolve();
      }
    };
  }

  resetOutgoing() {
    for (const entry of this.outgoing.values()) entry.resolve();
    this.outgoing.clear();
  }

  async waitForOutgoing(senderId: string) {
    await this.outgoing.get(senderId)?.settled;
  }

  getByRoom(roomId: string) {
    return messageGetQueries.getByRoom(roomId);
  }
  getByIds(roomId: string, ids: string[]) {
    return messageGetQueries.getByIds(roomId, ids);
  }
  getRecent(roomId: string, limit = 30) {
    return messageGetQueries.getRecent(roomId, limit);
  }
  getOlderThan(roomId: string, cursor: MessageCursor, limit = 30) {
    return messageGetQueries.getOlderThan(roomId, cursor, limit);
  }
  getFromMessage(roomId: string, parent: MessageRow) {
    return messageGetQueries.getFromMessage(roomId, parent);
  }
  getReplies(roomId: string, parentIds: string[]) {
    return messageGetQueries.getReplies(roomId, parentIds);
  }
  getByLocalId(id: string) {
    return messageGetQueries.getByLocalId(id);
  }
  getByServerId(id: string) {
    return messageGetQueries.getByServerId(id);
  }
  getById(id: string) {
    return messageGetQueries.getById(id);
  }
  getUnreadCount(roomId: string, userId: string) {
    return messageGetQueries.getUnreadCount(roomId, userId);
  }
  getAllUnreadCounts(userId: string) {
    return messageGetQueries.getAllUnreadCounts(userId);
  }
  getLastMessage(roomId: string) {
    return messageGetQueries.getLastMessage(roomId);
  }
  getLastMessages(roomIds: string[]) {
    return messageGetQueries.getLastMessages(roomIds);
  }
  getOldestMessageTimestamp(roomId: string) {
    return messageGetQueries.getOldestMessageTimestamp(roomId);
  }
  getOldestMessageId(roomId: string) {
    return messageGetQueries.getOldestMessageId(roomId);
  }
  getFailed(roomId: string) {
    return messageGetQueries.getFailed(roomId);
  }
  getReceiptCandidates(userId: string, afterLocalId = "", limit = 100) {
    return messageGetQueries.getReceiptCandidates(userId, afterLocalId, limit);
  }
  getReadReceipts(roomId: string, userId: string) {
    return messageGetQueries.getReadReceipts(roomId, userId);
  }

  async save(message: NewMessageRow) {
    const row = await messageInsertQueries.insert(message);
    this.publishRows([row]);
    return row;
  }
  async saveReceived(
    message: NewMessageRow,
    isCurrent: () => boolean = () => true,
    currentUserId?: string,
  ) {
    const roomVersion = this.getRoomVersion(message.conversationId);
    await this.waitForOutgoing(message.senderId);
    if (
      !isCurrent() ||
      roomVersion !== this.getRoomVersion(message.conversationId)
    )
      return null;
    const row = currentUserId
      ? await messageInsertQueries.upsertReceived(message, currentUserId)
      : await messageInsertQueries.upsert(message);
    this.publishRows([row]);
    return row;
  }
  async saveMany(batch: NewMessageRow[], requestStartedAt?: number) {
    return this.publishRows(await messageInsertQueries.upsertMany(batch, requestStartedAt));
  }
  confirm(localId: string, serverId: string, timestamp?: number) {
    return this.changed(
      messageUpdateQueries.confirm(localId, serverId, timestamp),
    );
  }
  async recoverUnfinishedSends() {
    return this.publishRows(
      await messageUpdateQueries.recoverUnfinishedSends(),
    );
  }
  markFailed(localId: string) {
    return this.changed(messageUpdateQueries.markFailed(localId));
  }
  markDelivered(id: string, roomId: string) {
    return this.changed(messageUpdateQueries.markDelivered(id, roomId));
  }
  markRead(id: string, roomId: string, currentUserId?: string) {
    return this.changed(
      messageUpdateQueries.markRead(id, roomId, currentUserId),
    );
  }
  async markVisibleReadIds(ids: string[], roomId: string, userId: string) {
    return this.publishRows(
      await messageUpdateQueries.markVisibleReadIds(ids, roomId, userId),
    );
  }
  async markReadIds(ids: string[], roomId: string) {
    return this.publishRows(
      await messageUpdateQueries.markReadIds(ids, roomId),
    );
  }
  async markRoomAsRead(roomId: string, timestamp?: number) {
    return this.publishRows(
      await messageUpdateQueries.markRoomAsRead(roomId, timestamp),
    ).length;
  }
  async markSentMessagesAsRead(roomId: string, senderId: string) {
    this.publishRows(
      await messageUpdateQueries.markSentMessagesAsRead(roomId, senderId),
    );
  }
  editText(id: string, text: string) {
    return this.changed(messageUpdateQueries.editText(id, text));
  }
  resetForRetry(localId: string) {
    return this.changed(messageUpdateQueries.resetForRetry(localId));
  }
  patch(id: string, patch: Partial<Omit<MessageRow, "localId">>) {
    return this.changed(messageUpdateQueries.patch(id, patch));
  }

  /** Keep a local tombstone: an in-flight history response must not resurrect a deletion. */
  async deleteOne(id: string, currentUserId?: string) {
    return Boolean(
      await this.changed(messageUpdateQueries.tombstone(id, currentUserId)),
    );
  }
  async deleteMany(ids: string[]) {
    return (await Promise.all(ids.map((id) => this.deleteOne(id)))).filter(
      Boolean,
    ).length;
  }
  async deleteRoom(roomId: string) {
    this.roomVersions.set(roomId, (this.roomVersions.get(roomId) ?? 0) + 1);
    const count = await messageDeleteQueries.deleteRoom(roomId);
    await receiptQueue.deleteRoom(roomId);
    await syncStateStore.delete(roomId);
    this.publish({ type: "clear", conversationId: roomId });
    return count;
  }
  deleteOlderThan(roomId: string, timestamp: number) {
    return messageDeleteQueries.deleteOlderThan(roomId, timestamp);
  }
  deleteAllFailed(roomId: string) {
    return messageDeleteQueries.deleteAllFailed(roomId);
  }
  async deleteAll() {
    this.cacheGeneration += 1;
    this.roomVersions.clear();
    const count = await messageDeleteQueries.deleteAll();
    this.publish({ type: "clear" });
    return count;
  }
}
export const messageStore = new MessageStore();
