import { db } from "./db";
import { messages, MessageRow } from "./schema";
import { eq, and, lte, or } from "drizzle-orm";

type StatusValue = "SENDING" | "SENT" | "DELIVERED" | "READ";

export class MessageUpdateQueries {
  async patch(
    localId: string,
    patch: Partial<Omit<MessageRow, "localId">>
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
    return this.patch(localId, {
      id:        serverId,
      status:    "SENT",
      ...(serverTimestamp && { timestamp: serverTimestamp }),
    });
  }

  async markFailed(localId: string): Promise<MessageRow | null> {
    return this.patch(localId, { status: "FAILED" });
  }

  async markDelivered(
    messageId: string,
    conversationId: string
  ): Promise<MessageRow | null> {
    const [row] = await db
      .update(messages)
      .set({ status: "DELIVERED" })
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
    const [row] = await db
      .update(messages)
      .set({ status: "READ", isRead: true })
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
    const rows = await db
      .update(messages)
      .set({ status: "READ", isRead: true })
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
    return this.patch(localId, { content: newText });
  }

  async resetForRetry(localId: string): Promise<MessageRow | null> {
    return this.patch(localId, { status: "SENDING" });
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
}

export const messageUpdateQueries = new MessageUpdateQueries();
