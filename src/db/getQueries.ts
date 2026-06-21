import { db } from "./db";
import { messages, MessageRow, rooms, RoomRow } from "./schema";
import { eq, and, lt, desc, asc, ne, sql } from "drizzle-orm";

/**
 * MessageGetQueries
 *
 * Handles all SELECT operations for the messages table.
 */
export class MessageGetQueries {
  /**
   * Get all messages for a room, sorted oldest → newest (FlatList order).
   *
   * @param roomId
   * @returns MessageRow[]
   */
  async getByRoom(roomId: string): Promise<MessageRow[]> {
    return db
      .select()
      .from(messages)
      .where(eq(messages.roomId, roomId))
      .orderBy(asc(messages.timestamp));
  }

  /**
   * Get the N most recent messages for a room (initial load).
   * Returns in oldest → newest order so FlatList renders correctly.
   *
   * @param roomId
   * @param limit   Number of messages to return (default 30)
   */
  async getRecent(roomId: string, limit = 30): Promise<MessageRow[]> {
    // Fetch newest N, then reverse for chronological order
    const rows = await db
      .select()
      .from(messages)
      .where(eq(messages.roomId, roomId))
      .orderBy(desc(messages.timestamp))
      .limit(limit);
    return rows.reverse();
  }

  /**
   * Get a page of older messages for infinite scroll (load more).
   * Call when the user scrolls to the top of the FlatList.
   *
   * @param roomId
   * @param beforeTimestamp  Load messages older than this Unix ms timestamp
   * @param limit
   */
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
          eq(messages.roomId, roomId),
          lt(messages.timestamp, beforeTimestamp),
        ),
      )
      .orderBy(desc(messages.timestamp))
      .limit(limit);
    return rows.reverse();
  }

  /**
   * Get a single message by its localId (device-generated stable key).
   *
   * @param localId
   */
  async getByLocalId(localId: string): Promise<MessageRow | null> {
    const [row] = await db
      .select()
      .from(messages)
      .where(eq(messages.localId, localId))
      .limit(1);
    return row ?? null;
  }

  /**
   * Get a single message by its server-assigned id.
   *
   * @param id  Server message id
   */
  async getById(id: string): Promise<MessageRow | null> {
    const [row] = await db
      .select()
      .from(messages)
      .where(eq(messages.id, id))
      .limit(1);
    return row ?? null;
  }

  /**
   * Count unread received messages in a room.
   * Used for the unread badge on the conversation list.
   *
   * @param roomId
   */
  async getUnreadCount(roomId: string): Promise<number> {
    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(messages)
      .where(
        and(
          eq(messages.roomId, roomId),
          eq(messages.direction, "received"),
          ne(messages.status, "read"),
        ),
      );
    return result?.count ?? 0;
  }

  /**
   * Get unread counts for ALL rooms at once.
   * Used to populate badges on the conversation list screen.
   *
   * @returns Record<roomId, unreadCount>
   */
  async getAllUnreadCounts(): Promise<Record<string, number>> {
    const rows = await db
      .select({
        roomId: messages.roomId,
        count: sql<number>`count(*)`,
      })
      .from(messages)
      .where(
        and(eq(messages.direction, "received"), ne(messages.status, "read")),
      )
      .groupBy(messages.roomId);

    return Object.fromEntries(rows.map((r) => [r.roomId, r.count]));
  }

  /**
   * Get all messages with status "failed" in a room.
   * Used to show retry UI on reconnect.
   *
   * @param roomId
   */
  async getFailed(roomId: string): Promise<MessageRow[]> {
    return db
      .select()
      .from(messages)
      .where(and(eq(messages.roomId, roomId), eq(messages.status, "failed")))
      .orderBy(asc(messages.timestamp));
  }

  /**
   * Get the last message in a room.
   * Used for conversation list preview text.
   *
   * @param roomId
   */
  async getLastMessage(roomId: string): Promise<MessageRow | null> {
    const [row] = await db
      .select()
      .from(messages)
      .where(eq(messages.roomId, roomId))
      .orderBy(desc(messages.timestamp))
      .limit(1);
    return row ?? null;
  }

  /**
   * Get last messages for multiple rooms in one query.
   * Efficient batch fetch for the conversation list.
   *
   * @param roomIds
   * @returns Record<roomId, MessageRow>
   */
  async getLastMessages(
    roomIds: string[],
  ): Promise<Record<string, MessageRow>> {
    if (roomIds.length === 0) return {};

    // SQLite doesn't support DISTINCT ON — use a subquery approach via raw sql
    const rows = await db
      .select()
      .from(messages)
      .where(sql`${messages.roomId} IN ${roomIds}`)
      .orderBy(desc(messages.timestamp));

    // Keep only the first (newest) row per roomId
    const result: Record<string, MessageRow> = {};
    for (const row of rows) {
      if (!result[row.roomId]) result[row.roomId] = row;
    }
    return result;
  }
}

export class RoomGetQueries {
  /**
   * Get all rooms, sorted by last message timestamp.
   *
   * @returns RoomRow[]
   * @returns  <RoomRow[]>
   */
  async getAll(): Promise<RoomRow[]> {
    return db.select().from(rooms).orderBy(desc(rooms.lastMessageTimestamp));
  }
  async getByConversationId(conversationId: string) {
    const con: RoomRow[] = await db
      .select()
      .from(rooms)
      .where(eq(rooms.conversationId, conversationId));

    console.log(con);

    if (con) {
      return false;
    }

    return true;
  }
}

export const messageGetQueries = new MessageGetQueries();
export const roomGetQueries = new RoomGetQueries();
