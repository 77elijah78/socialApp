import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

/**
 * messages table
 *
 * One row per message (sent or received).
 * direction: "sent" | "received"
 * status:    "sending" | "sent" | "delivered" | "read" | "failed"
 * type:      "text" | "audio" | "video"
 */
export const messages = sqliteTable("messages", {
  // localId is the stable primary key (UUID generated on device)
  localId:    text("local_id").primaryKey().notNull(),

  // Server-assigned id — null until server confirms
  id:         text("id"),

  text:       text("text"),
  type:       text("type").notNull().default("text"),   // "text" | "audio" | "video"
  mediaUrl:   text("media_url"),

  senderId:   text("sender_id").notNull(),
  receiverId: text("receiver_id").notNull(),
  roomId:     text("room_id").notNull(),

  status:     text("status").notNull().default("sending"), // "sending"|"sent"|"delivered"|"read"|"failed"
  direction:  text("direction").notNull(),                 // "sent" | "received"
  timestamp:  integer("timestamp").notNull(),              // Unix ms
});

// TypeScript types inferred from schema
export type MessageRow    = typeof messages.$inferSelect;
export type NewMessageRow = typeof messages.$inferInsert;
