import { api } from "./api";
import { normalizeMediaUrl } from "../utils/mediaUrls";

/** Backend contract: nodejs-socialapp 12e570c4 (activity routes/service + Kafka consumer).
 * Socket previews/read state are deliberately NOT inferred from actor/resource UUIDs. */
export const ACTIVITY_TYPES = ["LIKE", "COMMENT", "FOLLOW", "MESSAGE", "MENTION", "SHARE"] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];
export const ACTIVITY_PAGE_SIZE = 20;
export interface ActivityActor {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}
export interface ActivityPost {
  id: string;
  content: string;
  imageUrls: string[];
  videoUrl: string | null;
}
export interface ActivityItem {
  id: string;
  type: ActivityType;
  content: string;
  actorId: string | null;
  resourceId: string | null;
  postId: string | null;
  commentId: string | null;
  createdAt: string;
  isRead: boolean;
  actor: ActivityActor | null;
  post: ActivityPost | null;
  comment: { id: string; postId: string; content: string } | null;
  /** Local knowledge, never sent to the server. Only REST supplies previews/read state. */
  hydrated: boolean;
}
export interface ActivityPage {
  items: ActivityItem[];
  total: number;
  unreadCount: number;
  page: number;
  limit: number;
  hasNext: boolean;
}

const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}
function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}
function count(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function baseItem(payload: unknown): ActivityItem | null {
  const raw = record(payload);
  if (!raw || !text(raw.id) || !UUID.test(raw.id as string) ||
      !ACTIVITY_TYPES.includes(raw.type as ActivityType) || typeof raw.content !== "string" ||
      typeof raw.createdAt !== "string" || !Number.isFinite(Date.parse(raw.createdAt))) return null;
  return {
    id: raw.id as string, type: raw.type as ActivityType, content: raw.content,
    actorId: text(raw.actorId), resourceId: text(raw.resourceId), postId: text(raw.postId),
    commentId: text(raw.commentId), createdAt: new Date(raw.createdAt).toISOString(),
    // Optimistic for a previously unseen creation event (the verified DB default).
    // Never replace an existing row's read flag with this sparse event.
    isRead: false, actor: null, post: null, comment: null, hydrated: false,
  };
}
export function normalizeNotificationEvent(payload: unknown): ActivityItem | null {
  // Legacy SHARE events have no stable id/time. They are reconciliation hints,
  // not invented rows, synthetic timestamps, or content-based deduplication keys.
  return baseItem(payload);
}
export function normalizeActivityItem(payload: unknown, accountId: string): ActivityItem | null {
  const item = baseItem(payload), raw = record(payload);
  if (!item || !raw || raw.userId !== accountId || typeof raw.isRead !== "boolean") return null;
  const actor = record(raw.actor), post = record(raw.post), comment = record(raw.comment);
  item.isRead = raw.isRead;
  item.hydrated = true;
  if (actor && actor.id === item.actorId && text(actor.username)) {
    item.actor = {
      id: actor.id as string, username: actor.username as string,
      displayName: text(actor.displayName), avatarUrl: normalizeMediaUrl(text(actor.avatarUrl)),
    };
  }
  if (post && text(post.id) && (post.id === item.postId || post.id === item.resourceId)) {
    item.post = {
      id: post.id as string, content: typeof post.content === "string" ? post.content : "",
      imageUrls: Array.isArray(post.imageUrls)
        ? post.imageUrls.map(url => normalizeMediaUrl(text(url))).filter((url): url is string => !!url) : [],
      videoUrl: normalizeMediaUrl(text(post.videoUrl)),
    };
  }
  if (comment && comment.id === item.commentId && text(comment.postId) && typeof comment.content === "string") {
    item.comment = { id: comment.id as string, postId: comment.postId as string, content: comment.content };
  }
  return item;
}
export function normalizeActivityPage(response: unknown, accountId: string, page: number, limit: number): ActivityPage {
  const raw = record(response), data = record(raw?.data), meta = record(raw?.meta);
  if (raw?.success !== true || !data || !meta || !Array.isArray(data.items) ||
      !count(data.total) || !count(data.unreadCount) ||
      meta.page !== page || meta.limit !== limit || typeof meta.hasNext !== "boolean") {
    throw new Error("The server returned an invalid Activity response. Please retry.");
  }
  const items = data.items.map(item => normalizeActivityItem(item, accountId));
  if (items.some(item => !item)) throw new Error("The server returned invalid Activity records. Please retry.");
  return { items: uniqueActivity(items as ActivityItem[]), total: data.total, unreadCount: data.unreadCount,
    page, limit, hasNext: meta.hasNext };
}
export function uniqueActivity(items: ActivityItem[]): ActivityItem[] {
  const byId = new Map<string, ActivityItem>();
  for (const item of items) if (!byId.has(item.id)) byId.set(item.id, item);
  return [...byId.values()].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) ||
    (a.id === b.id ? 0 : a.id > b.id ? -1 : 1));
}
export function activityDestination(item: ActivityItem):
  | { kind: "profile"; username: string }
  | { kind: "post"; postId: string }
  | { kind: "messages" }
  | null {
  if (item.type === "FOLLOW") return item.actor ? { kind: "profile", username: item.actor.username } : null;
  if (["LIKE", "COMMENT", "SHARE"].includes(item.type)) {
    const id = item.post?.id ?? (!item.hydrated ? item.postId ?? item.resourceId : null);
    return id ? { kind: "post", postId: id } : null;
  }
  if (item.type === "MESSAGE") return { kind: "messages" };
  // MENTION has no producer or resource-kind contract in the pinned backend.
  // A real REST post preview proves a post target; never guess from resourceId.
  return item.post ? { kind: "post", postId: item.post.id } : null;
}
export function activityTime(createdAt: string, now: number): string {
  const minutes = Math.floor(Math.max(0, now - Date.parse(createdAt)) / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h`;
  if (minutes < 10080) return `${Math.floor(minutes / 1440)}d`;
  return new Date(createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
function changedCount(response: unknown): number {
  const raw = record(response), data = record(raw?.data);
  if (raw?.success !== true || !data || !count(data.count)) throw new Error("Read status could not be confirmed. Please retry.");
  return data.count;
}
export const notificationApi = {
  async list(accountId: string, token: string, page: number, limit: number, signal: AbortSignal): Promise<ActivityPage> {
    const response = await api.get(`/activity?page=${page}&limit=${limit}`, token, { signal });
    return normalizeActivityPage(response, accountId, page, limit);
  },
  async unread(token: string, signal: AbortSignal): Promise<number> {
    const raw = record(await api.get("/activity/unread-count", token, { signal })), data = record(raw?.data);
    if (raw?.success !== true || !data || !count(data.unreadCount)) throw new Error("Couldn’t load your unread count.");
    return data.unreadCount;
  },
  async read(ids: string[], token: string, signal: AbortSignal): Promise<number> {
    if (!ids.length || ids.length > 200 || ids.some(id => !UUID.test(id))) throw new Error("Invalid Activity read request.");
    return changedCount(await api.post("/activity/read", { ids }, token, { signal }));
  },
  async readAll(token: string, signal: AbortSignal): Promise<number> {
    return changedCount(await api.post("/activity/read-all", {}, token, { signal }));
  },
};
export type NotificationApi = typeof notificationApi;

/** Persist migration: old account-unscoped activity must never rehydrate. */
export function withoutLegacyActivity<T extends object | undefined>(state: T): T {
  if (!state) return state;
  const sanitized = { ...state } as T & { notifications?: unknown };
  delete sanitized.notifications;
  return sanitized;
}
