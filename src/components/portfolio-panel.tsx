"use client";

import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { formatDelta, formatNumber } from "@/lib/format";
import type { PortfolioPayload, PortfolioSite } from "@/lib/types";

interface PortfolioPanelProps {
  data: PortfolioPayload | null;
  loading: boolean;
  error?: string | null;
  onOpenSite: (propertyId: string) => void;
}

function DeltaChip({ current, previous }: { current: number; previous: number }) {
  const delta = formatDelta(current, previous);
  if (!delta) return null;
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${
        delta.startsWith("▼")
          ? "bg-coral/15 text-coral"
          : delta.startsWith("▲")
            ? "bg-teal/15 text-teal-deep"
            : "bg-sand/70 text-ink-soft"
      }`}
      title="vs previous period"
    >
      {delta}
    </span>
  );
}

function healthOf(
  site: PortfolioSite,
  signalsUnavailable: boolean,
): { className: string; label: string } {
  if (site.error) return { className: "bg-coral", label: "GA query failed" };
  if (site.users === 0)
    return { className: "bg-coral", label: "No traffic recorded" };
  if (signalsUnavailable)
    return {
      className: "bg-[#9aacb8]",
      label: "Signal source unavailable — no verdict on tracking",
    };
  if (site.signals === 0)
    return {
      className: "bg-[#d9a441]",
      label: "Traffic but zero signals — check lead-capture tracking",
    };
  return { className: "bg-teal", label: "Traffic and signals flowing" };
}

function SiteCard({
  site,
  index,
  signalsUnavailable,
  onOpen,
}: {
  site: PortfolioSite;
  index: number;
  signalsUnavailable: boolean;
  onOpen: () => void;
}) {
  const health = healthOf(site, signalsUnavailable);
  const spark = site.spark.map((users, i) => ({ i, users }));

  return (
    <section
      className={`panel animate-rise flex flex-col rounded-2xl p-4 sm:rounded-3xl sm:p-5 animate-rise-delay-${Math.min(index + 1, 4)}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate font-[family-name:var(--font-display)] text-lg font-semibold tracking-tight text-ink">
            {site.name}
          </h2>
          <p className="truncate text-xs text-ink-soft">{site.domain}</p>
        </div>
        <span
          className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${health.className}`}
          title={health.label}
          aria-label={health.label}
        />
      </div>

      {site.error ? (
        <>
          <p className="mt-3 rounded-xl border border-coral/30 bg-coral/10 px-3 py-2 text-xs leading-snug text-coral">
            {site.error}
          </p>
          <div className="mt-3 border-t border-[var(--line)] pt-3">
            <p className="font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight text-ink">
              {signalsUnavailable ? "—" : formatNumber(site.signals)}
            </p>
            <p className="mt-0.5 text-[11px] text-ink-soft">
              {signalsUnavailable
                ? "signals unavailable"
                : `signals · ${formatNumber(site.whatsapp)} WA · ${formatNumber(site.instagram)} IG`}
            </p>
          </div>
        </>
      ) : (
        <>
          <div className="mt-3 flex items-end justify-between gap-2">
            <div>
              <p className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight text-ink">
                {formatNumber(site.users)}
              </p>
              <p className="mt-0.5 text-xs text-ink-soft">
                users · {formatNumber(site.sessions)} sessions
              </p>
            </div>
            <DeltaChip current={site.users} previous={site.prevUsers} />
          </div>

          <div className="mt-2 h-12">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={spark}
                margin={{ top: 2, right: 0, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient
                    id={`spark-${site.propertyId}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="0%" stopColor="#0e8f7c" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#0e8f7c" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="users"
                  stroke="#0e8f7c"
                  strokeWidth={1.75}
                  fill={`url(#spark-${site.propertyId})`}
                  animationDuration={700}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-3 flex items-end justify-between gap-2 border-t border-[var(--line)] pt-3">
            <div>
              <p className="font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight text-teal-deep">
                {signalsUnavailable || site.signalRate === null
                  ? "—"
                  : `${site.signalRate.toFixed(1)}%`}
              </p>
              <p className="mt-0.5 text-[11px] text-ink-soft">
                {signalsUnavailable
                  ? "signal source unavailable"
                  : `signal rate · ${formatNumber(site.whatsapp)} WA · ${formatNumber(site.instagram)} IG`}
              </p>
            </div>
            {signalsUnavailable ? null : (
              <DeltaChip current={site.signals} previous={site.prevSignals} />
            )}
          </div>
        </>
      )}

      <button
        type="button"
        onClick={onOpen}
        className="mt-4 min-h-11 w-full rounded-xl border border-[var(--line)] bg-white/70 px-3 py-2 text-sm font-semibold text-ink transition hover:border-teal hover:text-teal-deep"
      >
        Open {site.name} →
      </button>
    </section>
  );
}

export function PortfolioPanel({
  data,
  loading,
  error,
  onOpenSite,
}: PortfolioPanelProps) {
  if (error) {
    return (
      <div className="rounded-2xl border border-coral/30 bg-coral/10 px-4 py-3 text-sm text-coral">
        {error}
      </div>
    );
  }

  if (loading && !data) {
    return (
      <div className="grid gap-3 sm:gap-4 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="panel h-64 animate-pulse rounded-2xl sm:rounded-3xl"
          />
        ))}
      </div>
    );
  }

  if (!data) return null;

  return (
    <div>
      <div className="grid gap-3 sm:gap-4 lg:grid-cols-3">
        {data.sites.map((site, index) => (
          <SiteCard
            key={site.propertyId}
            site={site}
            index={index}
            signalsUnavailable={Boolean(data.signalsError)}
            onOpen={() => onOpenSite(site.propertyId)}
          />
        ))}
      </div>
      {data.signalsError ? (
        <p className="mt-3 rounded-2xl border border-coral/30 bg-coral/10 px-4 py-3 text-sm text-coral">
          Signal counts unavailable: {data.signalsError}
        </p>
      ) : null}
    </div>
  );
}
