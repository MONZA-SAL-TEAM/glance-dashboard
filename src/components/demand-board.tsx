import { formatNumber } from "@/lib/format";
import { classifyVehicle, isCanonicalModel } from "@/lib/sites";
import type { DemandRow } from "@/lib/types";

interface DemandBoardProps {
  demand: DemandRow[];
  delayClass?: string;
}

/**
 * Which vehicle people actually ask about, across every site.
 *
 * Brand-level signals ("VOYAH", "MHERO", "the Monza lineup" — captured when
 * no specific model was in context) are counted but kept out of the ranking:
 * they routinely outnumber any single model and would otherwise sit at the
 * top of a board that is supposed to answer "which car".
 */
export function DemandBoard({ demand, delayClass = "" }: DemandBoardProps) {
  const models = demand
    .filter((d) => d.total > 0 && isCanonicalModel(d.vehicle))
    .sort((a, b) => b.total - a.total);
  const brandLevel = demand
    .filter((d) => d.total > 0 && classifyVehicle(d.vehicle) === "brand")
    .sort((a, b) => b.total - a.total);
  // Labels matching neither a model nor one of the three brands. Shown
  // separately so a drifting spelling is visible as a data problem instead
  // of quietly appearing as a fourth brand.
  const unrecognised = demand
    .filter((d) => d.total > 0 && classifyVehicle(d.vehicle) === "unrecognised")
    .sort((a, b) => b.total - a.total);

  const max = Math.max(...models.map((r) => r.total), 1);
  const modelTotal = models.reduce((a, r) => a + r.total, 0);
  const brandTotal = brandLevel.reduce((a, r) => a + r.total, 0);

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
        {models.length === 0 ? (
          <li className="text-sm text-ink-soft">
            No model-specific signals in this range yet.
          </li>
        ) : (
          models.map((row, index) => (
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

      {brandLevel.length > 0 ? (
        <div className="mt-5 border-t border-[var(--line)] pt-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-soft">
            Brand-level interest · no model named
          </p>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-soft">
            {brandLevel.map((row) => (
              <li key={row.vehicle}>
                {row.vehicle}{" "}
                <span className="tabular-nums text-ink">
                  {formatNumber(row.total)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {unrecognised.length > 0 ? (
        <div className="mt-3 rounded-xl bg-sand/60 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-soft">
            Unrecognised labels
          </p>
          <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-soft">
            {unrecognised.map((row) => (
              <li key={row.vehicle}>
                {row.vehicle}{" "}
                <span className="tabular-nums text-ink">
                  {formatNumber(row.total)}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-[11px] leading-snug text-ink-soft/80">
            These match no known model or brand — the sites write free text
            and a new spelling has appeared. They are counted but not ranked;
            add the spelling to the database normalizer to fold them in.
          </p>
        </div>
      ) : null}

      <p className="mt-4 text-[11px] leading-snug text-ink-soft/80">
        Directional first-party demand — {formatNumber(modelTotal)} signals
        across {models.length} model{models.length === 1 ? "" : "s"}.{" "}
        {brandTotal > 0
          ? `${formatNumber(brandTotal)} more were brand-level with no specific model in context, so they are listed separately rather than ranked against individual cars. `
          : ""}
        Gaps of a few signals are not statistically meaningful at this volume.
        Per-site breakdowns live on each site&apos;s own signals panel.
      </p>
    </section>
  );
}
