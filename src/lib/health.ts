import { dateRangesFor, geoFilterFor, getClient, metricNumber, propertyPath } from "./ga";
import { fetchSignalOverview, supabaseRpc } from "./signals";
import { KNOWN_SITES, PORTFOLIO_ORDER } from "./sites";
import type {
  HealthCheck,
  HealthHistoryRun,
  HealthPayload,
  HealthStatus,
  SiteHealth,
} from "./types";

const SIGNALS_TOKEN = process.env.GLANCE_SIGNALS_TOKEN || null;

/**
 * Real instrumentation health: deterministic marker checks against live
 * pages (not just homepages) plus data-freshness rules. This is what the
 * portfolio health indicators are wired to — a page-level regression like
 * the historical "model pages produce zero signals" gap shows up here the
 * day it happens, not months later.
 */
interface PageSpec {
  path: string;
  /** Marker → human name. All markers are plain substring checks. */
  markers: Record<string, string | RegExp>;
}

interface SiteSpec {
  domain: string;
  base: string;
  pages: PageSpec[];
  /** A path that must return 404 — proves errors are distinguishable. */
  notFoundProbe: string;
  /** Marker expected in the shared capture script, fetched separately. */
  captureScript?: { url: string; markers: Record<string, string | RegExp> };
}

const MONZA_MARKERS: Record<string, string | RegExp> = {
  "capture script tag": /script\.js\?v=\d+/,
};

const SITE_SPECS: SiteSpec[] = [
  {
    domain: "voyahlebanon.com",
    base: "https://www.voyahlebanon.com",
    pages: [
      { path: "/", markers: { "GA4 tag": /googletagmanager|G-[A-Z0-9]{8,}/, "capture script": "lead-capture.js" } },
      { path: "/models/free", markers: { "GA4 tag": /googletagmanager|G-[A-Z0-9]{8,}/, "capture script": "lead-capture.js", "WhatsApp CTA": "wa.me" } },
      { path: "/models/courage", markers: { "GA4 tag": /googletagmanager|G-[A-Z0-9]{8,}/, "capture script": "lead-capture.js", "WhatsApp CTA": "wa.me" } },
      { path: "/models/dream", markers: { "GA4 tag": /googletagmanager|G-[A-Z0-9]{8,}/, "capture script": "lead-capture.js", "WhatsApp CTA": "wa.me" } },
    ],
    notFoundProbe: "/glance-health-404-probe",
    captureScript: {
      url: "https://www.voyahlebanon.com/lead-capture.js",
      markers: { "WhatsApp binding": "wa.me", "events endpoint": "website_events" },
    },
  },
  {
    domain: "mherolebanon.com",
    base: "https://www.mherolebanon.com",
    pages: [
      { path: "/", markers: { "GA4 tag": "G-RQEH74LQZL", "capture script": "lead-capture.js", "Meta Pixel (consent-gated)": "__mheroInitPixel" } },
      { path: "/mhero-1", markers: { "GA4 tag": "G-RQEH74LQZL", "capture script": "lead-capture.js", "WhatsApp CTA": "wa.me" } },
      { path: "/mhero-2", markers: { "GA4 tag": "G-RQEH74LQZL", "capture script": "lead-capture.js", "WhatsApp CTA": "wa.me" } },
      { path: "/appointment", markers: { "GA4 tag": "G-RQEH74LQZL", "capture script": "lead-capture.js" } },
    ],
    notFoundProbe: "/glance-health-404-probe",
    captureScript: {
      url: "https://www.mherolebanon.com/lead-capture.js",
      markers: { "WhatsApp binding": "wa.me", "events endpoint": "website_events" },
    },
  },
  {
    domain: "monzasal.com",
    base: "https://www.monzasal.com",
    pages: [
      { path: "/", markers: MONZA_MARKERS },
      { path: "/voyah.html", markers: { ...MONZA_MARKERS, "model cards": "model-card", "WhatsApp CTA": "wa.me" } },
      { path: "/mhero.html", markers: { ...MONZA_MARKERS, "model cards": "model-card", "WhatsApp CTA": "wa.me" } },
      { path: "/armored.html", markers: { ...MONZA_MARKERS, "WhatsApp CTA": "wa.me" } },
      { path: "/visit.html", markers: { ...MONZA_MARKERS, "booking form": "leadForm" } },
    ],
    notFoundProbe: "/glance-health-404-probe",
    captureScript: {
      url: "https://www.monzasal.com/script.js",
      markers: {
        "GA4 config": /G-[A-Z0-9]{8,}/,
        "events endpoint": "website_events",
        "delegated WhatsApp capture": "whatsapp_click",
        "phone capture": "phone_click",
        "model outbound capture": "outbound_model_click",
      },
    },
  },
];

