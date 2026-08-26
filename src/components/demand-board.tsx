"use client";

import { useState } from "react";
import { formatNumber } from "@/lib/format";
import type { DemandRow } from "@/lib/types";

interface DemandBoardProps {
  demand: DemandRow[];
  delayClass?: string;
}

const SOURCES: Array<{ key: string; label: string }> = [
  { key: "all", label: "All" },
  { key: "voyahlebanon.com", label: "VOYAH" },
  { key: "mherolebanon.com", label: "MHERO" },
  { key: "monzasal.com", label: "Monza-originated" },
];

/** Which vehicle people actually ask about, across every site — directional
 * first-party demand, feeding order mix and content priority. */
export function DemandBoard({ demand, delayClass = "" }: DemandBoardProps) {
  const [source, setSource] = useState("all");

  const rows = demand
    .map((d) => ({
      vehicle: d.vehicle,
      count: source === "all" ? d.total : (d.bySite[source] ?? 0),
    }))
    .filter((d) => d.count > 0 && d.vehicle !== "unspecified")
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  const max = Math.max(...rows.map((r) => r.count), 1);
  const total = rows.reduce((a, r) => a + r.count, 0);

  return (
    <section
      className={`panel animate-rise rounded-2xl p-4 sm:rounded-3xl sm:p-5 md:p-6 ${delayClass}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold tracking-tight text-ink sm:text-xl">
            Model demand — all sites
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            Which vehicles people signal interest in, combined across the three
            sites
          </p>
        </div>
        <div
          className="range-pill"
          role="group"
          aria-label="Demand source"
          style={{ gridTemplateColumns: `repeat(${SOURCES.length}, minmax(0, 1fr))` }}
        >
          {SOURCES.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setSource(s.key)}
              className={
                source === s.key
                  ? "bg-ink text-white"
                  : "text-ink-soft active:bg-sand"
              }
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

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
                  {formatNumber(row.count)}
                </p>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-sand">
                <div
                  className="bar-fill h-full rounded-full bg-gradient-to-r from-teal to-teal-deep"
                  style={{
                    width: `${(row.count / max) * 100}%`,
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
        signals in this view. Gaps of a few signals are not statistically
        meaningful at this volume.
      </p>
    </section>
  );
}
