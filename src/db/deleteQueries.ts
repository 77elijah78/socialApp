import { db } from "./db";
import { messages, rooms } from "./schema";
import { eq, and, lt, or } from "drizzle-orm";

export class MessageDeleteQueries {
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

  async deleteRoom(conversationId: string): Promise<number> {
    const rows = await db
      .delete(messages)
      .where(eq(messages.conversationId, conversationId))
      .returning();
    return rows.length;
  }

  async deleteOlderThan(conversationId: string, olderThanMs: number): Promise<number> {
    const rows = await db
      .delete(messages)
      .where(
        and(
          eq(messages.conversationId, conversationId),
          lt(messages.timestamp, olderThanMs)
        )
      )
      .returning();
    return rows.length;
  }

  async deleteAllFailed(conversationId: string): Promise<number> {
    const rows = await db
      .delete(messages)
      .where(
        and(
          eq(messages.conversationId, conversationId),
          eq(messages.status, "FAILED")
        )
      )
      .returning();
    return rows.length;
  }

  async deleteAll(): Promise<number> {
    const rows = await db.delete(messages).returning();
    return rows.length;
  }
}

export class RoomDeleteQueries {
  async deleteOne(roomId: string) {
    await db
      .delete(rooms)
      .where(eq(rooms.id, roomId));
  }

  async deleteAll(): Promise<number> {
    const rows = await db.delete(rooms).returning();
    return rows.length;
  }
}

export const messageDeleteQueries = new MessageDeleteQueries();
export const roomDeleteQueries = new RoomDeleteQueries();
