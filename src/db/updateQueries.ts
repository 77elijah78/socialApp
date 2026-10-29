import { db, withDatabaseTransaction } from "./db";
import {
  messages,
  type MessageRow,
  rooms,
  receiptOutbox,
  type RoomRow,
} from "./schema";
import { eq, and, lte, or, ne, inArray, sql, isNull } from "drizzle-orm";
import { mergePersistedMessage } from "../utils/messaging/timeline";

type StatusValue = "SENDING" | "SENT" | "DELIVERED" | "READ" | "FAILED";

export class MessageUpdateQueries {
  async patch(
    id: string,
    patch: Partial<Omit<MessageRow, "localId">>,
  ): Promise<MessageRow | null> {
    const [row] = await db
      .update(messages)
      .set(patch)
      .where(or(eq(messages.localId, id), eq(messages.id, id)))
      .returning();
    return row ?? null;
  }

  async tombstone(
    id: string,
    currentUserId?: string,
  ): Promise<MessageRow | null> {
    return withDatabaseTransaction(async (tx) => {
      const now = new Date().toISOString();
      const [row] = await tx
        .update(messages)
        .set({ deletedAt: now, updatedAt: now })
        .where(
          and(
            or(eq(messages.localId, id), eq(messages.id, id)),
            isNull(messages.deletedAt),
          ),
        )
        .returning();
      if (!row) return null;
      if (
        currentUserId &&
        row.senderId !== currentUserId &&
        row.status !== "READ" &&
        !row.isRead
      ) {
        await tx
          .update(rooms)
          .set({
            unreadCount: sql`MAX(0, COALESCE(${rooms.unreadCount}, 0) - 1)`,
            updatedAt: Date.now(),
          })
          .where(eq(rooms.conversationId, row.conversationId));
      }
      if (row.id)
        await tx
          .delete(receiptOutbox)
          .where(eq(receiptOutbox.messageId, row.id));
      return row;
    });
  }

  async confirm(
    localId: string,
    serverId: string,
    _serverTimestamp?: number,
  ): Promise<MessageRow | null> {
    return withDatabaseTransaction(async (tx) => {
      const rows = await tx
        .select()
        .from(messages)
        .where(or(eq(messages.localId, localId), eq(messages.id, serverId)));
      const optimistic = rows.find((row) => row.localId === localId);
      if (!optimistic) return null;
      const echo = rows.find(
        (row) => row.localId !== localId && row.id === serverId,
      );
      const next = mergePersistedMessage(optimistic, {
        ...optimistic,
        ...echo,
        localId,
        id: serverId,
        status: echo?.status ?? "SENT",
        failedAt: null,
      });
      if (echo)
        await tx.delete(messages).where(eq(messages.localId, echo.localId));
      const { localId: _key, ...patch } = next;
      const [row] = await tx
        .update(messages)
        .set(patch)
        .where(eq(messages.localId, localId))
        .returning();
      return row ?? null;
    });
  }

  async recoverUnfinishedSends(): Promise<MessageRow[]> {
    return db
      .update(messages)
      .set({ status: "FAILED", failedAt: new Date().toISOString() })
      .where(eq(messages.status, "SENDING"))
      .returning();
  }

  markFailed(localId: string) {
    return this.patch(localId, {
      status: "FAILED",
      failedAt: new Date().toISOString(),
    });
  }

  async resetForRetry(localId: string): Promise<MessageRow | null> {
    const [row] = await db
      .update(messages)
      .set({
        status: "SENDING",
        failedAt: null,
        retryCount: sql`${messages.retryCount} + 1`,
      })
      .where(and(eq(messages.localId, localId), eq(messages.status, "FAILED")))
      .returning();
    return row ?? null;
  }

  async markDelivered(
    messageId: string,
    conversationId: string,
  ): Promise<MessageRow | null> {
    const [row] = await db
      .update(messages)
      .set({ status: "DELIVERED", deliveredAt: new Date().toISOString() })
      .where(
        and(
          eq(messages.conversationId, conversationId),
          ne(messages.status, "READ"),
          ne(messages.status, "DELIVERED"),
          or(eq(messages.localId, messageId), eq(messages.id, messageId)),
        ),
      )
      .returning();
    return row ?? null;
  }

