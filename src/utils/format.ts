/** Compact, locale-neutral count for dense UI (grids, action bars, comments). */
export function formatCount(count: number): string {
  const value = Number.isFinite(count) ? Math.max(0, count) : 0;
  if (value >= 1_000_000)
    return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (value >= 1_000)
    return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(value);
}
