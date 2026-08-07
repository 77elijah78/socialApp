import { db } from "./db";
import {
  messages,
  NewMessageRow,
  MessageRow,
  NewRoomRow,
  RoomRow,
  rooms,
} from "./schema";
import { sql } from "drizzle-orm";

export class MessageInsertQueries {
  async insert(message: NewMessageRow): Promise<MessageRow> {
    const [row] = await db.insert(messages).values(message).returning();
    return row;
  }

  async insertMany(batch: NewMessageRow[]): Promise<MessageRow[]> {
    if (batch.length === 0) return [];
    const rows = await db
      .insert(messages)
      .values(batch)
      .onConflictDoNothing()
      .returning();
    return rows;
  }

  async upsert(message: NewMessageRow): Promise<MessageRow> {
    const [row] = await db
      .insert(messages)
      .values(message)
      .onConflictDoUpdate({
        target: messages.localId,
        set: {
          id: message.id,
          content: message.content,
          mediaUrl: message.mediaUrl,
          thumbnailUrl: message.thumbnailUrl,
          type: message.type,
          status: message.status,
          senderId: message.senderId,
          receiverId: message.receiverId,
          isRead: message.isRead,
          timestamp: message.timestamp,
          editedAt: message.editedAt,
          deletedAt: message.deletedAt,
          duration: message.duration,
          repliedToId: message.repliedToId,
          forwardedFromId: message.forwardedFromId,
        },
      })
      .returning();
    return row;
  }

  async upsertMany(batch: NewMessageRow[]): Promise<MessageRow[]> {
    if (batch.length === 0) return [];
    const rows = await db
      .insert(messages)
      .values(batch)
      .onConflictDoUpdate({
        target: messages.localId,
        set: {
          id: sql`excluded.id`,
          content: sql`excluded.content`,
          mediaUrl: sql`excluded.media_url`,
          thumbnailUrl: sql`excluded.thumbnail_url`,
          type: sql`excluded.type`,
          status: sql`excluded.status`,
          senderId: sql`excluded.sender_id`,
          receiverId: sql`excluded.receiver_id`,
          conversationId: sql`excluded.conversation_id`,
          isRead: sql`excluded.is_read`,
          timestamp: sql`excluded.timestamp`,
          editedAt: sql`excluded.edited_at`,
          deletedAt: sql`excluded.deleted_at`,
          deletedBy: sql`excluded.deleted_by`,
          duration: sql`excluded.duration`,
          repliedToId: sql`excluded.replied_to_id`,
          forwardedFromId: sql`excluded.forwarded_from_id`,
        },
      })
      .returning();
    return rows;
  }
}

export class RoomsInsertQueries {
  async insert(room: NewRoomRow): Promise<RoomRow> {
    const [row] = await db.insert(rooms).values(room).returning();
    return row;
  }

  async upsert(room: NewRoomRow): Promise<RoomRow> {
    const [row] = await db
      .insert(rooms)
      .values(room)
      .onConflictDoUpdate({
        target: rooms.id,
        set: {
          lastMessage: room.lastMessage,
          lastMessageType: room.lastMessageType,
          lastMessageTimestamp: room.lastMessageTimestamp,
          unreadCount: sql`${rooms.unreadCount} + 1`,
        },
      })
      .returning();
    return row;
  }
}

export const messageInsertQueries = new MessageInsertQueries();
export const roomInsertQueries = new RoomsInsertQueries();
