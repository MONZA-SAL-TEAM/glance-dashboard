import { format, startOfWeek, subDays } from "date-fns";
import type {
  DateRangeKey,
  SignalModelRow,
  SignalsPayload,
  SignalWeekRow,
} from "./types";

/**
 * First-party interest signals (WhatsApp / Instagram clicks) captured by
 * lead-capture.js on the sites and stored in the Monza SAL APP Supabase.
 * Read through the aggregate-only RPC `glance_signal_stats` — it returns
 * daily counts per site/model, never row-level or personal data, so the
 * publishable (public) key is sufficient.
 */
const SUPABASE_URL =
  process.env.SUPABASE_URL || "https://okxpsvukzjjubinhamek.supabase.co";
const SUPABASE_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  "sb_publishable_xS7t2B_E2mTpx-NrddvOeQ_RQJp6kBg";

interface SignalStatRow {
  day: string;
  site: string;
  event_type: string;
  vehicle: string;
  n: number;
}

function rangeDays(range: DateRangeKey): number {
  if (range === "7d") return 7;
  if (range === "90d") return 90;
  return 28;
}

function isoDay(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

export async function fetchSignals(
  range: DateRangeKey,
  siteDomain: string,
): Promise<SignalsPayload> {
  const days = rangeDays(range);

  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/glance_signal_stats`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_days: days * 2 + 2 }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`glance_signal_stats failed (${res.status}): ${body.slice(0, 500)}`);
    throw new Error(
      res.status === 404
        ? "Signals source not ready: the glance_signal_stats function is not deployed to Supabase yet."
        : `Signals query failed (${res.status})`,
    );
  }

  const rows = (await res.json()) as SignalStatRow[];

  // Mirror GA's "NdaysAgo..today" window (N+1 days inclusive) and the
  // equally sized window immediately before it.
  const today = new Date();
  const currentStart = isoDay(subDays(today, days));
  const previousStart = isoDay(subDays(today, days * 2 + 1));
  const previousEnd = isoDay(subDays(today, days + 1));

  // One population for every number on the panel — a future event type must be
  // added here deliberately, not leak into some aggregates and not others.
  const wanted = new Set(["whatsapp_click", "instagram_click"]);
  const siteRows = rows.filter(
    (r) => r.site === siteDomain && wanted.has(r.event_type),
  );
  const current = siteRows.filter((r) => r.day >= currentStart);
  const previous = siteRows.filter(
    (r) => r.day >= previousStart && r.day <= previousEnd,
  );

  let whatsapp = 0;
  let instagram = 0;
  const modelCounts = new Map<string, number>();
  const weekBuckets = new Map<string, { whatsapp: number; instagram: number }>();

  for (const row of current) {
    const n = Number(row.n) || 0;
    if (row.event_type === "whatsapp_click") whatsapp += n;
    else if (row.event_type === "instagram_click") instagram += n;

    const vehicle = row.vehicle === "unspecified" ? "(no model)" : row.vehicle;
    modelCounts.set(vehicle, (modelCounts.get(vehicle) ?? 0) + n);

    const week = isoDay(
      startOfWeek(new Date(`${row.day}T00:00:00`), { weekStartsOn: 1 }),
    );
    const bucket = weekBuckets.get(week) ?? { whatsapp: 0, instagram: 0 };
    if (row.event_type === "whatsapp_click") bucket.whatsapp += n;
    else if (row.event_type === "instagram_click") bucket.instagram += n;
    weekBuckets.set(week, bucket);
  }

  const byModel: SignalModelRow[] = [...modelCounts.entries()]
    .map(([vehicle, count]) => ({ vehicle, count }))
    .sort((a, b) => b.count - a.count);

  const byWeek: SignalWeekRow[] = [...weekBuckets.entries()]
    .map(([weekStart, counts]) => ({ weekStart, ...counts }))
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart));

  const previousTotal = previous.reduce((sum, r) => sum + (Number(r.n) || 0), 0);

  return {
    site: siteDomain,
    range,
    fetchedAt: new Date().toISOString(),
    total: whatsapp + instagram,
    whatsapp,
    instagram,
    previousTotal,
    byModel,
    byWeek,
  };
}
