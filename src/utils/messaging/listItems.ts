import type { MessageRow } from "../../db/schema";
import type { MessageCardProps } from "../../types";
import { compareMessages } from "./timeline";
import { messageMetadata, replyPreview } from "./presentation";

type Reply = MessageCardProps["repliedTo"];
export interface ReplyContextSelection {
  parentId: string;
  page: number;
  status: "loading" | "cached" | "complete" | "error";
  error?: string | null;
}
export interface ReplyContextItem {
  kind: "reply-context";
  id: string;
  parent: MessageRow;
  replies: MessageRow[];
  total: number;
  page: number;
  pageCount: number;
  selection: ReplyContextSelection;
}
export type ChatListItem =
  | ReplyContextItem
  | { kind: "date"; id: string; label: string }
  | { kind: "unread"; id: string }
  | { kind: "message"; id: string; message: MessageRow; repliedTo: Reply };

function dayKey(timestamp: number) {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}
function dateLabel(timestamp: number, today: Date) {
  const day = dayKey(timestamp);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  return day === dayKey(today.getTime())
    ? "Today"
    : day === dayKey(yesterday.getTime())
      ? "Yesterday"
      : new Date(timestamp).toLocaleDateString();
}
function sameReply(a: Reply, b: Reply) {
  return (
    a === b ||
    Boolean(
      a &&
        b &&
        a.id === b.id &&
        a.content === b.content &&
        a.senderId === b.senderId &&
        a.type === b.type &&
        a.sender?.username === b.sender?.username &&
        a.sender?.displayName === b.sender?.displayName &&
        a.sender?.avatarUrl === b.sender?.avatarUrl &&
        a.mediaUrl === b.mediaUrl &&
        a.thumbnailUrl === b.thumbnailUrl &&
        a.duration === b.duration &&
        a.deleted === b.deleted &&
        a.unavailable === b.unavailable,
    )
  );
}

/**
 * Per-screen cache. Metadata-only updates take a cheap reference scan and patch
 * affected rows/reply dependents. Pagination rebuilds the index once, reusing
 * existing models. No date formatting or conversation-wide allocation on receipts.
 */
