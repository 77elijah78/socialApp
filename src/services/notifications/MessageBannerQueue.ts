import type { MessageRow } from "../../db/schema";
import type { RoomWithReceiver } from "../ConversationService";
import { roomAuthors } from "../../utils/messaging/roomAuthors";

export interface MessageBanner {
  key: string;
  messageId: string;
  conversationId: string;
  senderName: string;
  avatarUrl: string | null;
  groupName: string | null;
  preview: string;
  count: number;
}
export const BANNER_DURATION = 3500;
const text = (value: unknown, limit: number) => typeof value === "string"
  ? value.replace(/\s+/g, " ").trim().slice(0, limit) : "";
export function messagePreview(row: Pick<MessageRow, "type" | "content">) {
  const media: Record<string, string> = { IMAGE: "Photo", VIDEO: "Video", AUDIO: "Voice message",
    DOCUMENT: "Document", SHARED_POST: "Shared a post", SHARED_STORY: "Shared a story" };
  return media[row.type.toUpperCase()] ?? (text(row.content, 180) || "New message");
}
export function messageBanner(row: MessageRow, room: RoomWithReceiver): MessageBanner {
  let author = roomAuthors(room).get(row.senderId);
  try {
    const supplied = JSON.parse(row.senderData ?? "null");
    if (supplied?.id === row.senderId) author = { ...author, ...supplied };
  } catch { /* Fall back to the existing real participant metadata. */ }
  return { key: row.id!, messageId: row.id!, conversationId: row.conversationId,
    senderName: text(author?.displayName, 100) || text(author?.username, 100) || "New message",
    avatarUrl: typeof author?.avatarUrl === "string" ? author.avatarUrl : null,
    groupName: room.isGroup ? room.name : null, preview: messagePreview(row), count: 1 };
}

/** Presentation only. Message bodies, receipts and unread counts stay in SQLite.
 * A burst coalesces per conversation, retaining its total and latest preview,
 * rather than allocating one banner/timer per message or silently dropping a cap. */
export class MessageBannerQueue {
  private current: MessageBanner | null = null;
  private waiting = new Map<string, MessageBanner>();
  private seen = new Map<string, true>();
  private listeners = new Set<() => void>();
  getSnapshot = () => this.current;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish() { for (const listener of this.listeners) listener(); }
  remember(id: string) {
    if (this.seen.has(id)) return false;
    this.seen.set(id, true);
    while (this.seen.size > 2048) this.seen.delete(this.seen.keys().next().value!);
    return true;
  }
  enqueue(banner: MessageBanner) {
    const old = this.current?.conversationId === banner.conversationId
      ? this.current : this.waiting.get(banner.conversationId);
    const next = old ? { ...banner, key: old.key, count: old.count + banner.count } : banner;
    if (this.current?.conversationId === banner.conversationId || !this.current) { this.current = next; this.publish(); }
    else this.waiting.set(banner.conversationId, next);
  }
  dismiss = (key: string) => {
    if (key !== this.current?.key) return;
    const next = this.waiting.values().next().value;
    this.current = next ?? null;
    if (next) this.waiting.delete(next.conversationId);
    this.publish();
  };
  removeConversation(id: string) {
    this.waiting.delete(id);
    if (this.current?.conversationId === id) this.dismiss(this.current.key);
  }
  removeMessage(id: string) {
    if (this.current?.messageId === id) this.removeConversation(this.current.conversationId);
    for (const [room, banner] of this.waiting) if (banner.messageId === id) this.waiting.delete(room);
  }
  clear(resetIdentity = false) {
    this.waiting.clear();
    if (resetIdentity) this.seen.clear();
    if (this.current) { this.current = null; this.publish(); }
  }
}
