import { db } from "./db";
import { messages, MessageRow, rooms, RoomRow } from "./schema";
import type { MessageCursor } from "../utils/messaging/timeline";
import {
  eq,
  and,
  lt,
  desc,
  asc,
  ne,
  sql,
  inArray,
  or,
  isNull,
} from "drizzle-orm";

export class MessageGetQueries {
  async getByRoom(roomId: string): Promise<MessageRow[]> {
    return db
      .select()
      .from(messages)
      .where(
        and(eq(messages.conversationId, roomId), isNull(messages.deletedAt)),
      )
      .orderBy(asc(messages.timestamp), asc(messages.localId));
  }

  async getByIds(roomId: string, ids: string[]): Promise<MessageRow[]> {
    if (ids.length === 0) return [];
    return db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, roomId),
          or(inArray(messages.id, ids), inArray(messages.localId, ids)),
        ),
      );
  }

  async getRecent(roomId: string, limit = 30): Promise<MessageRow[]> {
    const rows = await db
      .select()
      .from(messages)
      .where(
        and(eq(messages.conversationId, roomId), isNull(messages.deletedAt)),
      )
      .orderBy(desc(messages.timestamp), desc(messages.localId))
      .limit(limit);
    return rows.reverse();
  }

  async getOlderThan(
    roomId: string,
    cursor: MessageCursor,
    limit = 30,
  ): Promise<MessageRow[]> {
    const rows = await db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, roomId),
          isNull(messages.deletedAt),
          or(
            lt(messages.timestamp, cursor.timestamp),
            and(
              eq(messages.timestamp, cursor.timestamp),
              lt(messages.localId, cursor.localId),
            ),
          ),
        ),
      )
      .orderBy(desc(messages.timestamp), desc(messages.localId))
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
      .where(or(eq(messages.id, id), eq(messages.localId, id)))
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
          isNull(messages.deletedAt),
        ),
      );
    return result?.count ?? 0;
  }

  async getAllUnreadCounts(
    currentUserId: string,
  ): Promise<Record<string, number>> {
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
          isNull(messages.deletedAt),
        ),
      )
      .groupBy(messages.conversationId);

    return Object.fromEntries(rows.map((r) => [r.conversationId, r.count]));
  }

  async getOldestMessageTimestamp(roomId: string): Promise<number | null> {
    const [row] = await db
      .select({ ts: messages.timestamp })
      .from(messages)
      .where(
        and(eq(messages.conversationId, roomId), isNull(messages.deletedAt)),
      )
      .orderBy(asc(messages.timestamp), asc(messages.localId))
      .limit(1);
    return row?.ts ?? null;
  }

  async getOldestMessageId(roomId: string): Promise<string | null> {
    const [row] = await db
      .select({ id: messages.id })
      .from(messages)
      .where(
        and(eq(messages.conversationId, roomId), isNull(messages.deletedAt)),
      )
      .orderBy(asc(messages.timestamp), asc(messages.localId))
      .limit(1);
    return row?.id ?? null;
  }

  async getFailed(roomId: string): Promise<MessageRow[]> {
    return db
      .select()
      .from(messages)
      .where(
        and(eq(messages.conversationId, roomId), eq(messages.status, "FAILED")),
      )
      .orderBy(asc(messages.timestamp), asc(messages.localId));
  }

  async getReadReceipts(
    roomId: string,
    userId: string,
    limit = 100,
  ): Promise<MessageRow[]> {
    return db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, roomId),
          ne(messages.senderId, userId),
          eq(messages.status, "READ"),
          isNull(messages.deletedAt),
        ),
      )
      .orderBy(desc(messages.timestamp), desc(messages.localId))
      .limit(limit);
  }

  async getLastMessage(roomId: string): Promise<MessageRow | null> {
    const [row] = await db
      .select()
      .from(messages)
      .where(
        and(eq(messages.conversationId, roomId), isNull(messages.deletedAt)),
      )
      .orderBy(desc(messages.timestamp), desc(messages.localId))
      .limit(1);
    return row ?? null;
  }

  async getLastMessages(
    roomIds: string[],
  ): Promise<Record<string, MessageRow>> {
    if (roomIds.length === 0) return {};

    // Correlated indexed lookup: fetch one row per room, not every message.
    const rows = await db
      .select()
      .from(messages)
      .where(
        and(
          inArray(messages.conversationId, roomIds),
          isNull(messages.deletedAt),
          sql`${messages.localId} = (SELECT local_id FROM messages AS latest
        WHERE latest.conversation_id = ${messages.conversationId} AND latest.deleted_at IS NULL
        ORDER BY latest.timestamp DESC, latest.local_id DESC LIMIT 1)`,
        ),
      );
    const result = Object.fromEntries(
      rows.map((row) => [row.conversationId, row]),
    );
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
