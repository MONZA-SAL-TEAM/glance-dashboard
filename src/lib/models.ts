import {
  dateRangesFor,
  dimensionValue,
  geoFilterFor,
  getClient,
  metricNumber,
  propertyPath,
} from "./ga";
import { fetchSignalOverview } from "./signals";
import type { DateRangeKey, ModelPageRow, ModelPagesPayload, TrafficFilter } from "./types";

/**
 * Model-level interest, built entirely from GA4 page-path data that already
 * exists plus the first-party signals — no site changes required.
 *
 * Popularity (page traffic) and intent (signals) are kept as separate
 * measures on purpose: a page can draw a crowd that never acts, or a small
 * audience that converts hard, and collapsing them into one score would hide
 * exactly the difference worth acting on.
 */

/** GA4 properties whose pages are model pages. */
const MODEL_SITES = [
  { propertyId: "541962515", domain: "voyahlebanon.com" },
  { propertyId: "540543412", domain: "mherolebanon.com" },
];

/**
 * Path → canonical model label. Ordered: the first matching rule wins, so
 * longer slugs ("passion-l") must precede their prefixes ("passion").
 */
const PATH_RULES: Array<{ test: RegExp; label: string }> = [
  // VOYAH — /models/<slug>
  { test: /^\/models\/free-?(plus|\+)$/, label: "VOYAH Free+" },
  { test: /^\/models\/free(-318)?(-competition)?$/, label: "VOYAH Free" },
  { test: /^\/models\/passion-l$/, label: "VOYAH Passion L" },
  { test: /^\/models\/passion$/, label: "VOYAH Passion" },
  { test: /^\/models\/courage$/, label: "VOYAH Courage" },
  { test: /^\/models\/dream$/, label: "VOYAH Dream" },
  { test: /^\/models\/taishan$/, label: "VOYAH Taishan" },
  // MHERO — public names are MHERO 1 (the 917) and MHERO 2 (the 817);
  // every alias the site has ever served folds into those two labels.
  { test: /^\/(mhero-?1|model-?1|917|mhero-917|m-hero-1)$/, label: "MHERO 1" },
  { test: /^\/(mhero-?2|model-?2|817|mhero-817|m-hero-2)$/, label: "MHERO 2" },
];

/** Normalize a GA pagePath before matching: drop query/hash, trailing slash,
 * .html suffix, and case. */
function normalizePath(raw: string): string {
  let p = (raw || "").split("?")[0].split("#")[0].trim().toLowerCase();
  p = p.replace(/\.html?$/, "");
  if (p.length > 1) p = p.replace(/\/+$/, "");
  if (!p.startsWith("/")) p = `/${p}`;
  return p;
}

export function modelForPath(raw: string): string | null {
  const path = normalizePath(raw);
  for (const rule of PATH_RULES) {
    if (rule.test.test(path)) return rule.label;
  }
  return null;
}

/** Paths that look like model pages but matched no rule — surfaced rather
 * than silently dropped, so a new model page can't go uncounted. */
function looksLikeModelPage(raw: string): boolean {
  const p = normalizePath(raw);
  return /^\/models?\//.test(p) || /^\/(mhero|m-hero|9\d{2}|8\d{2})/.test(p);
}

interface PageAgg {
  views: number;
  users: number;
  sessions: number;
  prevViews: number;
  prevUsers: number;
  engagedSessions: number;
  engagementSessionBase: number;
}

function emptyAgg(): PageAgg {
  return {
    views: 0,
    users: 0,
    sessions: 0,
    prevViews: 0,
    prevUsers: 0,
    engagedSessions: 0,
    engagementSessionBase: 0,
  };
}

