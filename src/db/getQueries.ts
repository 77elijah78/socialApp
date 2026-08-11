import { db } from "./db";
import { messages, MessageRow, rooms, RoomRow } from "./schema";
import { eq, and, lt, desc, asc, ne, sql } from "drizzle-orm";

export class MessageGetQueries {
  async getByRoom(roomId: string): Promise<MessageRow[]> {
    return db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, roomId))
      .orderBy(asc(messages.timestamp));
  }

  async getRecent(roomId: string, limit = 30): Promise<MessageRow[]> {
    const rows = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, roomId))
      .orderBy(desc(messages.timestamp))
      .limit(limit);
    const seen = new Set<string>();
    const unique: MessageRow[] = [];
    for (const row of rows) {
      const key = row.localId ?? row.id;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(row);
      }
    }
    return unique.reverse();
  }

  async getOlderThan(
    roomId: string,
    beforeTimestamp: number,
    limit = 20,
  ): Promise<MessageRow[]> {
    const rows = await db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, roomId),
          lt(messages.timestamp, beforeTimestamp),
        ),
      )
      .orderBy(desc(messages.timestamp))
      .limit(limit);
    return rows.reverse();
  }

  async getByLocalId(localId: string): Promise<MessageRow | null> {
    const [row] = await db
      .select()
      .from(messages)
      .where(eq(messages.localId, localId))
      .limit(1);
    return row ?? null;
  }

  async getByServerId(id: string): Promise<MessageRow | null> {
    const [row] = await db
      .select()
      .from(messages)
      .where(eq(messages.id, id))
      .limit(1);
    return row ?? null;
  }

  async getById(id: string): Promise<MessageRow | null> {
    const [row] = await db
      .select()
      .from(messages)
      .where(eq(messages.id, id))
      .limit(1);
    return row ?? null;
  }

  async getUnreadCount(roomId: string, currentUserId: string): Promise<number> {
    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, roomId),
          ne(messages.senderId, currentUserId),
          ne(messages.status, "READ"),
        ),
      );
    return result?.count ?? 0;
  }

  async getAllUnreadCounts(currentUserId: string): Promise<Record<string, number>> {
    const rows = await db
      .select({
        conversationId: messages.conversationId,
        count: sql<number>`count(*)`,
      })
      .from(messages)
      .where(
        and(
          ne(messages.senderId, currentUserId),
          ne(messages.status, "READ"),
        ),
      )
      .groupBy(messages.conversationId);

    return Object.fromEntries(rows.map((r) => [r.conversationId, r.count]));
  }

  async getOldestMessageTimestamp(roomId: string): Promise<number | null> {
    const [row] = await db
      .select({ ts: messages.timestamp })
      .from(messages)
      .where(eq(messages.conversationId, roomId))
      .orderBy(asc(messages.timestamp))
      .limit(1);
    return row?.ts ?? null;
  }

  async getOldestMessageId(roomId: string): Promise<string | null> {
    const [row] = await db
      .select({ id: messages.id })
      .from(messages)
      .where(eq(messages.conversationId, roomId))
      .orderBy(asc(messages.timestamp))
      .limit(1);
    return row?.id ?? null;
  }

  async getFailed(roomId: string): Promise<MessageRow[]> {
    return db
      .select()
      .from(messages)
      .where(and(eq(messages.conversationId, roomId), eq(messages.status, "FAILED")))
      .orderBy(asc(messages.timestamp));
  }

  async getLastMessage(roomId: string): Promise<MessageRow | null> {
    const [row] = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, roomId))
      .orderBy(desc(messages.timestamp))
      .limit(1);
    return row ?? null;
  }

  async getLastMessages(
    roomIds: string[],
  ): Promise<Record<string, MessageRow>> {
    if (roomIds.length === 0) return {};

    const rows = await db
      .select()
      .from(messages)
      .where(sql`${messages.conversationId} IN ${roomIds}`)
      .orderBy(desc(messages.timestamp));

    const result: Record<string, MessageRow> = {};
    for (const row of rows) {
      if (!result[row.conversationId]) result[row.conversationId] = row;
    }
    return result;
  }
}

export class RoomGetQueries {
  async getAll(): Promise<RoomRow[]> {
    return db.select().from(rooms).orderBy(desc(rooms.lastMessageTimestamp));
  }
  async getByConversationId(conversationId: string) {
    return db
      .select()
      .from(rooms)
      .where(eq(rooms.conversationId, conversationId));
  }
}

export const messageGetQueries = new MessageGetQueries();
export const roomGetQueries = new RoomGetQueries();
