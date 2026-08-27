"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { DeadUrlsPanel } from "@/components/deadurls-panel";
import { DemandBoard } from "@/components/demand-board";
import { MetricTile } from "@/components/metric-tile";
import { ModelPages } from "@/components/model-pages";
import { HealthDetails, PortfolioPanel } from "@/components/portfolio-panel";
import { RankList } from "@/components/rank-list";
import { RealtimePanel } from "@/components/realtime-panel";
import { SignalsPanel } from "@/components/signals-panel";
import { SiteSwitcher } from "@/components/site-switcher";
import { TrafficChart } from "@/components/traffic-chart";
import { aliasToPropertyId, propertyIdToAlias } from "@/lib/sites";
import {
  formatDelta,
  formatDuration,
  formatNumber,
  formatPercent,
  rangeLabel,
} from "@/lib/format";
import type {
  DateRangeKey,
  DeadUrlsPayload,
  ModelPagesPayload,
  OverviewPayload,
  PortfolioPayload,
  RealtimePayload,
  SignalsPayload,
  SiteProperty,
  TrafficFilter,
} from "@/lib/types";

const ranges: DateRangeKey[] = ["7d", "28d", "90d"];

const FILTER_STORAGE_KEY = "glance_traffic_filter";

/** Sentinel "site" for the all-sites portfolio home view. */
const ALL_SITES = "all";

/** The dead-URL report is Monza-specific (legacy WordPress paths). */
const MONZA_PROPERTY_ID = "547222815";

