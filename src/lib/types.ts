export type DateRangeKey = "7d" | "28d" | "90d";

export type DashboardMode = "live";

export interface OverviewMetrics {
  users: number;
  newUsers: number;
  sessions: number;
  pageviews: number;
  bounceRate: number;
  avgSessionDuration: number;
}

export interface TimeseriesPoint {
  date: string;
  users: number;
  sessions: number;
}

export interface SourceRow {
  source: string;
  medium: string;
  users: number;
  sessions: number;
}

export interface PageRow {
  path: string;
  views: number;
  users: number;
}

export interface CountryRow {
  country: string;
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
  fetchedAt: string;
  overview: OverviewMetrics;
  timeseries: TimeseriesPoint[];
  sources: SourceRow[];
  pages: PageRow[];
  countries: CountryRow[];
  devices: DeviceRow[];
}

export interface RealtimePayload {
  mode: DashboardMode;
  propertyId: string;
  propertyName: string;
  fetchedAt: string;
  activeUsers: number;
  byPage: PageRow[];
  byCountry: CountryRow[];
}
