import { format, subDays } from "date-fns";
import { cached } from "./cache";
import { rangeDays } from "./ranges";
import {
  dateRangesFor,
  dimensionValue,
  geoFilterFor,
  getClient,
  metricNumber,
  propertyPath,
} from "./ga";
import { runHealthChecks } from "./health";
import { fetchSignalOverview } from "./signals";
import { KNOWN_SITES, PORTFOLIO_ORDER } from "./sites";
import {
  emptyBreakdown,
  type DateRangeKey,
  type HealthPayload,
  type PortfolioPayload,
  type PortfolioSite,
  type TrafficFilter,
} from "./types";

const PROPERTY_TIMEZONE = "Asia/Beirut";

export function getCachedHealth(): Promise<HealthPayload> {
  return cached("health:full", 15 * 60_000, runHealthChecks);
}

/** Health for the portfolio: served from cache, never allowed to block the
 * page — if a fresh run is still in flight past the deadline the cards show
 * "checking…" and the next request hits the warm cache. */
function healthWithDeadline(ms: number): Promise<HealthPayload | null> {
  return Promise.race([
    getCachedHealth().catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

/**
 * The three-site home screen: per property, one summary report (current +
 * previous window) and one daily-users report for the sparkline, plus a single
 * Supabase call shared by all cards (totals + all-sites demand). Sites fail
 * independently — one property's GA error must not blank the other two cards.
 */
export async function fetchPortfolio(
  range: DateRangeKey,
  filter: TrafficFilter,
): Promise<PortfolioPayload> {
  // Credentials failure must degrade to per-card errors, not kill the view —
  // the Supabase signal numbers don't need Google at all.
  let client: ReturnType<typeof getClient> | null = null;
  let clientError: string | null = null;
  try {
    client = getClient();
  } catch (error) {
    clientError =
      error instanceof Error ? error.message.split("\n")[0] : "GA unavailable";
  }
  const { current, previous } = dateRangesFor(range);
  const geoFilter = geoFilterFor(filter);
  const days = rangeDays(range);

  const signalsPromise = fetchSignalOverview(range).then(
    (overview) => ({ overview, error: undefined as string | undefined }),
    (error) => ({
      overview: null,
      error: error instanceof Error ? error.message : "Signals unavailable",
    }),
  );

  const sitePromises = PORTFOLIO_ORDER.map(async (propertyId) => {
    const site = KNOWN_SITES[propertyId];
    const property = propertyPath(propertyId);
    const base: PortfolioSite = {
      propertyId,
      alias: site.alias,
      name: site.name,
      domain: site.domain,
      users: 0,
      prevUsers: 0,
      sessions: 0,
      signals: 0,
      highIntent: 0,
      prevSignals: 0,
      byType: emptyBreakdown(),
      signalRate: null,
      spark: [],
      health: null,
    };

    try {
      if (!client) throw new Error(clientError ?? "GA unavailable");
      const [summaryRes, sparkRes] = await Promise.all([
        client.runReport({
          property,
          dateRanges: [current, previous],
          metrics: [{ name: "totalUsers" }, { name: "sessions" }],
          ...geoFilter,
        }),
        client.runReport({
          property,
          dateRanges: [current],
          dimensions: [{ name: "date" }],
          metrics: [{ name: "totalUsers" }],
          orderBys: [{ dimension: { dimensionName: "date" } }],
          limit: days + 10,
          ...geoFilter,
        }),
      ]);

      const rows = summaryRes[0].rows ?? [];
      const summaryCurrent = rows.find(
        (row) => dimensionValue(row, 0) === "date_range_0",
      );
      const summaryPrevious = rows.find(
        (row) => dimensionValue(row, 0) === "date_range_1",
      );
      base.users = metricNumber(summaryCurrent, 0);
      base.sessions = metricNumber(summaryCurrent, 1);
      base.prevUsers = metricNumber(summaryPrevious, 0);

      // Dense daily sparkline, anchored the same way as the main chart.
      const byDay = new Map<string, number>();
      for (const row of sparkRes[0].rows ?? []) {
        const raw = dimensionValue(row, 0);
        byDay.set(
          `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`,
          metricNumber(row, 0),
        );
      }
      const tzToday = new Intl.DateTimeFormat("en-CA", {
        timeZone: PROPERTY_TIMEZONE,
      }).format(new Date());
      const maxDataDate = [...byDay.keys()].sort().pop() ?? "";
      const anchorIso = maxDataDate > tzToday ? maxDataDate : tzToday;
      const anchor = new Date(`${anchorIso}T00:00:00`);
      for (let i = days; i >= 0; i--) {
        base.spark.push(byDay.get(format(subDays(anchor, i), "yyyy-MM-dd")) ?? 0);
      }
    } catch (error) {
      base.error =
        error instanceof Error ? error.message.split("\n")[0] : "GA query failed";
    }

    return base;
  });

  const [sites, signalsResult, health] = await Promise.all([
    Promise.all(sitePromises),
    signalsPromise,
    healthWithDeadline(3500),
  ]);

  for (const site of sites) {
    const totals = signalsResult.overview?.totalsBySite.get(site.domain);
    if (totals) {
      site.signals = totals.total;
      site.highIntent = totals.highIntent;
      site.byType = totals.byType;
      site.prevSignals = totals.previousTotal;
      site.signalRate =
        !site.error && site.users > 0
          ? (totals.total / site.users) * 100
          : null;
    }
    site.health =
      health?.sites.find((h) => h.site === site.domain) ?? null;
  }

  const demand = signalsResult.overview?.demand ?? [];
  return {
    range,
    filter,
    fetchedAt: new Date().toISOString(),
    sites,
    demand,
    // The top model is deliberately not an insight — it already leads the
    // headline tiles and the demand board. "This period" carries changes,
    // anomalies, and health only.
    insights: buildInsights(sites, health, signalsResult.error),
    signalsError: signalsResult.error,
    healthError: health ? undefined : "health check still running",
  };
}

function pctLabel(current: number, previous: number): string | null {
  if (!Number.isFinite(previous) || previous <= 0) return null;
  const change = ((current - previous) / previous) * 100;
  if (Math.abs(change) < 0.5) return "flat";
  return `${change > 0 ? "up" : "down"} ${Math.abs(change).toFixed(0)}%`;
}

/** The home screen's 3–5 lines: what happened, what people want, is anything
 * broken. Deterministic and grounded — never speculative. */
function buildInsights(
  sites: PortfolioSite[],
  health: HealthPayload | null,
  signalsError: string | undefined,
): string[] {
  const insights: string[] = [];
  const gaOk = sites.filter((s) => !s.error);

  const users = gaOk.reduce((a, s) => a + s.users, 0);
  const prevUsers = gaOk.reduce((a, s) => a + s.prevUsers, 0);
  const usersDelta = pctLabel(users, prevUsers);
  if (gaOk.length < sites.length) {
    insights.push(
      `GA data unavailable for ${sites.length - gaOk.length} of ${sites.length} sites — traffic numbers are partial.`,
    );
  } else if (usersDelta) {
    insights.push(
      `Total site users ${usersDelta} vs the previous period (${users} summed across the three sites).`,
    );
  }

  if (!signalsError) {
    const signals = sites.reduce((a, s) => a + s.signals, 0);
    const prevSignals = sites.reduce((a, s) => a + s.prevSignals, 0);
    const signalsDelta = pctLabel(signals, prevSignals);
    if (signalsDelta) {
      insights.push(`Intent signals ${signalsDelta} (${signals} in this period).`);
    }
    for (const s of sites) {
      if (!s.error && s.prevSignals >= 5 && s.signals === 0) {
        insights.push(
          `${s.name} recorded zero signals after ${s.prevSignals} last period — check tracking before assuming demand fell.`,
        );
      }
    }
  }

  let biggestMove: { site: PortfolioSite; change: number } | null = null;
  for (const s of gaOk) {
    if (s.prevUsers < 20) continue;
    const change = ((s.users - s.prevUsers) / s.prevUsers) * 100;
    if (Math.abs(change) >= 15 && (!biggestMove || Math.abs(change) > Math.abs(biggestMove.change))) {
      biggestMove = { site: s, change };
    }
  }
  if (biggestMove) {
    insights.push(
      `${biggestMove.site.name} traffic ${biggestMove.change > 0 ? "up" : "down"} ${Math.abs(biggestMove.change).toFixed(0)}% (${biggestMove.site.prevUsers} → ${biggestMove.site.users} users).`,
    );
  }

  if (health) {
    const troubled = health.sites.filter(
      (h) => h.status === "warning" || h.status === "critical",
    );
    insights.push(
      troubled.length === 0
        ? "No tracking issues detected on monitored pages."
        : `${troubled.length} site${troubled.length > 1 ? "s have" : " has"} tracking warnings — see tracking health below.`,
    );
  }

  return insights.slice(0, 5);
}
