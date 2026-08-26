"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { MetricTile } from "@/components/metric-tile";
import { RankList } from "@/components/rank-list";
import { RealtimePanel } from "@/components/realtime-panel";
import { SiteSwitcher } from "@/components/site-switcher";
import { TrafficChart } from "@/components/traffic-chart";
import {
  formatDuration,
  formatNumber,
  formatPercent,
  rangeLabel,
} from "@/lib/format";
import type {
  DateRangeKey,
  OverviewPayload,
  RealtimePayload,
  SiteProperty,
} from "@/lib/types";

const ranges: DateRangeKey[] = ["7d", "28d", "90d"];

export function Dashboard() {
  const [sites, setSites] = useState<SiteProperty[]>([]);
  const [propertyId, setPropertyId] = useState("");
  const [range, setRange] = useState<DateRangeKey>("28d");
  const [overview, setOverview] = useState<OverviewPayload | null>(null);
  const [realtime, setRealtime] = useState<RealtimePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [realtimeError, setRealtimeError] = useState<string | null>(null);
  const [sitesWarning, setSitesWarning] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [loadingRealtime, setLoadingRealtime] = useState(true);

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

  const loadOverview = useCallback(async (nextRange: DateRangeKey, nextProperty: string) => {
    if (!nextProperty) return;
    setLoadingOverview(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/analytics/overview?range=${nextRange}&property=${encodeURIComponent(nextProperty)}`,
        { cache: "no-store" },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || "Could not load overview");
      }
      const data = (await res.json()) as OverviewPayload;
      setOverview(data);
    } catch (err) {
      setOverview(null);
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoadingOverview(false);
    }
  }, []);

  const loadRealtime = useCallback(async (nextProperty: string) => {
    if (!nextProperty) return;
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
      setRealtime(data);
      setRealtimeError(null);
    } catch (err) {
      // Never leave a broken feed looking like a quiet site — say it out loud.
      setRealtimeError(
        err instanceof Error ? err.message : "Realtime feed unavailable",
      );
    } finally {
      setLoadingRealtime(false);
    }
  }, []);

  useEffect(() => {
    if (!propertyId) return;
    startTransition(() => {
      void loadOverview(range, propertyId);
    });
  }, [range, propertyId, loadOverview]);

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
  const activeSite =
    sites.find((s) => s.id === propertyId) ||
    (overview
      ? { id: overview.propertyId, name: overview.propertyName }
      : null);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 pb-8 pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-6 sm:py-8 md:px-8 md:py-10">
      <header className="animate-rise mb-6 flex flex-col gap-4 sm:mb-8 sm:gap-6 md:mb-10 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-teal-deep">
              Glance
            </p>
            <span className="shrink-0 rounded-full bg-teal/15 px-3 py-1 text-xs font-semibold tracking-wide text-teal-deep sm:hidden">
              Live GA4
            </span>
          </div>
          <h1 className="mt-2 max-w-xl font-[family-name:var(--font-display)] text-[1.85rem] font-semibold leading-tight tracking-tight text-ink sm:text-4xl md:text-5xl">
            {activeSite?.name || "Your website, clearly."}
          </h1>
          <p className="mt-2 max-w-lg text-sm leading-relaxed text-ink-soft sm:mt-3 sm:text-base">
            Live Google Analytics — switch websites, see who visits, where they enter, and
            what they open. Realtime refreshes every 15s.
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
            delayClass="animate-rise-delay-1"
          />
          <MetricTile
            label="Sessions"
            value={metrics ? formatNumber(metrics.sessions) : "—"}
            hint={metrics ? `${formatNumber(metrics.newUsers)} new users` : undefined}
            accent="coral"
            delayClass="animate-rise-delay-2"
          />
          <MetricTile
            label="Page views"
            value={metrics ? formatNumber(metrics.pageviews) : "—"}
            delayClass="animate-rise-delay-3"
          />
          <MetricTile
            label="Bounce rate"
            value={metrics ? formatPercent(metrics.bounceRate) : "—"}
            hint={
              metrics
                ? `Avg session ${formatDuration(metrics.avgSessionDuration)}`
                : undefined
            }
            accent="ink"
            delayClass="animate-rise-delay-4"
          />
        </div>
      </div>

      <div className="mt-3 sm:mt-4">
        <TrafficChart data={overview?.timeseries ?? []} />
      </div>

      <div className="mt-3 grid gap-3 sm:mt-4 sm:gap-4 lg:grid-cols-2">
        <RankList
          title="Where they entered"
          subtitle="Traffic sources that bring people in"
          delayClass="animate-rise-delay-2"
          items={(overview?.sources ?? []).map((s) => ({
            label: s.source,
            sublabel: s.medium,
            value: s.users,
          }))}
        />
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
      </div>

      <div className="mt-3 grid gap-3 sm:mt-4 sm:gap-4 lg:grid-cols-2">
        <RankList
          title="Countries"
          subtitle="Where your audience is"
          delayClass="animate-rise-delay-3"
          items={(overview?.countries ?? []).map((c) => ({
            label: c.country,
            value: c.users,
          }))}
        />
        <RankList
          title="Devices"
          subtitle="Desktop, mobile, tablet split"
          delayClass="animate-rise-delay-4"
          items={(overview?.devices ?? []).map((d) => ({
            label: d.device,
            value: d.users,
          }))}
        />
      </div>

      <footer className="mt-8 flex flex-col gap-2 text-xs leading-relaxed text-ink-soft sm:mt-10 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3">
        <p>
          {loadingOverview || isPending
            ? "Refreshing live data…"
            : overview?.fetchedAt
              ? `Updated ${new Date(overview.fetchedAt).toLocaleString()}`
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