export function Dashboard() {
  const [sites, setSites] = useState<SiteProperty[]>([]);
  const [propertyId, setPropertyId] = useState("");
  const [range, setRange] = useState<DateRangeKey>("28d");
  // Always start on "lb" so server HTML and hydration match; the persisted
  // choice is adopted in a mount effect below.
  const [filter, setFilter] = useState<TrafficFilter>("lb");
  const [overview, setOverview] = useState<OverviewPayload | null>(null);
  const [realtime, setRealtime] = useState<RealtimePayload | null>(null);
  const [signals, setSignals] = useState<SignalsPayload | null>(null);
  const [portfolio, setPortfolio] = useState<PortfolioPayload | null>(null);
  const [deadUrls, setDeadUrls] = useState<DeadUrlsPayload | null>(null);
  const [modelPages, setModelPages] = useState<ModelPagesPayload | null>(null);
  const [modelPagesError, setModelPagesError] = useState<string | null>(null);
  const [loadingModelPages, setLoadingModelPages] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [realtimeError, setRealtimeError] = useState<string | null>(null);
  const [signalsError, setSignalsError] = useState<string | null>(null);
  const [portfolioError, setPortfolioError] = useState<string | null>(null);
  const [deadUrlsError, setDeadUrlsError] = useState<string | null>(null);
  const [sitesWarning, setSitesWarning] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [loadingRealtime, setLoadingRealtime] = useState(true);
  const [loadingSignals, setLoadingSignals] = useState(true);
  const [loadingPortfolio, setLoadingPortfolio] = useState(true);
  const [loadingDeadUrls, setLoadingDeadUrls] = useState(true);
  // URL/storage params are adopted on mount; fetches wait for that to finish
  // so the first render doesn't fire requests for state about to change.
  const [ready, setReady] = useState(false);

  // A response only commits state if it is still the newest request of its
  // kind — otherwise a slow older fetch overwrites a faster newer one when
  // the site/range/filter is switched quickly.
  const overviewSeq = useRef(0);
  const signalsSeq = useRef(0);
  const realtimeSeq = useRef(0);
  const portfolioSeq = useRef(0);
  const deadUrlsSeq = useRef(0);
  const modelPagesSeq = useRef(0);

  // Adopt shareable URL state (?site=voyah&range=28d&filter=lb), falling back
  // to the per-browser stored filter. Runs once; fetch effects wait on `ready`.
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const siteParam = params.get("site");
      const rangeParam = params.get("range");
      const filterParam = params.get("filter");

      if (siteParam && siteParam !== ALL_SITES) {
        setPropertyId(aliasToPropertyId(siteParam) ?? siteParam);
      } else {
        setPropertyId(ALL_SITES);
      }
      if (rangeParam === "7d" || rangeParam === "28d" || rangeParam === "90d") {
        setRange(rangeParam);
      }
      if (filterParam === "all" || filterParam === "lb") {
        setFilter(filterParam);
      } else {
        // Storage can throw in private/blocked contexts — never let that
        // undo the URL params already adopted above.
        try {
          if (window.localStorage.getItem(FILTER_STORAGE_KEY) === "all") {
            setFilter("all");
          }
        } catch {
          // per-browser convenience only
        }
      }
    } catch {
      setPropertyId(ALL_SITES);
    }
    setReady(true);
  }, []);

  // Keep the URL in sync so any view can be bookmarked or sent to someone.
  useEffect(() => {
    if (!ready || !propertyId) return;
    try {
      const site =
        propertyId === ALL_SITES ? ALL_SITES : propertyIdToAlias(propertyId);
      window.history.replaceState(
        null,
        "",
        `?site=${encodeURIComponent(site)}&range=${range}&filter=${filter}`,
      );
    } catch {
      // URL sync is a convenience, never fatal
    }
  }, [ready, propertyId, range, filter]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/properties", { cache: "no-store" });
        const data = (await res.json()) as {
          properties?: SiteProperty[];
          warning?: string;
          error?: string;
        };
        setSites(data.properties ?? []);
        setSitesWarning(data.warning ?? data.error ?? null);
      } catch {
        setError("Could not load websites list");
      }
    })();
  }, []);

  const setFilterPersisted = useCallback((next: TrafficFilter) => {
    setFilter(next);
    try {
      window.localStorage.setItem(FILTER_STORAGE_KEY, next);
    } catch {
      // per-browser convenience only
    }
  }, []);

  const loadOverview = useCallback(
    async (
      nextRange: DateRangeKey,
      nextProperty: string,
      nextFilter: TrafficFilter,
    ) => {
      if (!nextProperty) return;
      const seq = ++overviewSeq.current;
      setLoadingOverview(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/analytics/overview?range=${nextRange}&property=${encodeURIComponent(nextProperty)}&filter=${nextFilter}`,
          { cache: "no-store" },
        );
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error || "Could not load overview");
        }
        const data = (await res.json()) as OverviewPayload;
        if (seq !== overviewSeq.current) return;
        setOverview(data);
      } catch (err) {
        if (seq !== overviewSeq.current) return;
        setOverview(null);
        setError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        if (seq === overviewSeq.current) setLoadingOverview(false);
      }
    },
    [],
  );

  const loadRealtime = useCallback(async (nextProperty: string) => {
    if (!nextProperty) return;
    const seq = ++realtimeSeq.current;
    setLoadingRealtime(true);
    try {
      const res = await fetch(
        `/api/analytics/realtime?property=${encodeURIComponent(nextProperty)}`,
        { cache: "no-store" },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `Realtime feed failed (${res.status})`);
      }
      const data = (await res.json()) as RealtimePayload;
      if (seq !== realtimeSeq.current) return;
      setRealtime(data);
      setRealtimeError(null);
    } catch (err) {
      if (seq !== realtimeSeq.current) return;
      // Never leave a broken feed looking like a quiet site — say it out loud.
      setRealtimeError(
        err instanceof Error ? err.message : "Realtime feed unavailable",
      );
    } finally {
      if (seq === realtimeSeq.current) setLoadingRealtime(false);
    }
  }, []);

  const loadSignals = useCallback(
    async (nextRange: DateRangeKey, nextProperty: string) => {
      if (!nextProperty) return;
      const seq = ++signalsSeq.current;
      setLoadingSignals(true);
      try {
        const res = await fetch(
          `/api/signals?range=${nextRange}&property=${encodeURIComponent(nextProperty)}`,
          { cache: "no-store" },
        );
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error || `Signals feed failed (${res.status})`);
        }
        const data = (await res.json()) as SignalsPayload;
        if (seq !== signalsSeq.current) return;
        setSignals(data);
        setSignalsError(null);
      } catch (err) {
        if (seq !== signalsSeq.current) return;
        setSignals(null);
        setSignalsError(
          err instanceof Error ? err.message : "Signals unavailable",
        );
      } finally {
        if (seq === signalsSeq.current) setLoadingSignals(false);
      }
    },
    [],
  );

  const loadPortfolio = useCallback(
    async (nextRange: DateRangeKey, nextFilter: TrafficFilter) => {
      const seq = ++portfolioSeq.current;
      setLoadingPortfolio(true);
      try {
        const res = await fetch(
          `/api/portfolio?range=${nextRange}&filter=${nextFilter}`,
          { cache: "no-store" },
        );
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error || `Portfolio failed (${res.status})`);
        }
        const data = (await res.json()) as PortfolioPayload;
        if (seq !== portfolioSeq.current) return;
        setPortfolio(data);
        setPortfolioError(null);
      } catch (err) {
        if (seq !== portfolioSeq.current) return;
        setPortfolio(null);
        setPortfolioError(
          err instanceof Error ? err.message : "Portfolio unavailable",
        );
      } finally {
        if (seq === portfolioSeq.current) setLoadingPortfolio(false);
      }
    },
    [],
  );

  const loadDeadUrls = useCallback(async (nextRange: DateRangeKey) => {
    const seq = ++deadUrlsSeq.current;
    setLoadingDeadUrls(true);
    try {
      const res = await fetch(`/api/deadurls?range=${nextRange}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `Dead URL report failed (${res.status})`);
      }
      const data = (await res.json()) as DeadUrlsPayload;
      if (seq !== deadUrlsSeq.current) return;
      setDeadUrls(data);
      setDeadUrlsError(null);
    } catch (err) {
      if (seq !== deadUrlsSeq.current) return;
      setDeadUrls(null);
      setDeadUrlsError(
        err instanceof Error ? err.message : "Dead URL report unavailable",
      );
    } finally {
      if (seq === deadUrlsSeq.current) setLoadingDeadUrls(false);
    }
  }, []);

  const loadModelPages = useCallback(
    async (nextRange: DateRangeKey, nextFilter: TrafficFilter) => {
      const seq = ++modelPagesSeq.current;
      setLoadingModelPages(true);
      try {
        const res = await fetch(
          `/api/models?range=${nextRange}&filter=${nextFilter}`,
          { cache: "no-store" },
        );
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error || `Model pages failed (${res.status})`);
        }
        const data = (await res.json()) as ModelPagesPayload;
        if (seq !== modelPagesSeq.current) return;
        setModelPages(data);
        setModelPagesError(null);
      } catch (err) {
        if (seq !== modelPagesSeq.current) return;
        setModelPages(null);
        setModelPagesError(
          err instanceof Error ? err.message : "Model pages unavailable",
        );
      } finally {
        if (seq === modelPagesSeq.current) setLoadingModelPages(false);
      }
    },
    [],
  );

  const isPortfolio = propertyId === ALL_SITES;

  useEffect(() => {
    if (!ready || !propertyId || propertyId === ALL_SITES) return;
    startTransition(() => {
      void loadOverview(range, propertyId, filter);
    });
  }, [ready, range, propertyId, filter, loadOverview]);

  useEffect(() => {
    if (!ready || propertyId !== MONZA_PROPERTY_ID) return;
    void loadDeadUrls(range);
  }, [ready, range, propertyId, loadDeadUrls]);

  useEffect(() => {
    if (!ready || !propertyId || propertyId === ALL_SITES) return;
    void loadSignals(range, propertyId);
  }, [ready, range, propertyId, loadSignals]);

  useEffect(() => {
    if (!ready || propertyId !== ALL_SITES) return;
    startTransition(() => {
      void loadPortfolio(range, filter);
    });
  }, [ready, propertyId, range, filter, loadPortfolio]);

  useEffect(() => {
    if (!ready || propertyId !== ALL_SITES) return;
    void loadModelPages(range, filter);
  }, [ready, propertyId, range, filter, loadModelPages]);

  useEffect(() => {
    if (!ready || !propertyId || propertyId === ALL_SITES) return;

    let cancelled = false;
    const tick = () => {
      if (!cancelled) void loadRealtime(propertyId);
    };

    // Deferred so a late response for the previous site cannot overwrite this one.
    const first = window.setTimeout(tick, 0);
    const id = window.setInterval(tick, 15000);

    return () => {
      cancelled = true;
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [ready, propertyId, loadRealtime]);

  const metrics = overview?.overview;
  const previous = overview?.previous ?? null;
  const switcherSites: SiteProperty[] = [
    { id: ALL_SITES, name: "All sites", url: "portfolio" },
    ...sites,
  ];
  const activeSite = isPortfolio
    ? { id: ALL_SITES, name: "All sites" }
    : sites.find((s) => s.id === propertyId) ||
      (overview
        ? { id: overview.propertyId, name: overview.propertyName }
        : null);

  const signalRate =
    signals && metrics && metrics.users > 0
      ? (signals.total / metrics.users) * 100
      : null;

  // Portfolio payload is only rendered when it matches the selected range +
  // filter; the home-screen headline numbers derive from it.
  const gatedPortfolio =
    portfolio && portfolio.range === range && portfolio.filter === filter
      ? portfolio
      : null;
  const pfGaOk = gatedPortfolio?.sites.filter((s) => !s.error) ?? [];
  const pfUsers = pfGaOk.reduce((a, s) => a + s.users, 0);
  const pfPrevUsers = pfGaOk.reduce((a, s) => a + s.prevUsers, 0);
  const pfSignals = gatedPortfolio
    ? gatedPortfolio.sites.reduce((a, s) => a + s.signals, 0)
    : 0;
  const pfPrevSignals = gatedPortfolio
    ? gatedPortfolio.sites.reduce((a, s) => a + s.prevSignals, 0)
    : 0;
  const pfSignalsOk = Boolean(gatedPortfolio && !gatedPortfolio.signalsError);
  const pfRate =
    pfSignalsOk && pfUsers > 0 && pfGaOk.length === gatedPortfolio?.sites.length
      ? (pfSignals / pfUsers) * 100
      : null;
  const pfTopModel = pfSignalsOk ? (gatedPortfolio?.demand[0] ?? null) : null;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 pb-8 pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-6 sm:py-8 md:px-8 md:py-10">
      <header className="animate-rise mb-6 flex flex-col gap-4 sm:mb-8 sm:gap-6 md:mb-10 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-teal-deep">
              Glance
            </p>
            <span className="shrink-0 rounded-full bg-teal/15 px-3 py-1 text-xs font-semibold tracking-wide text-teal-deep sm:hidden">
              Live GA4 + Signals
            </span>
          </div>
          <h1 className="mt-2 max-w-xl font-[family-name:var(--font-display)] text-[1.85rem] font-semibold leading-tight tracking-tight text-ink sm:text-4xl md:text-5xl">
            {activeSite?.name || "Your website, clearly."}
          </h1>
          <p className="mt-2 max-w-lg text-sm leading-relaxed text-ink-soft sm:mt-3 sm:text-base">
            Live Google Analytics plus first-party intent signals and tracking
            health. Realtime refreshes every 15s.
          </p>
        </div>

        <div className="flex w-full flex-col gap-3 sm:w-auto sm:items-end">
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-end sm:justify-end">
            <SiteSwitcher
              sites={switcherSites}
              value={propertyId}
              onChange={(id) => {
                setOverview(null);
                setRealtime(null);
                setSignals(null);
                setDeadUrls(null);
                setPropertyId(id);
              }}
            />
            <div className="hidden sm:block">
              <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-soft">
                Status
              </span>
              <span className="inline-flex min-h-11 items-center rounded-2xl bg-teal/15 px-3 py-2 text-xs font-semibold tracking-wide text-teal-deep">
                Live GA4 · no demo data
              </span>
            </div>
          </div>
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-end sm:gap-3">
            <div
              className="range-pill"
              role="group"
              aria-label="Traffic filter"
              style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}
            >
              <button
                type="button"
                onClick={() => setFilterPersisted("lb")}
                className={
                  filter === "lb" ? "bg-ink text-white" : "text-ink-soft active:bg-sand"
                }
                title="Lebanon-only traffic — removes the crawler noise"
              >
                Lebanon
              </button>
              <button
                type="button"
                onClick={() => setFilterPersisted("all")}
                className={
                  filter === "all" ? "bg-ink text-white" : "text-ink-soft active:bg-sand"
                }
                title="Raw GA4 numbers, bots included"
              >
                All traffic
              </button>
            </div>
            <div className="range-pill" role="group" aria-label="Date range">
              {ranges.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setRange(key)}
                  className={
                    range === key ? "bg-ink text-white" : "text-ink-soft active:bg-sand"
                  }
                >
                  {key}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      {error ? (
        <div className="mb-4 rounded-2xl border border-coral/30 bg-coral/10 px-4 py-3 text-sm text-coral sm:mb-6">
          {error}
        </div>
      ) : null}

      {sitesWarning ? (
        <div className="mb-4 rounded-2xl border border-[var(--line)] bg-sand/60 px-4 py-3 text-sm text-ink-soft sm:mb-6">
          {sitesWarning}
        </div>
      ) : null}

      {isPortfolio ? (
        <>
          {gatedPortfolio ? (
            <div className="mb-3 grid grid-cols-2 gap-3 sm:mb-4 sm:gap-4 lg:grid-cols-4">
              <MetricTile
                label="Total site users"
                value={
                  pfGaOk.length === gatedPortfolio.sites.length
                    ? formatNumber(pfUsers)
                    : "—"
                }
                hint={`${rangeLabel(range)} · summed across sites`}
                delta={
                  pfGaOk.length === gatedPortfolio.sites.length
                    ? formatDelta(pfUsers, pfPrevUsers)
                    : null
                }
                delayClass="animate-rise-delay-1"
              />
              <MetricTile
                label="Signals"
                value={pfSignalsOk ? formatNumber(pfSignals) : "—"}
                hint="all intent actions, all sites"
                delta={pfSignalsOk ? formatDelta(pfSignals, pfPrevSignals) : null}
                accent="coral"
                delayClass="animate-rise-delay-1"
              />
              <MetricTile
                label="Signals / 100 users"
                value={pfRate === null ? "—" : pfRate.toFixed(1)}
                hint="one visitor can send several signals"
                accent="ink"
                delayClass="animate-rise-delay-2"
              />
              <MetricTile
                label="Top model"
                value={pfTopModel ? pfTopModel.vehicle : "—"}
                hint={
                  pfTopModel
                    ? `${formatNumber(pfTopModel.total)} signals · directional`
                    : undefined
                }
                delayClass="animate-rise-delay-2"
              />
            </div>
          ) : null}

          {gatedPortfolio && gatedPortfolio.insights.length > 0 ? (
            <section className="panel animate-rise mb-3 rounded-2xl p-4 sm:mb-4 sm:rounded-3xl sm:p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-soft">
                This period
              </p>
              <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-ink">
                {gatedPortfolio.insights.map((line, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-teal" />
                    <span className="min-w-0">{line}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <PortfolioPanel
            data={gatedPortfolio}
            loading={loadingPortfolio}
            error={portfolioError}
            onOpenSite={(id) => {
              setOverview(null);
              setRealtime(null);
              setSignals(null);
              setDeadUrls(null);
              setPropertyId(id);
            }}
          />

          {gatedPortfolio && !gatedPortfolio.signalsError ? (
            <div className="mt-3 sm:mt-4">
              <DemandBoard demand={gatedPortfolio.demand} delayClass="animate-rise-delay-2" />
            </div>
          ) : null}

          <div className="mt-3 sm:mt-4">
            <ModelPages
              data={
                modelPages &&
                modelPages.range === range &&
                modelPages.filter === filter
                  ? modelPages
                  : null
              }
              loading={loadingModelPages}
              error={modelPagesError}
              delayClass="animate-rise-delay-3"
            />
          </div>

          {gatedPortfolio ? (
            <div className="mt-3 sm:mt-4">
              <HealthDetails
                sites={gatedPortfolio.sites.map((s) => ({
                  name: s.name,
                  health: s.health,
                }))}
                delayClass="animate-rise-delay-3"
              />
            </div>
          ) : null}
        </>
      ) : (
        <>
      <div className="grid gap-3 sm:gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <RealtimePanel
          data={realtime}
          loading={loadingRealtime}
          error={realtimeError}
        />
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          <MetricTile
            label="Users"
            value={metrics ? formatNumber(metrics.users) : "—"}
            hint={rangeLabel(range)}
            delta={
              metrics && previous ? formatDelta(metrics.users, previous.users) : null
            }
            delayClass="animate-rise-delay-1"
          />
          <MetricTile
            label="Sessions"
            value={metrics ? formatNumber(metrics.sessions) : "—"}
            hint={metrics ? `${formatNumber(metrics.newUsers)} new users` : undefined}
            delta={
              metrics && previous
                ? formatDelta(metrics.sessions, previous.sessions)
                : null
            }
            accent="coral"
            delayClass="animate-rise-delay-2"
          />
          <MetricTile
            label="Page views"
            value={metrics ? formatNumber(metrics.pageviews) : "—"}
            delta={
              metrics && previous
                ? formatDelta(metrics.pageviews, previous.pageviews)
                : null
            }
            delayClass="animate-rise-delay-3"
          />
          <MetricTile
            label="Engagement rate"
            value={metrics ? formatPercent(metrics.engagementRate) : "—"}
            hint={
              metrics
                ? `Avg session ${formatDuration(metrics.avgSessionDuration)} · bounce ${formatPercent(metrics.bounceRate)}`
                : undefined
            }
            delta={
              metrics && previous
                ? formatDelta(metrics.engagementRate, previous.engagementRate)
                : null
            }
            accent="ink"
            delayClass="animate-rise-delay-4"
          />
          <MetricTile
            label="Signals / 100 users"
            value={signalRate === null ? "—" : signalRate.toFixed(1)}
            hint="one visitor can send several signals"
            accent="coral"
            delayClass="animate-rise-delay-4"
          />
          <MetricTile
            label="Signals"
            value={signals ? formatNumber(signals.total) : "—"}
            hint={
              signals
                ? `${formatNumber(signals.highIntent)} high-intent (WhatsApp · phone · form)`
                : signalsError
                  ? "Signals unavailable"
                  : undefined
            }
            delta={signals ? formatDelta(signals.total, signals.previousTotal) : null}
            accent="ink"
            delayClass="animate-rise-delay-4"
          />
        </div>
      </div>

      <div className="mt-3 sm:mt-4">
        <TrafficChart data={overview?.timeseries ?? []} />
      </div>

      <div className="mt-3 sm:mt-4">
        <SignalsPanel
          data={signals}
          loading={loadingSignals}
          error={signalsError}
          users={metrics?.users}
          geoFiltered={filter === "lb"}
          delayClass="animate-rise-delay-2"
        />
      </div>

      {propertyId === MONZA_PROPERTY_ID ? (
        <div className="mt-3 sm:mt-4">
          <DeadUrlsPanel
            data={deadUrls && deadUrls.range === range ? deadUrls : null}
            loading={loadingDeadUrls}
            error={deadUrlsError}
            delayClass="animate-rise-delay-3"
          />
        </div>
      ) : null}

      <div className="mt-3 grid gap-3 sm:mt-4 sm:gap-4 lg:grid-cols-2">
        <RankList
          title="Channels"
          subtitle="Traffic grouped the way GA4 groups it — organic, social, direct"
          delayClass="animate-rise-delay-2"
          items={(overview?.channels ?? []).map((c) => ({
            label: c.channel,
            sublabel: `${formatNumber(c.sessions)} sessions`,
            value: c.users,
          }))}
        />
        <RankList
          title="Where they entered"
          subtitle="Landing pages — the first page of each session"
          delayClass="animate-rise-delay-3"
          valueLabel="sessions"
          items={(overview?.landings ?? []).map((l) => ({
            label: l.path,
            sublabel: `${formatNumber(l.users)} users`,
            value: l.sessions,
          }))}
        />
      </div>

      <div className="mt-3 grid gap-3 sm:mt-4 sm:gap-4 lg:grid-cols-2">
        <RankList
          title="Top pages"
          subtitle="What people actually open"
          delayClass="animate-rise-delay-3"
          valueLabel="views"
          items={(overview?.pages ?? []).map((p) => ({
            label: p.path,
            sublabel: `${formatNumber(p.users)} users`,
            value: p.views,
          }))}
        />
        <RankList
          title={overview?.geoKind === "city" ? "Cities" : "Countries"}
          subtitle={
            overview?.geoKind === "city"
              ? "Where in Lebanon your audience is"
              : "Where your audience is"
          }
          delayClass="animate-rise-delay-3"
          items={(overview?.geo ?? []).map((g) => ({
            label: g.name,
            value: g.users,
          }))}
        />
      </div>

      <div className="mt-3 grid gap-3 sm:mt-4 sm:gap-4 lg:grid-cols-2">
        <RankList
          title="Devices"
          subtitle="Desktop, mobile, tablet split"
          delayClass="animate-rise-delay-4"
          items={(overview?.devices ?? []).map((d) => ({
            label: d.device,
            value: d.users,
          }))}
        />
        <section className="panel animate-rise animate-rise-delay-4 rounded-2xl p-4 sm:rounded-3xl sm:p-5 md:p-6">
          <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold tracking-tight text-ink sm:text-xl">
            About this data
          </h2>
          <ul className="mt-3 space-y-2 text-sm leading-relaxed text-ink-soft">
            <li>
              <span className="font-medium text-ink">Lebanon filter</span> — the default
              view hides non-Lebanon traffic because monzasal.com carries heavy crawler
              noise (Singapore ≈ half its raw users). Switch to &ldquo;All
              traffic&rdquo; for unfiltered GA4 numbers.
            </li>
            <li>
              <span className="font-medium text-ink">Signals</span> — intent actions
              recorded first-party by the sites: WhatsApp, phone and form
              (high-intent) plus model click-outs and Instagram (broader demand).
              They never pass through GA4 and are not geo-filtered.
            </li>
            <li>
              <span className="font-medium text-ink">Deltas</span> — every ▲▼ compares
              against the period of the same length immediately before the selected
              range. The current window includes today so far, so deltas read a
              little low early in the day.
            </li>
          </ul>
        </section>
      </div>
        </>
      )}

      <footer className="mt-8 flex flex-col gap-2 text-xs leading-relaxed text-ink-soft sm:mt-10 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3">
        <p>
          {isPortfolio
            ? loadingPortfolio || isPending
              ? "Refreshing live data…"
              : portfolio?.fetchedAt
                ? `Updated ${new Date(portfolio.fetchedAt).toLocaleString()} · ${
                    filter === "lb" ? "Lebanon traffic" : "all traffic"
                  }`
                : "Ready"
            : loadingOverview || isPending
              ? "Refreshing live data…"
              : overview?.fetchedAt
                ? `Updated ${new Date(overview.fetchedAt).toLocaleString()} · ${
                    filter === "lb" ? "Lebanon traffic" : "all traffic"
                  }`
                : "Ready"}
        </p>
        <p className="sm:text-right">
          {isPortfolio
            ? "All sites · portfolio view"
            : activeSite
              ? `${activeSite.name} · property ${activeSite.id}`
              : "Select a website"}
        </p>
      </footer>
    </div>
  );
}
