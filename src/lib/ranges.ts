import type { DateRangeKey } from "./types";

/** Every selectable window, in order. Longer ranges reach back past the
 * point where these properties existed — the UI says so rather than
 * rendering the empty months as real zeros. */
export const RANGE_KEYS: DateRangeKey[] = ["7d", "28d", "90d", "180d", "365d"];

const DAYS: Record<DateRangeKey, number> = {
  "7d": 7,
  "28d": 28,
  "90d": 90,
  "180d": 180,
  "365d": 365,
};

export function rangeDays(range: DateRangeKey): number {
  return DAYS[range] ?? 28;
}

export function isRangeKey(value: string | null): value is DateRangeKey {
  return value !== null && value in DAYS;
}

export function parseRange(value: string | null): DateRangeKey {
  return isRangeKey(value) ? value : "28d";
}

/** Short label for the range buttons. */
export const RANGE_SHORT: Record<DateRangeKey, string> = {
  "7d": "7d",
  "28d": "28d",
  "90d": "90d",
  "180d": "6m",
  "365d": "12m",
};