async function fetchOnce(url: string): Promise<{ status: number; text: string }> {
  try {
    const res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(9000),
      headers: { "User-Agent": "GlanceHealth/1.0 (+monzasal.com)" },
      redirect: "follow",
    });
    const text = await res.text().catch(() => "");
    return { status: res.status, text };
  } catch {
    return { status: 0, text: "" };
  }
}

/** One retry on pure network failure — a single blip must not record a
 * critical day in health history. */
async function fetchText(url: string): Promise<{ status: number; text: string }> {
  const first = await fetchOnce(url);
  if (first.status !== 0) return first;
  await new Promise((r) => setTimeout(r, 800));
  return fetchOnce(url);
}

function matches(haystack: string, marker: string | RegExp): boolean {
  return typeof marker === "string"
    ? haystack.includes(marker)
    : marker.test(haystack);
}

function statusOf(checks: HealthCheck[]): HealthStatus {
  if (checks.length === 0) return "unknown";
  const hardFails = checks.filter((c) => !c.ok && !c.soft);
  const softFails = checks.filter((c) => !c.ok && c.soft);
  if (hardFails.length > 0) return "critical";
  if (softFails.length > 0) return "warning";
  return "healthy";
}

async function checkSite(
  spec: SiteSpec,
  freshness: HealthCheck[],
): Promise<SiteHealth> {
  const checks: HealthCheck[] = [];

  const pageResults = await Promise.all(
    spec.pages.map(async (page) => {
      const { status, text } = await fetchText(spec.base + page.path);
      const pageChecks: HealthCheck[] = [];
      if (status !== 200) {
        pageChecks.push({
          name: `${page.path} loads`,
          ok: false,
          detail:
            status === 0
              ? `${page.path}: request failed (network/timeout)`
              : `${page.path}: HTTP ${status}`,
        });
        return pageChecks;
      }
      pageChecks.push({ name: `${page.path} loads`, ok: true, detail: "HTTP 200" });
      for (const [name, marker] of Object.entries(page.markers)) {
        pageChecks.push({
          name: `${page.path} · ${name}`,
          ok: matches(text, marker),
          detail: matches(text, marker) ? "present" : "MISSING",
        });
      }
      return pageChecks;
    }),
  );
  for (const pc of pageResults) checks.push(...pc);

  if (spec.captureScript) {
    const { status, text } = await fetchText(spec.captureScript.url);
    if (status !== 200) {
      checks.push({
        name: "capture script fetch",
        ok: false,
        detail: `HTTP ${status} for ${spec.captureScript.url}`,
      });
    } else {
      for (const [name, marker] of Object.entries(spec.captureScript.markers)) {
        const ok = matches(text, marker);
        checks.push({
          name: `capture script · ${name}`,
          ok,
          // Monza's expanded capture (phone/outbound) ships with v29 — its
          // absence on the live v27/v28 is a known deployment gap, not an
          // outage, so those markers only warn.
          soft:
            !ok &&
            ["phone capture", "model outbound capture", "delegated WhatsApp capture"].includes(name),
          detail: ok ? "present" : "MISSING",
        });
      }
    }
  }

  const probe = await fetchText(spec.base + spec.notFoundProbe);
  const probeOk = probe.status === 404;
  checks.push({
    name: "unknown URL returns 404",
    ok: probeOk,
    soft: !probeOk,
    detail: probeOk
      ? "404 as expected"
      : `bogus path returned HTTP ${probe.status} — errors indistinguishable from content`,
  });

  checks.push(...freshness);

  const status = statusOf(checks);
  const failing = checks.filter((c) => !c.ok);
  return {
    site: spec.domain,
    status,
    summary:
      failing.length === 0
        ? "All monitored pages and data flows look right."
        : failing
            .slice(0, 3)
            .map((c) => `${c.name}: ${c.detail}`)
            .join(" · ") + (failing.length > 3 ? ` · +${failing.length - 3} more` : ""),
    checks,
    checkedAt: new Date().toISOString(),
  };
}

/**
 * Data-flow freshness per site: GA traffic vs signal recency, judged against
 * each site's own recent baseline so a quiet day on a low-volume site does
 * not page anyone.
 */
