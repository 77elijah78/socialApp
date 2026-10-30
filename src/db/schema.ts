import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const messages = sqliteTable("messages", {
  localId: text("local_id").primaryKey().notNull(),
  id: text("id"),
  content: text("content"),
  // Local-only copies of existing API author/reply and upload/picker metadata.
  senderData: text("sender_data"),
  replyData: text("reply_data"),
  attachmentData: text("attachment_data"),
  mediaUrl: text("media_url"),
  thumbnailUrl: text("thumbnail_url"),
  type: text("type").notNull().default("TEXT"),
  status: text("status").notNull().default("SENT"),
  senderId: text("sender_id").notNull(),
  receiverId: text("receiver_id"),
  conversationId: text("conversation_id").notNull(),
  isRead: integer("is_read", { mode: "boolean" }).notNull().default(false),
  timestamp: integer("timestamp").notNull(),
  editedAt: text("edited_at"),
  deletedAt: text("deleted_at"),
  deletedBy: text("deleted_by"),
  duration: real("duration"),
  repliedToId: text("replied_to_id"),
  forwardedFromId: text("forwarded_from_id"),
  deliveredAt: text("delivered_at"),
  readAt: text("read_at"),
  failedAt: text("failed_at"),
  retryCount: integer("retry_count").notNull().default(0),
  updatedAt: text("updated_at"),
});

export const rooms = sqliteTable("rooms", {
  id: text("id").primaryKey().notNull(),
  name: text("name").notNull(),
  isGroup: integer("is_group", { mode: "boolean" }).notNull().default(false),
  participantsData: text("participants_data"),
  conversationId: text("conversation_id").notNull(),
  avatarUrl: text("avatar_url").notNull(),
  lastMessage: text("last_message").notNull(),
  lastMessageType: text("last_message_type").notNull(),
  lastMessageTimestamp: integer("last_message_timestamp").notNull(),
  unreadCount: integer("unread_count").notNull(),
  receiverId: text("receiver_id"),
  lastMessageStatus: text("last_message_status").notNull().default("SENT"),
  cachedAt: integer("cached_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
  muted: integer("muted", { mode: "boolean" }).notNull().default(false),
  pinned: integer("pinned", { mode: "boolean" }).notNull().default(false),
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
  cursorOldestTs: integer("cursor_oldest_ts"),
  cursorOldestId: text("cursor_oldest_id"),
});

export type MessageRow = typeof messages.$inferSelect;
export type NewMessageRow = typeof messages.$inferInsert;

export type RoomRow = typeof rooms.$inferSelect;
export type NewRoomRow = typeof rooms.$inferInsert;

// Local-only durable receipt outbox. No server schema or message payload change.
export const receiptOutbox = sqliteTable("message_receipt_outbox", {
  key: text("key").primaryKey().notNull(),
  messageId: text("message_id").notNull(),
  conversationId: text("conversation_id").notNull(),
  kind: text("kind").notNull(),
  attemptToken: text("attempt_token"),
});

// Resume an interrupted offline catch-up without mistaking a sparse cache for
// contiguous history. Local synchronization metadata only.
export const messageSyncState = sqliteTable("message_sync_state", {
  conversationId: text("conversation_id").primaryKey().notNull(),
  beforeId: text("before_id"),
  beforeTimestamp: integer("before_timestamp"),
  targetId: text("target_id").notNull(),
  targetTimestamp: integer("target_timestamp").notNull(),
});