export function createListItemBuilder() {
  let models = new Map<string, ChatListItem>();
  let byId = new Map<string, MessageRow>();
  let positions = new Map<string, number>();
  let replyDependents = new Map<string, Set<string>>();
  let previousRows: MessageRow[] = [];
  let previousItems: ChatListItem[] = [];
  let previousContext = "";

  const messageItem = (message: MessageRow, userId: string): ChatListItem => {
    let reply: Reply;
    if (message.repliedToId) {
      const original = byId.get(message.repliedToId);
      reply = original
        ? replyPreview(original)
        : (messageMetadata(message).reply ?? {
            id: message.repliedToId,
            content: "",
            senderId: "",
            type: "TEXT",
            unavailable: true,
          });
      if (reply.senderId === userId)
        reply = { ...reply, sender: { ...reply.sender, displayName: "You" } };
    }
    const id = `message:${message.localId}`;
    const cached = models.get(id);
    if (cached?.kind === "message" && sameReply(cached.repliedTo, reply))
      reply = cached.repliedTo;
    return cached?.kind === "message" &&
      cached.message === message &&
      cached.repliedTo === reply
      ? cached
      : { kind: "message", id, message, repliedTo: reply };
  };

  const contextItem = (
    selection: ReplyContextSelection,
  ): ReplyContextItem | null => {
    const parent = byId.get(selection.parentId);
    if (!parent || parent.deletedAt) return null;
    const ids = new Set<string>();
    for (const key of [parent.localId, parent.id])
      if (key) replyDependents.get(key)?.forEach((id) => ids.add(id));
    const replies = [...ids]
      .map((id) => byId.get(id)!)
      .filter((row) => row && !row.deletedAt)
      .sort(compareMessages);
    const pageCount = Math.max(1, Math.ceil(replies.length / 5));
    const page = Math.min(Math.max(0, selection.page), pageCount - 1);
    return {
      kind: "reply-context",
      id: `reply-context:${parent.localId}`,
      parent,
      replies: replies.slice(page * 5, page * 5 + 5),
      total: replies.length,
      page,
      pageCount,
      selection,
    };
  };

  return (
    messages: MessageRow[],
    userId: string,
    firstUnreadId: string | null,
    today = new Date(),
    selection: ReplyContextSelection | null = null,
  ): ChatListItem[] => {
    const context = `${userId}:${firstUnreadId ?? ""}:${dayKey(today.getTime())}:${selection?.parentId ?? ""}:${selection?.page ?? ""}:${selection?.status ?? ""}:${selection?.error ?? ""}`;
    if (
      messages.length === previousRows.length &&
      context === previousContext
    ) {
      const changed: number[] = [];
      let metadataOnly = true;
      for (let index = 0; index < messages.length; index++) {
        const row = messages[index];
        const previous = previousRows[index];
        if (row === previous) continue;
        if (
          row.localId !== previous.localId ||
          row.timestamp !== previous.timestamp ||
          row.repliedToId !== previous.repliedToId
        ) {
          metadataOnly = false;
          break;
        }
        changed.push(index);
      }
      if (metadataOnly) {
        if (!changed.length) return previousItems;
        const affected = new Set<string>();
        for (const index of changed) {
          const row = messages[index];
          const previous = previousRows[index];
          byId.set(row.localId, row);
          if (row.id) byId.set(row.id, row);
          affected.add(row.localId);
          if (
            row.content !== previous.content ||
            row.type !== previous.type ||
            row.senderId !== previous.senderId ||
            row.deletedAt !== previous.deletedAt ||
            row.id !== previous.id ||
            row.senderData !== previous.senderData ||
            row.replyData !== previous.replyData ||
            row.mediaUrl !== previous.mediaUrl ||
            row.thumbnailUrl !== previous.thumbnailUrl ||
            row.duration !== previous.duration
          ) {
            for (const key of [row.localId, row.id, previous.id])
              if (key)
                replyDependents.get(key)?.forEach((id) => affected.add(id));
          }
        }
        const items = previousItems.slice();
        for (const localId of affected) {
          const item = messageItem(byId.get(localId)!, userId);
          models.set(item.id, item);
          items[positions.get(item.id)!] = item;
        }
        if (
          selection &&
          changed.some((index) => {
            const row = messages[index],
              before = previousRows[index];
            return (
              (row.id === selection.parentId ||
                row.localId === selection.parentId ||
                row.repliedToId === selection.parentId) &&
              (row.content !== before.content ||
                row.senderData !== before.senderData ||
                row.deletedAt !== before.deletedAt ||
                row.mediaUrl !== before.mediaUrl)
            );
          })
        ) {
          const item = contextItem(selection);
          if (item) {
            models.set(item.id, item);
            items[positions.get(item.id)!] = item;
          }
        }
        previousRows = messages;
        previousItems = items;
        return items;
      }
    }

    byId = new Map();
    replyDependents = new Map();
    for (const row of messages) {
      byId.set(row.localId, row);
      if (row.id) byId.set(row.id, row);
      if (row.repliedToId) {
        const group = replyDependents.get(row.repliedToId) ?? new Set();
        group.add(row.localId);
        replyDependents.set(row.repliedToId, group);
      }
    }
    const next = new Map<string, ChatListItem>();
    const items: ChatListItem[] = [];
    const add = (item: ChatListItem) => {
      items.push(item);
      next.set(item.id, item);
    };
    let lastDay = "";
    for (const message of messages) {
      const day = dayKey(message.timestamp);
      if (day !== lastDay) {
        const id = `date:${day}`;
        const label = dateLabel(message.timestamp, today);
        const cached = models.get(id);
        add(
          cached?.kind === "date" && cached.label === label
            ? cached
            : { kind: "date", id, label },
        );
        lastDay = day;
      }
      if (message.localId === firstUnreadId) {
        const id = `unread:${firstUnreadId}`;
        add(models.get(id) ?? { kind: "unread", id });
      }
      if (
        selection &&
        (selection.parentId === message.id ||
          selection.parentId === message.localId)
      ) {
        const item = contextItem(selection);
        if (item) add(item); // Presentation-only summaries ABOVE the parent in visual order.
      }
      add(messageItem(message, userId));
    }
    models = next;
    previousRows = messages;
    previousContext = context;
    previousItems = items.reverse();
    positions = new Map(previousItems.map((item, index) => [item.id, index]));
    return previousItems;
  };
}
