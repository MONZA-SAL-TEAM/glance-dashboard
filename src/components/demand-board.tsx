import { formatNumber } from "@/lib/format";
import type { DemandRow } from "@/lib/types";

interface DemandBoardProps {
  demand: DemandRow[];
  delayClass?: string;
}

/** Which vehicle people actually ask about, across every site — directional
 * first-party demand, feeding order mix and content priority. Kept simple on
 * purpose: the top models, no filter chrome. */
export function DemandBoard({ demand, delayClass = "" }: DemandBoardProps) {
  const rows = demand
    .filter((d) => d.total > 0 && d.vehicle !== "unspecified")
    .slice(0, 6);
  const max = Math.max(...rows.map((r) => r.total), 1);
  const total = demand.reduce((a, r) => a + r.total, 0);

  return (
    <section
      className={`panel animate-rise rounded-2xl p-4 sm:rounded-3xl sm:p-5 md:p-6 ${delayClass}`}
    >
      <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold tracking-tight text-ink sm:text-xl">
        Model demand
      </h2>
      <p className="mt-1 text-sm text-ink-soft">
        What people signal interest in, combined across the three sites
      </p>

      <ul className="mt-4 space-y-2.5 sm:mt-5">
        {rows.length === 0 ? (
          <li className="text-sm text-ink-soft">
            No model-level signals in this range yet.
          </li>
        ) : (
          rows.map((row, index) => (
            <li key={row.vehicle} className="min-w-0">
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <p className="min-w-0 flex-1 truncate text-sm text-ink">
                  {row.vehicle}
                </p>
                <p className="shrink-0 text-sm tabular-nums text-ink">
                  {formatNumber(row.total)}
                </p>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-sand">
                <div
                  className="bar-fill h-full rounded-full bg-gradient-to-r from-teal to-teal-deep"
                  style={{
                    width: `${(row.total / max) * 100}%`,
                    animationDelay: `${index * 40}ms`,
                  }}
                />
              </div>
            </li>
          ))
        )}
      </ul>
      <p className="mt-4 text-[11px] leading-snug text-ink-soft/80">
        Directional first-party demand — {formatNumber(total)} model-tagged
        signals. Gaps of a few signals are not statistically meaningful at this
        volume. Per-site breakdowns live on each site&apos;s own signals panel.
      </p>
    </section>
  );
}