  async markRead(
    messageId: string,
    conversationId: string,
    currentUserId?: string,
  ): Promise<MessageRow | null> {
    return (
      (await this.markReadIds([messageId], conversationId, currentUserId))[0] ??
      null
    );
  }

  async markReadIds(
    ids: string[],
    conversationId: string,
    currentUserId?: string,
  ): Promise<MessageRow[]> {
    if (!ids.length) return [];
    return withDatabaseTransaction(async (tx) => {
      const rows = await tx
        .update(messages)
        .set({ status: "READ", isRead: true, readAt: new Date().toISOString() })
        .where(
          and(
            eq(messages.conversationId, conversationId),
            ne(messages.status, "READ"),
            or(inArray(messages.localId, ids), inArray(messages.id, ids)),
          ),
        )
        .returning();
      const received = currentUserId
        ? rows.filter((row) => row.senderId !== currentUserId).length
        : 0;
      if (received)
        await tx
          .update(rooms)
          .set({
            unreadCount: sql`MAX(0, COALESCE(${rooms.unreadCount}, 0) - ${received})`,
            updatedAt: Date.now(),
          })
          .where(eq(rooms.conversationId, conversationId));
      return rows;
    });
  }

  async markVisibleReadIds(
    ids: string[],
    conversationId: string,
    userId: string,
  ): Promise<MessageRow[]> {
    if (!ids.length) return [];
    return withDatabaseTransaction(async (tx) => {
      const rows = await tx
        .update(messages)
        .set({ status: "READ", isRead: true, readAt: new Date().toISOString() })
        .where(
          and(
            eq(messages.conversationId, conversationId),
            ne(messages.senderId, userId),
            isNull(messages.deletedAt),
            ne(messages.status, "READ"),
            inArray(messages.id, ids),
          ),
        )
        .returning();
      if (rows.length)
        await tx
          .insert(receiptOutbox)
          .values(
            rows.map((row) => ({
              key: `READ:${row.id}`,
              messageId: row.id!,
              conversationId,
              kind: "READ",
            })),
          )
          .onConflictDoNothing();
      if (rows.length)
        await tx
          .update(rooms)
          .set({
            unreadCount: sql`MAX(0, COALESCE(${rooms.unreadCount}, 0) - ${rows.length})`,
            updatedAt: Date.now(),
          })
          .where(eq(rooms.conversationId, conversationId));
      return rows;
    });
  }

  async markRoomAsRead(
    conversationId: string,
    upToTimestamp = Date.now(),
  ): Promise<MessageRow[]> {
    return db
      .update(messages)
      .set({ status: "READ", isRead: true, readAt: new Date().toISOString() })
      .where(
        and(
          eq(messages.conversationId, conversationId),
          lte(messages.timestamp, upToTimestamp),
          ne(messages.status, "READ"),
        ),
      )
      .returning();
  }

  async markSentMessagesAsRead(
    conversationId: string,
    senderId: string,
  ): Promise<MessageRow[]> {
    return db
      .update(messages)
      .set({ status: "READ", isRead: true, readAt: new Date().toISOString() })
      .where(
        and(
          eq(messages.conversationId, conversationId),
          eq(messages.senderId, senderId),
          inArray(messages.status, ["SENT", "DELIVERED"]),
        ),
      )
      .returning();
  }

  editText(id: string, content: string) {
    const now = new Date().toISOString();
    return this.patch(id, { content, editedAt: now, updatedAt: now });
  }

  async bulkSetStatus(localIds: string[], status: StatusValue): Promise<void> {
    if (!localIds.length) return;
    await db
      .update(messages)
      .set({ status })
      .where(inArray(messages.localId, localIds));
  }
}

export class RoomUpdateQueries {
  async updateRoom(
    conversationId: string,
    patch: Partial<Omit<RoomRow, "id" | "conversationId">>,
  ): Promise<RoomRow | null> {
    const [row] = await db
      .update(rooms)
      .set(patch)
      .where(eq(rooms.conversationId, conversationId))
      .returning();
    return row ?? null;
  }
}

export const messageUpdateQueries = new MessageUpdateQueries();
export const roomUpdateQueries = new RoomUpdateQueries();
