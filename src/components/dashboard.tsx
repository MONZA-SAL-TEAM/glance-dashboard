"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { MetricTile } from "@/components/metric-tile";
import { RankList } from "@/components/rank-list";
import { RealtimePanel } from "@/components/realtime-panel";
import { SignalsPanel } from "@/components/signals-panel";
import { SiteSwitcher } from "@/components/site-switcher";
import { TrafficChart } from "@/components/traffic-chart";
import {
  formatDelta,
  formatDuration,
  formatNumber,
  formatPercent,
  rangeLabel,
} from "@/lib/format";
import type {
  DateRangeKey,
  OverviewPayload,
  RealtimePayload,
  SignalsPayload,
  SiteProperty,
  TrafficFilter,
} from "@/lib/types";

const ranges: DateRangeKey[] = ["7d", "28d", "90d"];

const FILTER_STORAGE_KEY = "glance_traffic_filter";

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
  const [error, setError] = useState<string | null>(null);
  const [realtimeError, setRealtimeError] = useState<string | null>(null);
  const [signalsError, setSignalsError] = useState<string | null>(null);
  const [sitesWarning, setSitesWarning] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [loadingRealtime, setLoadingRealtime] = useState(true);
  const [loadingSignals, setLoadingSignals] = useState(true);

  // A response only commits state if it is still the newest request of its
  // kind — otherwise a slow older fetch overwrites a faster newer one when
  // the site/range/filter is switched quickly.
  const overviewSeq = useRef(0);
  const signalsSeq = useRef(0);
  const realtimeSeq = useRef(0);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(FILTER_STORAGE_KEY) === "all") {
        setFilter("all");
      }
    } catch {
      // per-browser convenience only
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/properties", { cache: "no-store" });
        const data = (await res.json()) as {
          properties?: SiteProperty[];
          warning?: string;
          error?: string;
        };
        const list = data.properties ?? [];
        setSites(list);
        setSitesWarning(data.warning ?? data.error ?? null);
        setPropertyId((current) => current || list[0]?.id || "");
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

  useEffect(() => {
    if (!propertyId) return;
    startTransition(() => {
      void loadOverview(range, propertyId, filter);
    });
  }, [range, propertyId, filter, loadOverview]);

  useEffect(() => {
    if (!propertyId) return;
    void loadSignals(range, propertyId);
  }, [range, propertyId, loadSignals]);

  useEffect(() => {
    if (!propertyId) return;

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
  }, [propertyId, loadRealtime]);

  const metrics = overview?.overview;
  const previous = overview?.previous ?? null;
  const activeSite =
    sites.find((s) => s.id === propertyId) ||
    (overview
      ? { id: overview.propertyId, name: overview.propertyName }
      : null);

  const signalRate =
    signals && metrics && metrics.users > 0
      ? (signals.total / metrics.users) * 100
      : null;

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
            Live Google Analytics plus first-party WhatsApp &amp; Instagram signals.
            Realtime refreshes every 15s.
          </p>
        </div>

        <div className="flex w-full flex-col gap-3 sm:w-auto sm:items-end">
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-end sm:justify-end">
            <SiteSwitcher
              sites={sites}
              value={propertyId}
              onChange={(id) => {
                setOverview(null);
                setRealtime(null);
                setSignals(null);
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
            label="Signal rate"
            value={signalRate === null ? "—" : `${signalRate.toFixed(1)}%`}
            hint="WhatsApp + Instagram clicks ÷ users"
            accent="coral"
            delayClass="animate-rise-delay-4"
          />
          <MetricTile
            label="Signals"
            value={signals ? formatNumber(signals.total) : "—"}
            hint={
              signals
                ? `${formatNumber(signals.whatsapp)} WhatsApp · ${formatNumber(signals.instagram)} Instagram`
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
              <span className="font-medium text-ink">Signals</span> — WhatsApp and
              Instagram clicks recorded by the sites themselves into the Monza
              database. They never pass through GA4 and are not geo-filtered.
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

      <footer className="mt-8 flex flex-col gap-2 text-xs leading-relaxed text-ink-soft sm:mt-10 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3">
        <p>
          {loadingOverview || isPending
            ? "Refreshing live data…"
            : overview?.fetchedAt
              ? `Updated ${new Date(overview.fetchedAt).toLocaleString()} · ${
                  filter === "lb" ? "Lebanon traffic" : "all traffic"
                }`
              : "Ready"}
        </p>
        <p className="sm:text-right">
          {activeSite
            ? `${activeSite.name} · property ${activeSite.id}`
            : "Select a website"}
        </p>
      </footer>
    </div>
  );
}
