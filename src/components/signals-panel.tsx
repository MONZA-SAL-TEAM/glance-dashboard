import { formatDelta, formatNumber } from "@/lib/format";
import type { SignalsPayload } from "@/lib/types";

interface SignalsPanelProps {
  data: SignalsPayload | null;
  loading: boolean;
  error?: string | null;
  /** Users in the same range, for the signal rate. */
  users?: number;
  /** True when the traffic filter is Lebanon-only (signals are not geo-filtered). */
  geoFiltered?: boolean;
  delayClass?: string;
}

function MiniBars({
  items,
  color,
}: {
  items: Array<{ label: string; value: number; detail?: string }>;
  color: "teal" | "coral";
}) {
  const max = Math.max(...items.map((i) => i.value), 1);
  const fill =
    color === "teal"
      ? "from-teal to-teal-deep"
      : "from-coral to-[#c2431f]";

  return (
    <ul className="space-y-2.5">
      {items.length === 0 ? (
        <li className="text-sm text-ink-soft">Nothing in this range yet.</li>
      ) : (
        items.map((item, index) => (
          <li key={`${item.label}-${index}`} className="min-w-0">
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <p className="min-w-0 flex-1 truncate text-sm text-ink">{item.label}</p>
              <p className="shrink-0 text-sm tabular-nums text-ink">
                {formatNumber(item.value)}
                {item.detail ? (
                  <span className="ml-1 text-xs text-ink-soft">{item.detail}</span>
                ) : null}
              </p>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-sand">
              <div
                className={`bar-fill h-full rounded-full bg-gradient-to-r ${fill}`}
                style={{
                  width: `${(item.value / max) * 100}%`,
                  animationDelay: `${index * 40}ms`,
                }}
              />
            </div>
          </li>
        ))
      )}
    </ul>
  );
}

export function SignalsPanel({
  data,
  loading,
  error,
  users,
  geoFiltered,
  delayClass = "",
}: SignalsPanelProps) {
  const rate =
    data && users && users > 0 ? (data.total / users) * 100 : null;
  const delta = data ? formatDelta(data.total, data.previousTotal) : null;

  const weekLabel = (weekStart: string) => {
    const date = new Date(`${weekStart}T00:00:00`);
    return `Wk of ${date.toLocaleDateString("en", { month: "short", day: "numeric" })}`;
  };

  return (
    <section
      className={`panel animate-rise rounded-2xl p-4 sm:rounded-3xl sm:p-5 md:p-6 ${delayClass}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold tracking-tight text-ink sm:text-xl">
            Interest signals
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            WhatsApp &amp; Instagram clicks captured on-site — first-party data, not GA4
          </p>
        </div>
        {delta ? (
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums ${
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
        ) : null}
      </div>

      {error ? (
        <p className="mt-4 rounded-2xl border border-coral/30 bg-coral/10 px-4 py-3 text-sm text-coral">
          {error}
        </p>
      ) : loading && !data ? (
        <p className="mt-4 text-sm text-ink-soft">Loading signals…</p>
      ) : data ? (
        <>
          <div className="mt-4 flex flex-wrap items-end gap-x-6 gap-y-3 sm:mt-5">
            <div>
              <p className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
                {formatNumber(data.total)}
              </p>
              <p className="mt-1 text-xs text-ink-soft">signals in this range</p>
            </div>
            <div>
              <p className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight text-teal-deep sm:text-4xl">
                {rate === null ? "—" : `${rate.toFixed(1)}%`}
              </p>
              <p className="mt-1 text-xs text-ink-soft">
                signal rate (signals ÷ users)
              </p>
            </div>
            <div className="flex gap-2 pb-1">
              <span className="rounded-full bg-teal/15 px-3 py-1 text-xs font-semibold text-teal-deep">
                {formatNumber(data.whatsapp)} WhatsApp
              </span>
              <span className="rounded-full bg-coral/15 px-3 py-1 text-xs font-semibold text-coral">
                {formatNumber(data.instagram)} Instagram
              </span>
            </div>
          </div>

          <div className="mt-5 grid gap-6 sm:mt-6 sm:grid-cols-2">
            <div className="min-w-0">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-soft sm:text-xs">
                Demand by model
              </p>
              <MiniBars
                color="teal"
                items={data.byModel.slice(0, 8).map((m) => ({
                  label: m.vehicle,
                  value: m.count,
                }))}
              />
            </div>
            <div className="min-w-0">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-soft sm:text-xs">
                Week by week
              </p>
              <MiniBars
                color="coral"
                items={data.byWeek.map((w) => ({
                  label: weekLabel(w.weekStart),
                  value: w.whatsapp + w.instagram,
                  detail: `${w.whatsapp} WA · ${w.instagram} IG`,
                }))}
              />
            </div>
          </div>

          {geoFiltered ? (
            <p className="mt-4 text-[11px] leading-snug text-ink-soft/80">
              Signals are recorded for all visitors and can&apos;t be geo-filtered, so
              the rate can read slightly high while the Lebanon traffic filter is on.
            </p>
          ) : null}
        </>
      ) : (
        <p className="mt-4 text-sm text-ink-soft">No signals yet.</p>
      )}
    </section>
  );
}