export async function fetchModelPages(
  range: DateRangeKey,
  filter: TrafficFilter,
  propertyId?: string,
): Promise<ModelPagesPayload> {
  const client = getClient();
  const { current, previous } = dateRangesFor(range);
  const geoFilter = geoFilterFor(filter);

  // Scoped to one brand dashboard, or all model sites for the portfolio.
  const sites = propertyId
    ? MODEL_SITES.filter((s) => s.propertyId === propertyId)
    : MODEL_SITES;
  const scopedDomain = propertyId
    ? MODEL_SITES.find((s) => s.propertyId === propertyId)?.domain
    : undefined;

  const byModel = new Map<string, PageAgg>();
  const unmapped = new Set<string>();

  await Promise.all(
    sites.map(async (site) => {
      const property = propertyPath(site.propertyId);

      // Traffic: current + previous window in one request.
      const trafficRes = await client.runReport({
        property,
        dateRanges: [current, previous],
        dimensions: [{ name: "pagePath" }],
        metrics: [
          { name: "screenPageViews" },
          { name: "totalUsers" },
          { name: "sessions" },
        ],
        orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
        limit: 400,
        ...geoFilter,
      });

      for (const row of trafficRes[0].rows ?? []) {
        const rawPath = dimensionValue(row, 0);
        const isPrevious = dimensionValue(row, 1) === "date_range_1";
        const label = modelForPath(rawPath);
        if (!label) {
          if (looksLikeModelPage(rawPath)) unmapped.add(rawPath);
          continue;
        }
        const agg = byModel.get(label) ?? emptyAgg();
        if (isPrevious) {
          agg.prevViews += metricNumber(row, 0);
          agg.prevUsers += metricNumber(row, 1);
        } else {
          agg.views += metricNumber(row, 0);
          agg.users += metricNumber(row, 1);
          agg.sessions += metricNumber(row, 2);
        }
        byModel.set(label, agg);
      }

      // Engagement is requested separately: pairing a session-scoped rate with
      // a page dimension is the most brittle part of this query, and a failure
      // here must not cost us the traffic numbers.
      try {
        const engRes = await client.runReport({
          property,
          dateRanges: [current],
          dimensions: [{ name: "pagePath" }],
          metrics: [{ name: "engagedSessions" }, { name: "sessions" }],
          limit: 400,
          ...geoFilter,
        });
        for (const row of engRes[0].rows ?? []) {
          const label = modelForPath(dimensionValue(row, 0));
          if (!label) continue;
          const agg = byModel.get(label);
          if (!agg) continue;
          agg.engagedSessions += metricNumber(row, 0);
          agg.engagementSessionBase += metricNumber(row, 1);
        }
      } catch (error) {
        console.error(
          `model engagement query failed for ${site.domain}:`,
          error instanceof Error ? error.message : error,
        );
      }
    }),
  );

  // Intent signals per model, from the first-party capture (all sites — a
  // Monza hub click-out for Courage is Courage demand wherever it happened).
  let signalsByModel = new Map<string, number>();
  let signalsError: string | undefined;
  try {
    const overview = await fetchSignalOverview(range);
    signalsByModel = new Map(
      overview.demand.map(
        (d) =>
          [
            d.vehicle,
            // A brand dashboard counts that site's own signals; the
            // portfolio counts the model's demand wherever it happened.
            scopedDomain ? (d.bySite[scopedDomain] ?? 0) : d.total,
          ] as const,
      ),
    );
  } catch (error) {
    signalsError =
      error instanceof Error ? error.message : "Signals unavailable";
  }

  // Every model that has either traffic or signals gets a row.
  const labels = new Set<string>([
    ...byModel.keys(),
    ...[...signalsByModel.keys()].filter((v) =>
      PATH_RULES.some((r) => r.label === v),
    ),
  ]);

  const rows: ModelPageRow[] = [...labels].map((model) => {
    const agg = byModel.get(model) ?? emptyAgg();
    const signals = signalsByModel.get(model) ?? 0;
    const engagementRate =
      agg.engagementSessionBase > 0
        ? (agg.engagedSessions / agg.engagementSessionBase) * 100
        : null;
    const usersChange =
      agg.prevUsers > 0
        ? ((agg.users - agg.prevUsers) / agg.prevUsers) * 100
        : null;
    return {
      model,
      views: agg.views,
      users: agg.users,
      sessions: agg.sessions,
      prevUsers: agg.prevUsers,
      usersChange,
      viewsPerUser: agg.users > 0 ? agg.views / agg.users : null,
      engagementRate,
      signals,
      // Intent relative to the size of the audience that read the page.
      // Approximate by design: a signal can originate off the model page.
      signalsPer100Users: agg.users > 0 ? (signals / agg.users) * 100 : null,
    };
  });

  rows.sort((a, b) => b.views - a.views || b.signals - a.signals);

  return {
    range,
    filter,
    fetchedAt: new Date().toISOString(),
    propertyId,
    rows,
    unmappedPaths: [...unmapped].slice(0, 10),
    signalsError,
  };
}
