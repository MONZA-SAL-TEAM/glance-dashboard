export type DateRangeKey = "7d" | "28d" | "90d";

/** "lb" shows Lebanon-only traffic (bot noise removed), "all" is raw GA4. */
export type TrafficFilter = "lb" | "all";

export type DashboardMode = "live";

export interface OverviewMetrics {
  users: number;
  newUsers: number;
  sessions: number;
  pageviews: number;
  engagementRate: number;
  bounceRate: number;
  avgSessionDuration: number;
}

export interface TimeseriesPoint {
  date: string;
  users: number;
  sessions: number;
  /** Users on the matching day of the previous period, index-aligned. */
  prevUsers: number;
}

export interface ChannelRow {
  channel: string;
  users: number;
  sessions: number;
}

export interface PageRow {
  path: string;
  views: number;
  users: number;
}

export interface LandingRow {
  path: string;
  sessions: number;
  users: number;
}

export interface GeoRow {
  name: string;
  users: number;
}

export interface DeviceRow {
  device: string;
  users: number;
}

export interface SiteProperty {
  id: string;
  name: string;
  url?: string;
}

export interface OverviewPayload {
  mode: DashboardMode;
  propertyId: string;
  propertyName: string;
  range: DateRangeKey;
  filter: TrafficFilter;
  fetchedAt: string;
  overview: OverviewMetrics;
  /** Same metrics for the immediately preceding period of equal length. */
  previous: OverviewMetrics | null;
  timeseries: TimeseriesPoint[];
  channels: ChannelRow[];
  landings: LandingRow[];
  pages: PageRow[];
  /** Countries in raw view, cities when the Lebanon filter is on. */
  geo: GeoRow[];
  geoKind: "country" | "city";
  devices: DeviceRow[];
}

export interface RealtimePayload {
  mode: DashboardMode;
  propertyId: string;
  propertyName: string;
  fetchedAt: string;
  activeUsers: number;
  byPage: PageRow[];
  byCountry: GeoRow[];
}

export interface SignalModelRow {
  vehicle: string;
  count: number;
}

export interface SignalWeekRow {
  /** ISO date of the Monday starting the week. */
  weekStart: string;
  whatsapp: number;
  instagram: number;
}

export interface SignalsPayload {
  /** Site domain the signals were filtered to. */
  site: string;
  range: DateRangeKey;
  fetchedAt: string;
  total: number;
  whatsapp: number;
  instagram: number;
  /** Total for the immediately preceding period of equal length. */
  previousTotal: number;
  byModel: SignalModelRow[];
  byWeek: SignalWeekRow[];
}
