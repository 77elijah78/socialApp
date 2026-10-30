import { db, withDatabaseTransaction } from "./db";
import {
  messages,
  type MessageRow,
  rooms,
  receiptOutbox,
  messageInvalidations,
  type RoomRow,
} from "./schema";
import { eq, and, lte, or, ne, inArray, sql, isNull } from "drizzle-orm";
import { synchronizeReplySnapshots, redactReplySnapshots } from "./replySnapshots";
import { mergePersistedMessage } from "../utils/messaging/timeline";
import { applyMessageInvalidations, type DeletionScope } from "./deletionState";

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
    scope?: DeletionScope,
  ): Promise<MessageRow | null> {
    return withDatabaseTransaction(async (tx) => {
      const [existing] = await tx.select().from(messages)
        .where(or(eq(messages.localId, id), eq(messages.id, id))).limit(1);
      if (existing && scope && existing.conversationId !== scope.conversationId) return null;
      const conversationId = scope?.conversationId ?? existing?.conversationId;
      if (!conversationId) return null;
      const now = scope?.deletedAt || existing?.deletedAt || new Date().toISOString();
      const messageId = existing?.id ?? id;
      const invalidation = tx.insert(messageInvalidations).values({
        conversationId, messageId, deletedAt: now,
        deletedBy: scope?.deletedBy ?? currentUserId ?? null,
        deletionMode: scope?.deleteFor ?? "me",
      });
      if (scope?.deleteFor === "everyone") {
        await invalidation.onConflictDoUpdate({
          target: [messageInvalidations.conversationId, messageInvalidations.messageId],
          set: { deletionMode: "everyone", deletedAt: now, deletedBy: scope?.deletedBy ?? currentUserId ?? null },
          where: ne(messageInvalidations.deletionMode, "everyone"),
        });
      } else await invalidation.onConflictDoNothing();
      const [row] = await tx.update(messages).set({
        deletedAt: now, updatedAt: now, deletedBy: scope?.deletedBy ?? currentUserId ?? null,
        content: null, mediaUrl: null, thumbnailUrl: null, attachmentData: null,
        duration: null, replyData: null,
      }).where(and(eq(messages.conversationId, conversationId),
        or(eq(messages.localId, id), eq(messages.id, id)), isNull(messages.deletedAt))).returning();
      await redactReplySnapshots(tx, conversationId, [id, messageId, existing?.localId ?? id]);
      if (row && currentUserId && row.senderId !== currentUserId && row.status !== "READ" && !row.isRead) {
        await tx.update(rooms).set({
          unreadCount: sql`MAX(0, COALESCE(${rooms.unreadCount}, 0) - 1)`, updatedAt: Date.now(),
        }).where(eq(rooms.conversationId, conversationId));
      }
      await tx.delete(receiptOutbox).where(and(
        eq(receiptOutbox.conversationId, conversationId),
        inArray(receiptOutbox.messageId, [id, messageId]),
      ));
      return row ?? null;
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
      const next = (await applyMessageInvalidations(tx, [mergePersistedMessage(optimistic, {
        ...optimistic,
        ...echo,
        localId,
        id: serverId,
        status: echo?.status ?? "SENT",
        failedAt: null,
      })]))[0];
      if (echo)
        await tx.delete(messages).where(eq(messages.localId, echo.localId));
      const { localId: _key, ...patch } = next;
      const [row] = await tx
        .update(messages)
        .set(patch)
        .where(eq(messages.localId, localId))
        .returning();
      return row ? (await synchronizeReplySnapshots(tx, [row]))[0] : null;
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

  editText(id: string, content: string, conversationId?: string) {
    const now = new Date().toISOString();
    return withDatabaseTransaction(async (tx) => {
      const [row] = await tx.update(messages).set({ content, editedAt: now, updatedAt: now })
        .where(and(or(eq(messages.localId, id), eq(messages.id, id)),
          conversationId ? eq(messages.conversationId, conversationId) : undefined,
          isNull(messages.deletedAt))).returning();
      if (row) await synchronizeReplySnapshots(tx, [row]);
      return row ?? null;
    });
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
