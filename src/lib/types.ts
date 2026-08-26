export type DateRangeKey = "7d" | "28d" | "90d";

/** "lb" shows Lebanon-only traffic (bot noise removed), "all" is raw GA4. */
export type TrafficFilter = "lb" | "all";

export type DashboardMode = "live";

/**
 * Canonical first-party intent signal types (written by the sites into
 * website_events). High-intent = whatsapp + phone + form; broader demand
 * additionally counts outbound model clicks and Instagram.
 */
export const EVENT_TYPES = [
  "whatsapp_click",
  "phone_click",
  "form_submit",
  "outbound_model_click",
  "instagram_click",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];
export type SignalBreakdown = Record<EventType, number>;

export const HIGH_INTENT_TYPES: EventType[] = [
  "whatsapp_click",
  "phone_click",
  "form_submit",
];

export function emptyBreakdown(): SignalBreakdown {
  return {
    whatsapp_click: 0,
    phone_click: 0,
    form_submit: 0,
    outbound_model_click: 0,
    instagram_click: 0,
  };
}

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  whatsapp_click: "WhatsApp",
  phone_click: "Phone",
  form_submit: "Form",
  outbound_model_click: "Model click-out",
  instagram_click: "Instagram",
};

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

/* ------------------------------ health ------------------------------ */

export type HealthStatus = "healthy" | "warning" | "critical" | "unknown";

export interface HealthCheck {
  name: string;
  ok: boolean;
  /** true = degrades to warning only, not critical. */
  soft?: boolean;
  detail: string;
}

export interface SiteHealth {
  site: string;
  status: HealthStatus;
  summary: string;
  checks: HealthCheck[];
  checkedAt: string;
}

export interface HealthPayload {
  fetchedAt: string;
  sites: SiteHealth[];
  /** True when results were also persisted to the health history. */
  recorded: boolean;
  recordError?: string;
}

export interface HealthHistoryRun {
  id: string;
  createdAt: string;
  site: string;
  status: HealthStatus;
  summary: string | null;
}

/* ----------------------------- portfolio ----------------------------- */

export interface DemandRow {
  vehicle: string;
  total: number;
  /** Counts by site domain (voyahlebanon.com / mherolebanon.com / monzasal.com). */
  bySite: Record<string, number>;
}

export interface PortfolioSite {
  propertyId: string;
  alias: string;
  name: string;
  domain: string;
  users: number;
  prevUsers: number;
  sessions: number;
  signals: number;
  highIntent: number;
  prevSignals: number;
  byType: SignalBreakdown;
  /** Signals ÷ users, as a percentage; null when users is 0. */
  signalRate: number | null;
  /** Daily users for the current window, oldest first. */
  spark: number[];
  health: SiteHealth | null;
  /** Set when this site's GA fetch failed; the card renders the error. */
  error?: string;
}

export interface PortfolioPayload {
  range: DateRangeKey;
  filter: TrafficFilter;
  fetchedAt: string;
  sites: PortfolioSite[];
  /** All-sites model demand (directional, first-party). */
  demand: DemandRow[];
  /** Set when the signals source failed; cards then omit signal numbers. */
  signalsError?: string;
  healthError?: string;
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

/* ------------------------------ signals ------------------------------ */

export interface SignalModelRow {
  vehicle: string;
  count: number;
}

export interface SignalWeekRow {
  /** ISO date of the Monday starting the week. */
  weekStart: string;
  total: number;
  highIntent: number;
  byType: SignalBreakdown;
}

export interface SignalsPayload {
  /** Site domain the signals were filtered to. */
  site: string;
  range: DateRangeKey;
  fetchedAt: string;
  total: number;
  highIntent: number;
  byType: SignalBreakdown;
  /** Total for the immediately preceding period of equal length. */
  previousTotal: number;
  byModel: SignalModelRow[];
  byWeek: SignalWeekRow[];
}

/* ----------------------------- dead URLs ----------------------------- */

export interface DeadUrlRow {
  path: string;
  hits: number;
  topSource: string;
  firstSeen: string;
  lastSeen: string;
  /** Live HTTP result of probing the path right now. */
  liveStatus: number;
  verdict: "open" | "redirect-deployed" | "resolved" | "unknown";
}

export interface DeadUrlsPayload {
  propertyId: string;
  range: DateRangeKey;
  fetchedAt: string;
  rows: DeadUrlRow[];
}

/* ------------------------------ digest ------------------------------- */

export interface DigestSiteSummary {
  name: string;
  domain: string;
  users: number;
  prevUsers: number;
  signals: number;
  prevSignals: number;
  signalRate: number | null;
  topModel: string | null;
}

export interface DigestPayload {
  weekOf: string;
  generatedAt: string;
  totals: {
    users: number;
    prevUsers: number;
    sessions: number;
    signals: number;
    prevSignals: number;
  };
  sites: DigestSiteSummary[];
  demand: DemandRow[];
  healthWarnings: string[];
  deadUrls: { path: string; hits: number; verdict: string }[];
  /** Deterministic, data-grounded observations. */
  insights: string[];
}
