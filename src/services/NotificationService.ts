/** Verified against backend main eb79c44. There is no public notification REST
 * router. Do not make speculative history/read calls or invent server metadata. */
export const ACTIVITY_CAPABILITIES = {
  history: false, pagination: false, serverReadState: false, actorProfiles: false,
} as const;
export const LIVE_ACTIVITY_TYPES = ["LIKE", "COMMENT", "FOLLOW", "MESSAGE", "MENTION", "SHARE"] as const;
export type LiveActivityType = typeof LIVE_ACTIVITY_TYPES[number];
export interface LiveActivity {
  /** Client-only grouping key, NOT a backend notification ID. */
  clientKey: string;
  type: LiveActivityType;
  content: string;
  actorId: string | null;
  resourceId: string | null;
  /** Actual time received on this device; NOT the server's creation time. */
  receivedAt: number;
  occurrences: number;
}
export function normalizeLiveActivity(payload: unknown, receivedAt: number): LiveActivity | null {
  if (!payload || typeof payload !== "object" || !Number.isFinite(receivedAt)) return null;
  const raw = payload as Record<string, unknown>;
  if (!LIVE_ACTIVITY_TYPES.includes(raw.type as LiveActivityType) || typeof raw.content !== "string" || !raw.content.trim()) return null;
  const type = raw.type as LiveActivityType;
  const content = raw.content.slice(0, 2000);
  const actorId = typeof raw.actorId === "string" ? raw.actorId : null;
  const resourceId = typeof raw.resourceId === "string" ? raw.resourceId : null;
  return { type, content, actorId, resourceId, receivedAt, occurrences: 1,
    clientKey: JSON.stringify([type, content, actorId, resourceId]) };
}
export function activityTarget(item: LiveActivity): string | null {
  if (item.resourceId && ["LIKE", "COMMENT", "SHARE"].includes(item.type))
    return `/posts/${encodeURIComponent(item.resourceId)}/comments`;
  if (item.type === "MESSAGE") return "/(tabs)/messages";
  // FOLLOW actor is a UUID; /users/:username cannot resolve it. MENTION has no
  // verified resource-type contract. Never route UUIDs as usernames/guessed posts.
  return null;
}

/** Persist migration: old account-unscoped activity must never rehydrate. */
export function withoutLegacyActivity<T extends object | undefined>(state: T): T {
  if (!state) return state;
  const sanitized = { ...state } as T & { notifications?: unknown };
  delete sanitized.notifications;
  return sanitized;
}
