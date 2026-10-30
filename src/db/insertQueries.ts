import { db, withDatabaseTransaction } from "./db";
import {
  messages,
  type NewMessageRow,
  type MessageRow,
  type NewRoomRow,
  type RoomRow,
  rooms,
} from "./schema";
import { inArray, or, eq, and, lte, sql } from "drizzle-orm";
import { synchronizeReplySnapshots } from "./replySnapshots";
import { mergePersistedMessage } from "../utils/messaging/timeline";

export class MessageInsertQueries {
  async insert(message: NewMessageRow): Promise<MessageRow> {
    const [row] = await db.insert(messages).values(message).returning();
    return row;
  }

  async upsert(message: NewMessageRow): Promise<MessageRow> {
    return (await this.upsertMany([message]))[0];
  }

  /** Realtime receipt and its global unread delta are one transaction. A partial
   * message cache must never replace the server's whole-conversation count. */
  async upsertReceived(
    message: NewMessageRow,
    userId: string,
  ): Promise<MessageRow> {
    return withDatabaseTransaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(messages)
        .where(
          or(
            eq(messages.id, message.id ?? message.localId),
            eq(messages.localId, message.localId),
          ),
        )
        .limit(1);
      const next = mergePersistedMessage(existing, message);
      const { localId: _key, ...patch } = next;
      const [row] = await tx
        .insert(messages)
        .values(next)
        .onConflictDoUpdate({ target: messages.localId, set: patch })
        .returning();
      if (
        !existing &&
        row.senderId !== userId &&
        row.status !== "READ" &&
        !row.isRead &&
        !row.deletedAt
      ) {
        await tx
          .update(rooms)
          .set({
            unreadCount: sql`COALESCE(${rooms.unreadCount}, 0) + 1`,
            updatedAt: Date.now(),
          })
          .where(
            and(
              eq(rooms.conversationId, row.conversationId),
              lte(rooms.lastMessageTimestamp, message.timestamp),
            ),
          );
      }
      return (await synchronizeReplySnapshots(tx, [row]))[0];
    });
  }

  async upsertMany(
    batch: NewMessageRow[],
    requestStartedAt?: number,
  ): Promise<MessageRow[]> {
    if (!batch.length) return [];
    return withDatabaseTransaction(async (tx) => {
      const ids = batch.flatMap((row) =>
        row.id ? [row.id, row.localId] : [row.localId],
      );
      const existing = await tx
        .select()
        .from(messages)
        .where(or(inArray(messages.id, ids), inArray(messages.localId, ids)));
      const byId = new Map<string, MessageRow>();
      for (const row of existing) {
        byId.set(row.localId, row);
        if (row.id) byId.set(row.id, row);
      }
      const canonical = new Map<string, NewMessageRow>();
      const pendingByIdentity = new Map<string, NewMessageRow>();
      for (const message of batch) {
        const local =
          pendingByIdentity.get(message.id ?? message.localId) ??
          pendingByIdentity.get(message.localId) ??
          byId.get(message.id ?? message.localId) ??
          byId.get(message.localId);
        const next = mergePersistedMessage(local, message, requestStartedAt);
        canonical.set(next.localId, next);
        pendingByIdentity.set(next.localId, next);
        if (next.id) pendingByIdentity.set(next.id, next);
      }
      const result: MessageRow[] = [];
      // Bounded pages avoid SQLite parameter limits and giant synchronous JS work.
      for (const message of canonical.values()) {
        const { localId, ...patch } = message;
        const [row] = await tx
          .insert(messages)
          .values(message)
          .onConflictDoUpdate({ target: messages.localId, set: patch })
          .returning();
        result.push(row);
      }
      return synchronizeReplySnapshots(tx, result);
    });
  }
}

export class RoomsInsertQueries {
  async insert(room: NewRoomRow): Promise<RoomRow> {
    return this.upsert(room);
  }

  async upsert(room: NewRoomRow): Promise<RoomRow> {
    const { id, conversationId, ...patch } = room;
    const [row] = await db
      .insert(rooms)
      .values(room)
      .onConflictDoUpdate({
        target: rooms.conversationId,
        set: { ...patch, cachedAt: Date.now(), updatedAt: Date.now() },
      })
      .returning();
    return row;
  }
}

export const messageInsertQueries = new MessageInsertQueries();
export const roomInsertQueries = new RoomsInsertQueries();
