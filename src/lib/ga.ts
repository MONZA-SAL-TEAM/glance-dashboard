import { BetaAnalyticsDataClient } from "@google-analytics/data";
import { getGoogleCredentials } from "./google-credentials";
import { getPropertyMeta, resolvePropertyId } from "./properties";
import type {
  CountryRow,
  DateRangeKey,
  DeviceRow,
  OverviewPayload,
  PageRow,
  RealtimePayload,
  SourceRow,
  TimeseriesPoint,
} from "./types";

function rangeToStartDate(range: DateRangeKey): string {
  if (range === "7d") return "7daysAgo";
  if (range === "90d") return "90daysAgo";
  return "28daysAgo";
}

function getClient() {
  return new BetaAnalyticsDataClient({
    credentials: getGoogleCredentials(),
  });
}

function propertyPath(propertyId: string) {
  return `properties/${propertyId}`;
}

function metricNumber(
  row: { metricValues?: Array<{ value?: string | null }> | null } | undefined,
  index: number,
) {
  return Number(row?.metricValues?.[index]?.value ?? 0);
}

function dimensionValue(
  row: { dimensionValues?: Array<{ value?: string | null }> | null } | undefined,
  index: number,
) {
  return row?.dimensionValues?.[index]?.value ?? "";
}

export async function fetchOverview(
  range: DateRangeKey,
  requestedProperty?: string | null,
): Promise<OverviewPayload> {
  const propertyId = await resolvePropertyId(requestedProperty);
  const meta = await getPropertyMeta(propertyId);
  const client = getClient();
  const property = propertyPath(propertyId);
  const startDate = rangeToStartDate(range);
  const dateRanges = [{ startDate, endDate: "today" }];

  const [summaryRes, timeseriesRes, sourcesRes, pagesRes, countriesRes, devicesRes] =
    await Promise.all([
      client.runReport({
        property,
        dateRanges,
        metrics: [
          { name: "totalUsers" },
          { name: "newUsers" },
          { name: "sessions" },
          { name: "screenPageViews" },
          { name: "bounceRate" },
          { name: "averageSessionDuration" },
        ],
      }),
      client.runReport({
        property,
        dateRanges,
        dimensions: [{ name: "date" }],
        metrics: [{ name: "totalUsers" }, { name: "sessions" }],
        orderBys: [{ dimension: { dimensionName: "date" } }],
      }),
      client.runReport({
        property,
        dateRanges,
        dimensions: [{ name: "sessionSource" }, { name: "sessionMedium" }],
        metrics: [{ name: "totalUsers" }, { name: "sessions" }],
        orderBys: [{ metric: { metricName: "totalUsers" }, desc: true }],
        limit: 10,
      }),
      client.runReport({
        property,
        dateRanges,
        dimensions: [{ name: "pagePath" }],
        metrics: [{ name: "screenPageViews" }, { name: "totalUsers" }],
        orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
        limit: 10,
      }),
      client.runReport({
        property,
        dateRanges,
        dimensions: [{ name: "country" }],
        metrics: [{ name: "totalUsers" }],
        orderBys: [{ metric: { metricName: "totalUsers" }, desc: true }],
        limit: 10,
      }),
      client.runReport({
        property,
        dateRanges,
        dimensions: [{ name: "deviceCategory" }],
        metrics: [{ name: "totalUsers" }],
        orderBys: [{ metric: { metricName: "totalUsers" }, desc: true }],
      }),
    ]);

  const summary = summaryRes[0].rows?.[0];
  const timeseries: TimeseriesPoint[] = (timeseriesRes[0].rows ?? []).map((row) => {
    const raw = dimensionValue(row, 0);
    const date = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
    return {
      date,
      users: metricNumber(row, 0),
      sessions: metricNumber(row, 1),
    };
  });

  const sources: SourceRow[] = (sourcesRes[0].rows ?? []).map((row) => ({
    source: dimensionValue(row, 0) || "(direct)",
    medium: dimensionValue(row, 1) || "(none)",
    users: metricNumber(row, 0),
    sessions: metricNumber(row, 1),
  }));

  const pages: PageRow[] = (pagesRes[0].rows ?? []).map((row) => ({
    path: dimensionValue(row, 0) || "/",
    views: metricNumber(row, 0),
    users: metricNumber(row, 1),
  }));

  const countries: CountryRow[] = (countriesRes[0].rows ?? []).map((row) => ({
    country: dimensionValue(row, 0) || "Unknown",
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
    fetchedAt: new Date().toISOString(),
    overview: {
      users: metricNumber(summary, 0),
      newUsers: metricNumber(summary, 1),
      sessions: metricNumber(summary, 2),
      pageviews: metricNumber(summary, 3),
      bounceRate: metricNumber(summary, 4),
      avgSessionDuration: metricNumber(summary, 5),
    },
    timeseries,
    sources,
    pages,
    countries,
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
      country: dimensionValue(row, 0) || "Unknown",
      users: metricNumber(row, 0),
    })),
  };
}
