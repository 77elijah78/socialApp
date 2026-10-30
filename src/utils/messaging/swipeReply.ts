export const REPLY_SWIPE = {
  activate: 18,
  complete: 56,
  maximum: 72,
  verticalFailure: 12,
} as const;

export function shouldReplyFromSwipe(x: number, y: number) {
  "worklet";
  return (
    Number.isFinite(x) &&
    Number.isFinite(y) &&
    x <= -REPLY_SWIPE.complete &&
    Math.abs(y) <= 20 &&
    Math.abs(x) >= Math.abs(y) * 2
  );
}
