import { db } from "./db";
import { messages, MessageRow, rooms, RoomRow } from "./schema";
import { eq, and, lte, or } from "drizzle-orm";

type StatusValue = "SENDING" | "SENT" | "DELIVERED" | "READ" | "FAILED";

export class MessageUpdateQueries {
  async patch(
    localId: string,
    patch: Partial<Omit<MessageRow, "localId">> & { localId?: string }
  ): Promise<MessageRow | null> {
    const [row] = await db
      .update(messages)
      .set(patch)
      .where(eq(messages.localId, localId))
      .returning();
    return row ?? null;
  }

  async confirm(
    localId: string,
    serverId: string,
    serverTimestamp?: number
  ): Promise<MessageRow | null> {
    const nowIso = new Date().toISOString();
    return this.patch(localId, {
      id:        serverId,
      localId:   localId,
      status:    "SENT",
      failedAt:  null,
      retryCount: 0,
      ...(serverTimestamp && { timestamp: serverTimestamp }),
      updatedAt: nowIso,
    });
  }

  async markFailed(localId: string): Promise<MessageRow | null> {
    const nowIso = new Date().toISOString();
    return this.patch(localId, {
      status: "FAILED",
      failedAt: nowIso,
      updatedAt: nowIso,
    });
  }

  async resetForRetry(localId: string): Promise<MessageRow | null> {
    const nowIso = new Date().toISOString();
    const [row] = await db
      .update(messages)
      .set({ status: "SENDING", failedAt: null, updatedAt: nowIso })
      .where(eq(messages.localId, localId))
      .returning();
    return row ?? null;
  }

  async markDelivered(
    messageId: string,
    conversationId: string
  ): Promise<MessageRow | null> {
    const nowIso = new Date().toISOString();
    const [row] = await db
      .update(messages)
      .set({ status: "DELIVERED", deliveredAt: nowIso, updatedAt: nowIso })
      .where(
        and(
          eq(messages.conversationId, conversationId),
          or(eq(messages.localId, messageId), eq(messages.id, messageId))
        )
      )
      .returning();
    return row ?? null;
  }

  async markRead(
    messageId: string,
    conversationId: string
  ): Promise<MessageRow | null> {
    const nowIso = new Date().toISOString();
    const [row] = await db
      .update(messages)
      .set({ status: "READ", isRead: true, readAt: nowIso, updatedAt: nowIso })
      .where(
        and(
          eq(messages.conversationId, conversationId),
          or(eq(messages.localId, messageId), eq(messages.id, messageId))
        )
      )
      .returning();
    return row ?? null;
  }

  async markRoomAsRead(
    conversationId: string,
    upToTimestamp: number = Date.now()
  ): Promise<number> {
    const nowIso = new Date().toISOString();
    const rows = await db
      .update(messages)
      .set({ status: "READ", isRead: true, readAt: nowIso, updatedAt: nowIso })
      .where(
        and(
          eq(messages.conversationId, conversationId),
          lte(messages.timestamp, upToTimestamp)
        )
      )
      .returning();
    return rows.length;
  }

  async editText(
    localId: string,
    newText: string
  ): Promise<MessageRow | null> {
    const nowIso = new Date().toISOString();
    return this.patch(localId, { content: newText, updatedAt: nowIso });
  }

  async bulkSetStatus(
    localIds: string[],
    status: StatusValue
  ): Promise<void> {
    if (localIds.length === 0) return;
    await Promise.all(
      localIds.map((id) =>
        db
          .update(messages)
          .set({ status })
          .where(eq(messages.localId, id))
      )
    );
  }

  async updateRoom(
    conversationId: string,
    patch: Partial<Omit<RoomRow, "id" | "conversationId">>
  ): Promise<RoomRow | null> {
    const [row] = await db
      .update(rooms)
      .set(patch)
      .where(eq(rooms.conversationId, conversationId))
      .returning();
    return row ?? null;
  }
}

export class RoomUpdateQueries {
  async updateRoom(
    conversationId: string,
    patch: Partial<Omit<RoomRow, "id" | "conversationId">>
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
