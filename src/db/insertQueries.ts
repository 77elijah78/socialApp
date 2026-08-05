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
        target: messages.id,
        set: {
          localId: message.localId,
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
        target: messages.id,
        set: {
          localId: messages.localId,
          content: messages.content,
          status: messages.status,
          mediaUrl: messages.mediaUrl,
          thumbnailUrl: messages.thumbnailUrl,
          type: messages.type,
          timestamp: messages.timestamp,
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
