"use client";

import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { formatDelta, formatNumber } from "@/lib/format";
import type {
  HealthStatus,
  PortfolioPayload,
  PortfolioSite,
  SiteHealth,
} from "@/lib/types";

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

const STATUS_DOT: Record<HealthStatus, string> = {
  healthy: "bg-teal",
  warning: "bg-[#d9a441]",
  critical: "bg-coral",
  unknown: "bg-[#9aacb8]",
};

const STATUS_LABEL: Record<HealthStatus, string> = {
  healthy: "Healthy",
  warning: "Warning",
  critical: "Critical",
  unknown: "Unknown",
};

/**
 * Full per-check breakdown, one level below the home screen. The cards carry
 * only the status dot; anyone chasing a warning opens this.
 */
export function HealthDetails({
  sites,
  delayClass = "",
}: {
  sites: Array<{ name: string; health: SiteHealth | null }>;
  delayClass?: string;
}) {
  const withHealth = sites.filter((s) => s.health);
  if (withHealth.length === 0) return null;
  const troubled = withHealth.filter(
    (s) => s.health!.status === "warning" || s.health!.status === "critical",
  );
  return (
    <details
      className={`panel animate-rise rounded-2xl p-4 sm:rounded-3xl sm:p-5 ${delayClass}`}
    >
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 text-sm font-semibold text-ink">
        Tracking health
        {troubled.length === 0 ? (
          <span className="chip ok rounded-full bg-teal/15 px-2.5 py-0.5 text-xs font-semibold text-teal-deep">
            all clear
          </span>
        ) : (
          troubled.map((s) => (
            <span
              key={s.name}
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                s.health!.status === "critical"
                  ? "bg-coral/15 text-coral"
                  : "bg-[#d9a441]/20 text-[#8a5a12]"
              }`}
            >
              {s.name}: {STATUS_LABEL[s.health!.status]}
            </span>
          ))
        )}
        <span className="ml-auto text-xs font-normal text-ink-soft">details ▾</span>
      </summary>
      <div className="mt-4 grid gap-5 sm:grid-cols-3">
        {withHealth.map((s) => {
          const failing = s.health!.checks.filter((c) => !c.ok);
          return (
            <div key={s.name} className="min-w-0">
              <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-ink">
                <span className={`h-2 w-2 rounded-full ${STATUS_DOT[s.health!.status]}`} />
                {s.name}
                <span className="font-normal text-ink-soft">
                  {s.health!.checks.length - failing.length}/{s.health!.checks.length} pass
                </span>
              </p>
              <ul className="max-h-48 space-y-1 overflow-y-auto pr-1 text-[11px] leading-snug text-ink-soft">
                {(failing.length > 0 ? failing : s.health!.checks.slice(0, 5)).map((c, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <span
                      className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${c.ok ? "bg-teal" : c.soft ? "bg-[#d9a441]" : "bg-coral"}`}
                    />
                    <span className="min-w-0">
                      <span className="text-ink">{c.name}</span> — {c.detail}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </details>
  );
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
          className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${site.health ? STATUS_DOT[site.health.status] : "bg-[#9aacb8]"}`}
          title={site.health ? site.health.summary : "Tracking health: checking…"}
          aria-label={
            site.health
              ? `Tracking ${STATUS_LABEL[site.health.status]}`
              : "Tracking health checking"
          }
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
                : `signals · ${formatNumber(site.highIntent)} high-intent`}
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
                  : `signal rate · ${formatNumber(site.highIntent)} high-intent of ${formatNumber(site.signals)}`}
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
