import { formatNumber } from "@/lib/format";
import type { ModelPageRow, ModelPagesPayload } from "@/lib/types";

interface ModelPagesProps {
  data: ModelPagesPayload | null;
  loading: boolean;
  error?: string | null;
  delayClass?: string;
}

/**
 * Popularity and intent are ranked side by side, never blended. The gap
 * between a model's two positions is the actionable part: high views with
 * low signals is a CTA problem, the reverse is an audience problem.
 */
function Ranking({
  title,
  caption,
  items,
}: {
  title: string;
  caption: string;
  items: Array<{ model: string; value: string }>;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-soft">
        {title}
      </p>
      <p className="mt-0.5 text-[11px] text-ink-soft/80">{caption}</p>
      <ol className="mt-3 space-y-1.5">
        {items.length === 0 ? (
          <li className="text-sm text-ink-soft">No data in this range.</li>
        ) : (
          items.map((item, i) => (
            <li
              key={item.model}
              className="flex items-baseline gap-2 text-sm text-ink"
            >
              <span className="w-4 shrink-0 tabular-nums text-ink-soft">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 truncate">{item.model}</span>
              <span className="shrink-0 tabular-nums text-ink-soft">
                {item.value}
              </span>
            </li>
          ))
        )}
      </ol>
    </div>
  );
}

/**
 * Flags exceptions only — a blank cell means "nothing unusual", so the
 * column reads as a to-do list rather than a label for every row.
 */
function readOf(row: ModelPageRow, medianUsers: number): string | null {
  const rate = row.signalsPer100Users ?? 0;

  // Too small an audience to conclude anything from the ratio — unless it
  // is punching well above its size.
  if (row.users < 10) {
    return row.signals >= 3 ? "small audience, strong intent" : null;
  }

  // The case worth acting on first: people read the page and nobody asks.
  if (row.signals === 0) return "traffic but no signals — check the CTA";

  if (rate < 5) return "curiosity, little action";

  if (rate >= 15) {
    return row.users >= medianUsers
      ? "strong interest"
      : "small audience, strong intent";
  }

  return null;
}

export function ModelPages({
  data,
  loading,
  error,
  delayClass = "",
}: ModelPagesProps) {
  const rows = data?.rows ?? [];
  const byViews = [...rows].filter((r) => r.views > 0).sort((a, b) => b.views - a.views);
  const bySignals = [...rows].filter((r) => r.signals > 0).sort((a, b) => b.signals - a.signals);
  const userCounts = rows.map((r) => r.users).sort((a, b) => a - b);
  const medianUsers = userCounts.length
    ? userCounts[Math.floor(userCounts.length / 2)]
    : 0;

  return (
    <section
      className={`panel animate-rise rounded-2xl p-4 sm:rounded-3xl sm:p-5 md:p-6 ${delayClass}`}
    >
      <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold tracking-tight text-ink sm:text-xl">
        Model interest
      </h2>
      <p className="mt-1 text-sm text-ink-soft">
        Which cars people read about, and which ones they act on — page traffic
        and intent kept separate
      </p>

      {error ? (
        <p className="mt-4 rounded-2xl border border-coral/30 bg-coral/10 px-4 py-3 text-sm text-coral">
          {error}
        </p>
      ) : loading && !data ? (
        <p className="mt-4 text-sm text-ink-soft">Loading model pages…</p>
      ) : rows.length === 0 ? (
        <p className="mt-4 text-sm text-ink-soft">
          No model-page traffic in this range.
        </p>
      ) : (
        <>
          <div className="mt-5 grid gap-6 border-b border-[var(--line)] pb-5 sm:grid-cols-2">
            <Ranking
              title="Popularity"
              caption="by model-page views"
              items={byViews.slice(0, 5).map((r) => ({
                model: r.model,
                value: formatNumber(r.views),
              }))}
            />
            <Ranking
              title="Intent"
              caption="by first-party signals"
              items={bySignals.slice(0, 5).map((r) => ({
                model: r.model,
                value: formatNumber(r.signals),
              }))}
            />
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[620px] text-sm">
              <thead>
                <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-soft">
                  <th className="pb-2 pr-3">Model</th>
                  <th className="pb-2 pr-3 text-right">Views</th>
                  <th className="pb-2 pr-3 text-right">Users</th>
                  <th className="pb-2 pr-3 text-right">Δ users</th>
                  <th className="pb-2 pr-3 text-right">Engaged</th>
                  <th className="pb-2 pr-3 text-right">Signals</th>
                  <th className="pb-2">Read</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const read = readOf(row, medianUsers);
                  return (
                    <tr key={row.model} className="border-t border-[var(--line)]">
                      <td className="py-2 pr-3 font-medium text-ink">{row.model}</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-ink">
                        {formatNumber(row.views)}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums text-ink-soft">
                        {formatNumber(row.users)}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {row.usersChange === null ? (
                          <span className="text-ink-soft">—</span>
                        ) : (
                          <span
                            className={
                              row.usersChange > 0.5
                                ? "text-teal-deep"
                                : row.usersChange < -0.5
                                  ? "text-coral"
                                  : "text-ink-soft"
                            }
                          >
                            {row.usersChange > 0.5 ? "▲" : row.usersChange < -0.5 ? "▼" : "±"}{" "}
                            {Math.abs(row.usersChange).toFixed(0)}%
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums text-ink-soft">
                        {row.engagementRate === null
                          ? "—"
                          : `${row.engagementRate.toFixed(0)}%`}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums text-ink">
                        {formatNumber(row.signals)}
                      </td>
                      <td className="py-2 text-[11px] leading-snug text-ink-soft">
                        {read ?? ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="mt-4 text-[11px] leading-snug text-ink-soft/80">
            Views, users and engagement come from GA4 model pages on
            voyahlebanon.com and mherolebanon.com. Signals are first-party
            intent for that model from any site, so the two columns measure
            different things on purpose — at this volume treat the ordering as
            directional, not decisive.
            {data?.signalsError ? ` Signals unavailable: ${data.signalsError}` : ""}
            {data?.unmappedPaths.length
              ? ` Unmapped model-like paths seen: ${data.unmappedPaths.join(", ")}.`
              : ""}
          </p>
        </>
      )}
    </section>
  );
}
