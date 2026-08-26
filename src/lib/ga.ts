import { BetaAnalyticsDataClient } from "@google-analytics/data";
import { format, subDays } from "date-fns";
import { getGoogleCredentials } from "./google-credentials";
import { getPropertyMeta, resolvePropertyId } from "./properties";
import type {
  ChannelRow,
  DateRangeKey,
  DeviceRow,
  GeoRow,
  LandingRow,
  OverviewMetrics,
  OverviewPayload,
  PageRow,
  RealtimePayload,
  TimeseriesPoint,
  TrafficFilter,
} from "./types";

/** All three Monza GA4 properties report in Beirut time. */
const PROPERTY_TIMEZONE = "Asia/Beirut";

function rangeDays(range: DateRangeKey): number {
  if (range === "7d") return 7;
  if (range === "90d") return 90;
  return 28;
}

/** Current window and the equally sized window immediately before it. */
export function dateRangesFor(range: DateRangeKey) {
  const days = rangeDays(range);
  return {
    current: { startDate: `${days}daysAgo`, endDate: "today" },
    previous: {
      startDate: `${days * 2 + 1}daysAgo`,
      endDate: `${days + 1}daysAgo`,
    },
  };
}

/**
 * The Lebanon filter is the "real traffic" view: monzasal.com shows roughly
 * half its users from Singapore-based crawlers, so raw totals mislead.
 */
export function geoFilterFor(filter: TrafficFilter) {
  if (filter !== "lb") return {};
  return {
    dimensionFilter: {
      filter: {
        fieldName: "country",
        stringFilter: { matchType: "EXACT" as const, value: "Lebanon" },
      },
    },
  };
}

export function getClient() {
  return new BetaAnalyticsDataClient({
    credentials: getGoogleCredentials(),
  });
}

export function propertyPath(propertyId: string) {
  return `properties/${propertyId}`;
}

type ReportRow = {
  dimensionValues?: Array<{ value?: string | null }> | null;
  metricValues?: Array<{ value?: string | null }> | null;
};

export function metricNumber(row: ReportRow | undefined, index: number) {
  return Number(row?.metricValues?.[index]?.value ?? 0);
}

export function dimensionValue(row: ReportRow | undefined, index: number) {
  return row?.dimensionValues?.[index]?.value ?? "";
}

function parseSummary(row: ReportRow | undefined): OverviewMetrics {
  return {
    users: metricNumber(row, 0),
    newUsers: metricNumber(row, 1),
    sessions: metricNumber(row, 2),
    pageviews: metricNumber(row, 3),
    engagementRate: metricNumber(row, 4),
    bounceRate: metricNumber(row, 5),
    avgSessionDuration: metricNumber(row, 6),
  };
}

function cleanLabel(value: string, fallback: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "(not set)") return fallback;
  return trimmed;
}