async function freshnessChecks(): Promise<Map<string, HealthCheck[]>> {
  const out = new Map<string, HealthCheck[]>();
  let signalsWeek: Map<string, { total: number }> | null = null;
  let signalsBaseline: Map<string, { total: number }> | null = null;
  try {
    const week = await fetchSignalOverview("7d");
    signalsWeek = new Map(
      [...week.totalsBySite.entries()].map(([k, v]) => [k, { total: v.total }]),
    );
    const month = await fetchSignalOverview("28d");
    signalsBaseline = new Map(
      [...month.totalsBySite.entries()].map(([k, v]) => [k, { total: v.total }]),
    );
  } catch (error) {
    for (const propertyId of PORTFOLIO_ORDER) {
      const site = KNOWN_SITES[propertyId];
      out.set(site.domain, [
        {
          name: "signals source reachable",
          ok: false,
          // A monitoring-datasource blip is evidence about Supabase, not the
          // site — warning, never critical.
          soft: true,
          detail:
            error instanceof Error ? error.message : "signals query failed",
        },
      ]);
    }
    return out;
  }

  let gaUsers7d: Map<string, number> | null = null;
  try {
    const client = getClient();
    const { current } = dateRangesFor("7d");
    const results = await Promise.all(
      PORTFOLIO_ORDER.map(async (propertyId) => {
        const res = await client.runReport({
          property: propertyPath(propertyId),
          dateRanges: [current],
          metrics: [{ name: "totalUsers" }],
          // Real traffic only — monzasal.com's raw numbers are ~half crawler
          // noise, which never produces signals and would trip false alarms.
          ...geoFilterFor("lb"),
        });
        return [propertyId, metricNumber(res[0].rows?.[0], 0)] as const;
      }),
    );
    gaUsers7d = new Map(results);
  } catch {
    gaUsers7d = null;
  }

  for (const propertyId of PORTFOLIO_ORDER) {
    const site = KNOWN_SITES[propertyId];
    const checks: HealthCheck[] = [];
    const week = signalsWeek?.get(site.domain)?.total ?? 0;
    const baseline = signalsBaseline?.get(site.domain)?.total ?? 0;
    const users = gaUsers7d?.get(propertyId);

    checks.push({
      name: "signals source reachable",
      ok: true,
      detail: `${week} signals in the last 7 days`,
    });

    if (users === undefined) {
      checks.push({
        name: "GA data flowing",
        ok: false,
        soft: true,
        detail: "GA query unavailable — cannot judge traffic freshness",
      });
    } else {
      checks.push({
        name: "GA data flowing",
        ok: users > 0,
        soft: users === 0,
        detail: users > 0 ? `${users} users in the last 7 days` : "zero users reported for 7 days",
      });
      // Traffic without signals is only alarming when the site normally
      // produces signals (baseline) and has meaningful current traffic.
      if (users >= 25 && week === 0 && baseline >= 5) {
        checks.push({
          name: "traffic produces signals",
          ok: false,
          detail: `${users} users this week but zero signals (baseline ${baseline}/28d) — capture may be broken`,
        });
      } else {
        checks.push({
          name: "traffic produces signals",
          ok: true,
          detail:
            week > 0
              ? `${week} signals this week`
              : "low volume — no signal expectation",
        });
      }
    }
    out.set(site.domain, checks);
  }
  return out;
}

export async function runHealthChecks(): Promise<HealthPayload> {
  const freshness = await freshnessChecks();
  const sites = await Promise.all(
    SITE_SPECS.map((spec) => checkSite(spec, freshness.get(spec.domain) ?? [])),
  );

  let recorded = false;
  let recordError: string | undefined;
  if (SIGNALS_TOKEN) {
    try {
      await supabaseRpc<number>("glance_record_health", {
        p_token: SIGNALS_TOKEN,
        p_runs: sites.map((s) => ({
          site: s.site,
          status: s.status,
          summary: s.summary,
          checks: s.checks,
        })),
      });
      recorded = true;
    } catch (error) {
      recordError =
        error instanceof Error ? error.message : "failed to record health run";
    }
  } else {
    recordError = "GLANCE_SIGNALS_TOKEN not set — history not recorded";
  }

  return {
    fetchedAt: new Date().toISOString(),
    sites,
    recorded,
    recordError,
  };
}

export async function fetchHealthHistory(
  days: number,
): Promise<HealthHistoryRun[]> {
  if (!SIGNALS_TOKEN) return [];
  const rows = await supabaseRpc<
    Array<{ id: string; created_at: string; site: string; status: string; summary: string | null }>
  >("glance_health_history", { p_token: SIGNALS_TOKEN, p_days: days });
  return rows.map((r) => ({
    id: r.id,
    createdAt: r.created_at,
    site: r.site,
    status: (["healthy", "warning", "critical", "unknown"].includes(r.status)
      ? r.status
      : "unknown") as HealthHistoryRun["status"],
    summary: r.summary,
  }));
}
