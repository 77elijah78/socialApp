export const REPLY_SWIPE = {
  activate: 12,
  complete: 48,
  maximum: 72,
  release: 10,
  horizontalRatio: 1.2,
} as const;

export type ReplySwipeIntent = "pending" | "reply" | "scroll";

/** Decide once, before activation. Ambiguous/vertical/right drags belong to the
 * list; a clearly leftward drag keeps its lock even if the finger later curves. */
export function replySwipeIntent(x: number, y: number): ReplySwipeIntent {
  "worklet";
  if (!Number.isFinite(x) || !Number.isFinite(y)) return "scroll";
  const horizontal = Math.abs(x);
  const vertical = Math.abs(y);
  if (
    x >= REPLY_SWIPE.release ||
    (vertical >= REPLY_SWIPE.release && vertical >= horizontal)
  )
    return "scroll";
  if (
    x <= -REPLY_SWIPE.activate &&
    horizontal >= vertical * REPLY_SWIPE.horizontalRatio
  )
    return "reply";
  if (vertical >= REPLY_SWIPE.activate) return "scroll";
  return "pending";
}

/** Latch the visible threshold, but cancel when deliberately returning to the
 * activation zone. A small rebound after a fast swipe must not lose the reply. */
export function replySwipeArmed(armed: boolean, x: number): boolean {
  "worklet";
  return Number.isFinite(x) && (x <= -REPLY_SWIPE.complete || armed && x <= -REPLY_SWIPE.activate);
}

/** Completion uses net distance from touch-down, not native pan translation
 * (Android resets that on activation). Initial intent must already have won. */
export function shouldReplyFromSwipe(
  x: number,
  y: number,
  hasReplyIntent = false,
  armed = false,
) {
  "worklet";
  return (
    hasReplyIntent &&
    Number.isFinite(x) &&
    Number.isFinite(y) &&
    replySwipeArmed(armed, x)
  );
}
