/**
 * Server-authoritative rate-limit state.
 *
 * The backend owns enforcement. This store only mirrors the cooldown it
 * reports so every surface can show the same countdown and stop firing
 * requests that are guaranteed to fail. Nothing here is a security control.
 */

export type RateLimitScope = "global" | "auth" | "media" | "messaging" | "social";

export interface RateLimitNotice {
  scope: RateLimitScope;
  blockedUntil: number;
  message: string;
}

type Listener = (notice: RateLimitNotice | null) => void;

const DEFAULT_COOLDOWN_MS = 60_000;
const MIN_COOLDOWN_MS = 1_000;
const MAX_COOLDOWN_MS = 15 * 60_000;

export const RATE_LIMIT_MESSAGE =
  "You’re moving a little fast. Please wait before trying again.";

export function scopeForPath(path: string): RateLimitScope {
  const clean = path.split("?")[0] ?? "";
  if (clean.startsWith("/auth")) return "auth";
  if (clean.startsWith("/media")) return "media";
  if (clean.startsWith("/messages")) return "messaging";
  if (
    clean.startsWith("/posts") ||
    clean.startsWith("/users") ||
    clean.startsWith("/activity") ||
    clean.startsWith("/notifications") ||
    clean.startsWith("/channels") ||
    clean.startsWith("/stickers") ||
    clean.startsWith("/push")
  )
    return "social";
  return "global";
}

export function retryAfterMsFromHeaders(
  read: (name: string) => string | null,
  now = Date.now(),
): number {
  const retryAfter = read("retry-after") ?? read("Retry-After");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return clampCooldown(seconds * 1000);
    }
    const date = Date.parse(retryAfter);
    if (Number.isFinite(date)) return clampCooldown(date - now);
  }

  const reset = read("ratelimit-reset") ?? read("RateLimit-Reset");
  if (reset) {
    const seconds = Number(reset);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return clampCooldown(seconds * 1000);
    }
  }

  return DEFAULT_COOLDOWN_MS;
}

function clampCooldown(ms: number): number {
  return Math.min(MAX_COOLDOWN_MS, Math.max(MIN_COOLDOWN_MS, Math.round(ms)));
}

export function friendlyRateLimitMessage(retryAfterMs: number): string {
  const seconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
  if (seconds < 60) {
    return `Too many requests. Try again in ${seconds}s.`;
  }
  const minutes = Math.ceil(seconds / 60);
  return `Too many requests. Try again in about ${minutes} min.`;
}

export function formatCooldown(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

class RateLimitStore {
  private limits = new Map<RateLimitScope, RateLimitNotice>();
  private listeners = new Set<Listener>();

  apply(
    scope: RateLimitScope,
    retryAfterMs: number,
    serverMessage?: string | null,
  ): RateLimitNotice {
    const cooldown = clampCooldown(retryAfterMs);
    const blockedUntil = Date.now() + cooldown;
    const notice: RateLimitNotice = {
      scope,
      blockedUntil,
      message:
        serverMessage && /too many|rate limit/i.test(serverMessage)
          ? friendlyRateLimitMessage(cooldown)
          : serverMessage || RATE_LIMIT_MESSAGE,
    };
    const previous = this.limits.get(scope);
    if (!previous || previous.blockedUntil < blockedUntil) {
      this.limits.set(scope, notice);
    }
    this.emit();
    return this.limits.get(scope) ?? notice;
  }

  get(scope: RateLimitScope = "global"): RateLimitNotice | null {
    const now = Date.now();
    const active = (notice: RateLimitNotice | undefined) =>
      notice && notice.blockedUntil > now ? notice : null;
    const global = active(this.limits.get("global"));
    const local = active(this.limits.get(scope as RateLimitScope));
    if (global && (!local || global.blockedUntil >= local.blockedUntil))
      return global;
    return local;
  }

  blockedFor(scope: RateLimitScope = "global"): number {
    const notice = this.get(scope);
    return notice ? Math.max(0, notice.blockedUntil - Date.now()) : 0;
  }

  isBlocked(scope: RateLimitScope = "global"): boolean {
    return this.blockedFor(scope) > 0;
  }

  /** The most severe active notice, used by the global banner. */
  current(): RateLimitNotice | null {
    const now = Date.now();
    let current: RateLimitNotice | null = null;
    for (const notice of this.limits.values()) {
      if (notice.blockedUntil <= now) continue;
      if (!current || notice.blockedUntil > current.blockedUntil) current = notice;
    }
    return current;
  }

  clear(scope?: RateLimitScope) {
    if (scope) this.limits.delete(scope);
    else this.limits.clear();
    this.emit();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit() {
    const notice = this.current();
    this.listeners.forEach((listener) => {
      try {
        listener(notice);
      } catch {
        // A bad subscriber must not break request handling.
      }
    });
  }
}

export const rateLimitStore = new RateLimitStore();
