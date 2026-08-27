import { format, startOfWeek, subDays } from "date-fns";
import {
  emptyBreakdown,
  EVENT_TYPES,
  HIGH_INTENT_TYPES,
  type DateRangeKey,
  type DemandRow,
  type EventType,
  type SignalBreakdown,
  type SignalModelRow,
  type SignalsPayload,
  type SignalWeekRow,
} from "./types";

/**
 * First-party intent signals captured by the sites into the Monza SAL APP
 * Supabase, read through the aggregate-only RPC `glance_signal_stats` (daily
 * counts per site/type/model — never row-level or personal data).
 *
 * Access: the publishable key alone works only while the DB-side token gate
 * is dormant. Once `signals_token_required` is activated in glance_config,
 * every call must carry GLANCE_SIGNALS_TOKEN (server-side env; the browser
 * never sees it — these fetches all run in API routes).
 */
const SUPABASE_URL =
  process.env.SUPABASE_URL || "https://okxpsvukzjjubinhamek.supabase.co";
const SUPABASE_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  "sb_publishable_xS7t2B_E2mTpx-NrddvOeQ_RQJp6kBg";
const SIGNALS_TOKEN = process.env.GLANCE_SIGNALS_TOKEN || null;

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

function isEventType(value: string): value is EventType {
  return (EVENT_TYPES as readonly string[]).includes(value);
}

export async function supabaseRpc<T>(
  fn: string,
  body: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(`${fn} failed (${res.status}): ${text.slice(0, 500)}`);
    throw new Error(
      res.status === 404
        ? `Signals source not ready: ${fn} is not deployed to Supabase yet.`
        : res.status === 401 || res.status === 403
          ? `Signals access denied — check GLANCE_SIGNALS_TOKEN.`
          : `Signals query failed (${res.status})`,
    );
  }
  return (await res.json()) as T;
}

async function fetchSignalRows(days: number): Promise<SignalStatRow[]> {
  return supabaseRpc<SignalStatRow[]>("glance_signal_stats", {
    p_days: days,
    ...(SIGNALS_TOKEN ? { p_token: SIGNALS_TOKEN } : {}),
  });
}

export interface SiteSignalTotals {
  total: number;
  highIntent: number;
  byType: SignalBreakdown;
  previousTotal: number;
}

export interface SignalOverview {
  totalsBySite: Map<string, SiteSignalTotals>;
  /** All-sites model demand for the current window (normalized names). */
  demand: DemandRow[];
}

function windowBounds(range: DateRangeKey) {
  const days = rangeDays(range);
  // Anchor to the property timezone (like ga.ts) so the signals window and
  // GA's "NdaysAgo..today" window roll to a new day at the same moment.
  const todayIso = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Beirut",
  }).format(new Date());
  const today = new Date(`${todayIso}T00:00:00`);
  return {
    days,
    currentStart: isoDay(subDays(today, days)),
    previousStart: isoDay(subDays(today, days * 2 + 1)),
    previousEnd: isoDay(subDays(today, days + 1)),
  };
}

/**
 * One RPC call powering the portfolio: per-site totals/breakdowns plus the
 * combined all-sites model demand board.
 */
export async function fetchSignalOverview(
  range: DateRangeKey,
): Promise<SignalOverview> {
  const { days, currentStart, previousStart, previousEnd } =
    windowBounds(range);
  const rows = await fetchSignalRows(days * 2 + 2);

  const totalsBySite = new Map<string, SiteSignalTotals>();
  const demandByVehicle = new Map<string, DemandRow>();

  for (const row of rows) {
    if (!isEventType(row.event_type)) continue;
    const n = Number(row.n) || 0;
    const totals =
      totalsBySite.get(row.site) ??
      ({
        total: 0,
        highIntent: 0,
        byType: emptyBreakdown(),
        previousTotal: 0,
      } as SiteSignalTotals);

    if (row.day >= currentStart) {
      totals.total += n;
      totals.byType[row.event_type] += n;
      if (HIGH_INTENT_TYPES.includes(row.event_type)) totals.highIntent += n;

      // Untagged signals count toward totals but not the demand board —
      // "unspecified" is not a vehicle and would otherwise rank first.
      if (row.vehicle !== "unspecified") {
        const demand =
          demandByVehicle.get(row.vehicle) ??
          ({ vehicle: row.vehicle, total: 0, bySite: {} } as DemandRow);
        demand.total += n;
        demand.bySite[row.site] = (demand.bySite[row.site] ?? 0) + n;
        demandByVehicle.set(row.vehicle, demand);
      }
    } else if (row.day >= previousStart && row.day <= previousEnd) {
      totals.previousTotal += n;
    }
    totalsBySite.set(row.site, totals);
  }

  const demand = [...demandByVehicle.values()].sort(
    (a, b) => b.total - a.total,
  );
  return { totalsBySite, demand };
}

export async function fetchSignals(
  range: DateRangeKey,
  siteDomain: string,
): Promise<SignalsPayload> {
  const { days, currentStart, previousStart, previousEnd } =
    windowBounds(range);
  const rows = await fetchSignalRows(days * 2 + 2);

  const siteRows = rows.filter(
    (r) => r.site === siteDomain && isEventType(r.event_type),
  );
  const current = siteRows.filter((r) => r.day >= currentStart);
  const previous = siteRows.filter(
    (r) => r.day >= previousStart && r.day <= previousEnd,
  );

  const byType = emptyBreakdown();
  let highIntent = 0;
  const modelCounts = new Map<string, number>();
  const weekBuckets = new Map<string, SignalWeekRow>();

  for (const row of current) {
    if (!isEventType(row.event_type)) continue;
    const n = Number(row.n) || 0;
    byType[row.event_type] += n;
    if (HIGH_INTENT_TYPES.includes(row.event_type)) highIntent += n;

    const vehicle = row.vehicle === "unspecified" ? "(no model)" : row.vehicle;
    modelCounts.set(vehicle, (modelCounts.get(vehicle) ?? 0) + n);

    const week = isoDay(
      startOfWeek(new Date(`${row.day}T00:00:00`), { weekStartsOn: 1 }),
    );
    const bucket =
      weekBuckets.get(week) ??
      ({
        weekStart: week,
        total: 0,
        highIntent: 0,
        byType: emptyBreakdown(),
      } as SignalWeekRow);
    bucket.total += n;
    bucket.byType[row.event_type] += n;
    if (HIGH_INTENT_TYPES.includes(row.event_type)) bucket.highIntent += n;
    weekBuckets.set(week, bucket);
  }

  const byModel: SignalModelRow[] = [...modelCounts.entries()]
    .map(([vehicle, count]) => ({ vehicle, count }))
    .sort((a, b) => b.count - a.count);

  const byWeek: SignalWeekRow[] = [...weekBuckets.values()].sort((a, b) =>
    a.weekStart.localeCompare(b.weekStart),
  );

  const previousTotal = previous.reduce(
    (sum, r) => sum + (Number(r.n) || 0),
    0,
  );
  const total = (Object.values(byType) as number[]).reduce((a, b) => a + b, 0);

  return {
    site: siteDomain,
    range,
    fetchedAt: new Date().toISOString(),
    total,
    highIntent,
    byType,
    previousTotal,
    byModel,
    byWeek,
  };
}
