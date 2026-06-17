import { db } from "./db";
import { messages, MessageRow } from "./schema";
import { eq, and, lte, or } from "drizzle-orm";

type StatusValue = "sending" | "sent" | "delivered" | "read" | "failed";

/**
 * MessageUpdateQueries
 *
 * Handles all UPDATE operations for the messages table.
 */
export class MessageUpdateQueries {
  /**
   * Patch any fields on a message matched by localId.
   * The primary update primitive — all other methods call this.
   *
   * @param localId   Device-stable key
   * @param patch     Partial fields to merge
   * @returns          Updated row or null if not found
   */
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

  /**
   * Confirm a message after server accepts it.
   * Transitions: "sending" → "sent"
   * Also sets the real server-assigned id and corrects the timestamp.
   *
   * @param localId         Device-generated temp id
   * @param serverId        Real id from server response
   * @param serverTimestamp Unix ms from server (optional)
   */
  async confirm(
    localId: string,
    serverId: string,
    serverTimestamp?: number
  ): Promise<MessageRow | null> {
    return this.patch(localId, {
      id:        serverId,
      status:    "sent",
      ...(serverTimestamp && { timestamp: serverTimestamp }),
    });
  }

  /**
   * Mark a message as failed (network error, server rejection).
   * Transitions: "sending" → "failed"
   *
   * @param localId
   */
  async markFailed(localId: string): Promise<MessageRow | null> {
    return this.patch(localId, { status: "failed" });
  }

  /**
   * Mark a message as delivered (server confirmed recipient received it).
   * Transitions: "sent" → "delivered"
   *
   * @param localId   localId or server id — tries both
   * @param roomId    Used to scope the query
   */
  async markDelivered(
    messageId: string,
    roomId: string
  ): Promise<MessageRow | null> {
    // Match by either localId or server id
    const [row] = await db
      .update(messages)
      .set({ status: "delivered" })
      .where(
        and(
          eq(messages.roomId, roomId),
          or(eq(messages.localId, messageId), eq(messages.id, messageId))
        )
      )
      .returning();
    return row ?? null;
  }

  /**
   * Mark a message as read.
   * Transitions: "delivered" → "read"
   *
   * @param messageId  localId or server id
   * @param roomId
   */
  async markRead(
    messageId: string,
    roomId: string
  ): Promise<MessageRow | null> {
    const [row] = await db
      .update(messages)
      .set({ status: "read" })
      .where(
        and(
          eq(messages.roomId, roomId),
          or(eq(messages.localId, messageId), eq(messages.id, messageId))
        )
      )
      .returning();
    return row ?? null;
  }

  /**
   * Mark ALL received messages in a room as read (up to now).
   * Call when the user opens a conversation.
   *
   * @param roomId
   * @param upToTimestamp  Unix ms — only mark messages at or before this time
   */
  async markRoomAsRead(
    roomId: string,
    upToTimestamp: number = Date.now()
  ): Promise<number> {
    const rows = await db
      .update(messages)
      .set({ status: "read" })
      .where(
        and(
          eq(messages.roomId, roomId),
          eq(messages.direction, "received"),
          lte(messages.timestamp, upToTimestamp)
        )
      )
      .returning();
    return rows.length; // number of rows updated
  }

  /**
   * Edit the text content of a message.
   *
   * @param localId
   * @param newText
   */
  async editText(
    localId: string,
    newText: string
  ): Promise<MessageRow | null> {
    return this.patch(localId, { text: newText });
  }

  /**
   * Reset a failed message back to "sending" before a retry.
   *
   * @param localId
   */
  async resetForRetry(localId: string): Promise<MessageRow | null> {
    return this.patch(localId, { status: "sending" });
  }

  /**
   * Bulk update status for a list of messages (e.g. batch delivery receipts).
   *
   * @param localIds
   * @param status
   */
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