export async function fetchOverview(
  range: DateRangeKey,
  requestedProperty?: string | null,
  filter: TrafficFilter = "lb",
): Promise<OverviewPayload> {
  const propertyId = await resolvePropertyId(requestedProperty);
  const meta = await getPropertyMeta(propertyId);
  const client = getClient();
  const property = propertyPath(propertyId);
  const { current, previous } = dateRangesFor(range);
  const geoFilter = geoFilterFor(filter);
  const geoKind = filter === "lb" ? ("city" as const) : ("country" as const);

  const [
    summaryRes,
    timeseriesRes,
    channelsRes,
    landingsRes,
    pagesRes,
    geoRes,
    devicesRes,
  ] = await Promise.all([
    client.runReport({
      property,
      dateRanges: [current, previous],
      metrics: [
        { name: "totalUsers" },
        { name: "newUsers" },
        { name: "sessions" },
        { name: "screenPageViews" },
        { name: "engagementRate" },
        { name: "bounceRate" },
        { name: "averageSessionDuration" },
      ],
      ...geoFilter,
    }),
    client.runReport({
      property,
      dateRanges: [current, previous],
      dimensions: [{ name: "date" }],
      metrics: [{ name: "totalUsers" }, { name: "sessions" }],
      orderBys: [{ dimension: { dimensionName: "date" } }],
      limit: 400,
      ...geoFilter,
    }),
    client.runReport({
      property,
      dateRanges: [current],
      dimensions: [{ name: "sessionDefaultChannelGroup" }],
      metrics: [{ name: "totalUsers" }, { name: "sessions" }],
      orderBys: [{ metric: { metricName: "totalUsers" }, desc: true }],
      limit: 10,
      ...geoFilter,
    }),
    client.runReport({
      property,
      dateRanges: [current],
      dimensions: [{ name: "landingPage" }],
      metrics: [{ name: "sessions" }, { name: "totalUsers" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 12,
      ...geoFilter,
    }),
    client.runReport({
      property,
      dateRanges: [current],
      dimensions: [{ name: "pagePath" }],
      metrics: [{ name: "screenPageViews" }, { name: "totalUsers" }],
      orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
      limit: 10,
      ...geoFilter,
    }),
    client.runReport({
      property,
      dateRanges: [current],
      dimensions: [{ name: geoKind }],
      metrics: [{ name: "totalUsers" }],
      orderBys: [{ metric: { metricName: "totalUsers" }, desc: true }],
      limit: 10,
      ...geoFilter,
    }),
    client.runReport({
      property,
      dateRanges: [current],
      dimensions: [{ name: "deviceCategory" }],
      metrics: [{ name: "totalUsers" }],
      orderBys: [{ metric: { metricName: "totalUsers" }, desc: true }],
      ...geoFilter,
    }),
  ]);

  // With two dateRanges GA appends a dateRange dimension as the last one.
  const summaryRows = summaryRes[0].rows ?? [];
  const summaryCurrent = summaryRows.find(
    (row) => dimensionValue(row, 0) === "date_range_0",
  );
  const summaryPrevious = summaryRows.find(
    (row) => dimensionValue(row, 0) === "date_range_1",
  );

  const usersByDay = new Map<string, { users: number; sessions: number }>();
  const prevUsersByDay = new Map<string, number>();
  for (const row of timeseriesRes[0].rows ?? []) {
    const raw = dimensionValue(row, 0);
    const date = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
    if (dimensionValue(row, 1) === "date_range_1") {
      prevUsersByDay.set(date, metricNumber(row, 0));
    } else {
      usersByDay.set(date, {
        users: metricNumber(row, 0),
        sessions: metricNumber(row, 1),
      });
    }
  }

  // GA omits zero days, so build dense, index-aligned windows locally.
  // Anchor on GA's own "today" — the property reports in Beirut time while the
  // server runs UTC, so the server clock can lag GA by a calendar day.
  const days = rangeDays(range);
  const tzToday = new Intl.DateTimeFormat("en-CA", {
    timeZone: PROPERTY_TIMEZONE,
  }).format(new Date());
  const maxDataDate = [...usersByDay.keys()].sort().pop() ?? "";
  const anchorIso = maxDataDate > tzToday ? maxDataDate : tzToday;
  const anchor = new Date(`${anchorIso}T00:00:00`);
  const timeseries: TimeseriesPoint[] = [];
  for (let i = days; i >= 0; i--) {
    const date = format(subDays(anchor, i), "yyyy-MM-dd");
    const prevDate = format(subDays(anchor, i + days + 1), "yyyy-MM-dd");
    const point = usersByDay.get(date);
    timeseries.push({
      date,
      users: point?.users ?? 0,
      sessions: point?.sessions ?? 0,
      prevUsers: prevUsersByDay.get(prevDate) ?? 0,
    });
  }

  const channels: ChannelRow[] = (channelsRes[0].rows ?? []).map((row) => ({
    channel: cleanLabel(dimensionValue(row, 0), "Unassigned"),
    users: metricNumber(row, 0),
    sessions: metricNumber(row, 1),
  }));

  const landings: LandingRow[] = (landingsRes[0].rows ?? [])
    .filter((row) => dimensionValue(row, 0).trim() !== "(not set)")
    .slice(0, 10)
    .map((row) => ({
      path: dimensionValue(row, 0) || "/",
      sessions: metricNumber(row, 0),
      users: metricNumber(row, 1),
    }));

  const pages: PageRow[] = (pagesRes[0].rows ?? []).map((row) => ({
    path: dimensionValue(row, 0) || "/",
    views: metricNumber(row, 0),
    users: metricNumber(row, 1),
  }));

  const geo: GeoRow[] = (geoRes[0].rows ?? []).map((row) => ({
    name: cleanLabel(dimensionValue(row, 0), "Unknown"),
    users: metricNumber(row, 0),
  }));

  const devices: DeviceRow[] = (devicesRes[0].rows ?? []).map((row) => ({
    device: dimensionValue(row, 0) || "unknown",
    users: metricNumber(row, 0),
  }));

  return {
    mode: "live",
    propertyId,
    propertyName: meta.name,
    range,
    filter,
    fetchedAt: new Date().toISOString(),
    overview: parseSummary(summaryCurrent),
    previous: summaryPrevious ? parseSummary(summaryPrevious) : null,
    timeseries,
    channels,
    landings,
    pages,
    geo,
    geoKind,
    devices,
  };
}

export async function fetchRealtime(
  requestedProperty?: string | null,
): Promise<RealtimePayload> {
  const propertyId = await resolvePropertyId(requestedProperty);
  const meta = await getPropertyMeta(propertyId);
  const client = getClient();
  const property = propertyPath(propertyId);

  const [activeRes, pagesRes, countriesRes] = await Promise.all([
    client.runRealtimeReport({
      property,
      metrics: [{ name: "activeUsers" }],
    }),
    client.runRealtimeReport({
      property,
      dimensions: [{ name: "unifiedScreenName" }],
      metrics: [{ name: "activeUsers" }],
      orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }],
      limit: 6,
    }),
    client.runRealtimeReport({
      property,
      dimensions: [{ name: "country" }],
      metrics: [{ name: "activeUsers" }],
      orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }],
      limit: 6,
    }),
  ]);

  return {
    mode: "live",
    propertyId,
    propertyName: meta.name,
    fetchedAt: new Date().toISOString(),
    activeUsers: metricNumber(activeRes[0].rows?.[0], 0),
    byPage: (pagesRes[0].rows ?? []).map((row) => ({
      path: dimensionValue(row, 0) || "/",
      views: metricNumber(row, 0),
      users: metricNumber(row, 0),
    })),
    byCountry: (countriesRes[0].rows ?? []).map((row) => ({
      name: dimensionValue(row, 0) || "Unknown",
      users: metricNumber(row, 0),
    })),
  };
}
