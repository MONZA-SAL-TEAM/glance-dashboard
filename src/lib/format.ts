export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en", {
    notation: value >= 10000 ? "compact" : "standard",
    maximumFractionDigits: value >= 10000 ? 1 : 0,
  }).format(value);
}

export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  if (mins <= 0) return `${secs}s`;
  return `${mins}m ${secs.toString().padStart(2, "0")}s`;
}

export function formatChartDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  return date.toLocaleDateString("en", { month: "short", day: "numeric" });
}

/**
 * Change vs the previous period as a signed percentage, or null when the
 * previous period had nothing to compare against.
 */
export function formatDelta(current: number, previous: number): string | null {
  if (!Number.isFinite(previous) || previous <= 0) return null;
  const change = (current - previous) / previous;
  const pct = Math.abs(change * 100);
  const digits = pct >= 100 ? 0 : 1;
  if (pct < 0.05) return "±0%";
  return `${change > 0 ? "▲" : "▼"} ${pct.toFixed(digits)}%`;
}

export function rangeLabel(range: string): string {
  switch (range) {
    case "7d":
      return "Last 7 days";
    case "90d":
      return "Last 90 days";
    case "180d":
      return "Last 6 months";
    case "365d":
      return "Last 12 months";
    default:
      return "Last 28 days";
  }
}
