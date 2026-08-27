import { formatNumber } from "@/lib/format";
import type { ModelPageRow, ModelPagesPayload } from "@/lib/types";

interface ModelPerformanceProps {
  data: ModelPagesPayload | null;
  loading: boolean;
  error?: string | null;
  delayClass?: string;
}

/**
 * Which cars people are researching on this brand's site, lifted out of the
 * generic page list. Four measures, never collapsed into one score: users
 * (how many looked), views (how much browsing), views/user (depth), and
 * signals (who acted). Research and action are different questions.
 */

/** Deterministic conclusions — stated only where the numbers support them. */
function conclusionsFor(rows: ModelPageRow[]): string[] {
  const out: string[] = [];
  const withTraffic = rows.filter((r) => r.users > 0);
  if (withTraffic.length === 0) return out;

  const topViews = [...withTraffic].sort((a, b) => b.views - a.views)[0];
  if (topViews) {
    out.push(
      `${topViews.model} draws the most research interest — ${formatNumber(topViews.views)} page views from ${formatNumber(topViews.users)} users.`,
    );
  }

  // Strongest intent relative to the size of its own audience. Worded as a
  // ratio, not a conversion claim: a signal is attributed to the model and
  // scoped to this site, but need not have happened on the model page.
  const rated = withTraffic.filter(
    (r) => r.users >= 10 && r.signalsPer100Users !== null && r.signals > 0,
  );
  if (rated.length >= 2) {
    const best = [...rated].sort(
      (a, b) => (b.signalsPer100Users ?? 0) - (a.signalsPer100Users ?? 0),
    )[0];
    if (best && best.model !== topViews?.model) {
      out.push(
        `${best.model} generates the strongest intent relative to its model-page audience — ${best.signals} signals from ${formatNumber(best.users)} users.`,
      );
    }
  }

  // The actionable exception outranks the observational one: read a lot,
  // asked nothing.
  const silent = withTraffic
    .filter((r) => r.users >= 20 && r.signals === 0)
    .sort((a, b) => b.views - a.views)[0];
  if (silent) {
    out.push(
      `${silent.model} gets traffic but no signals — worth checking the page's call to action.`,
    );
  }

  // Depth of browsing. Views/user clusters tightly in practice (~1.3–1.5),
  // so the bar for "real gap" is set accordingly.
  const deep = withTraffic.filter((r) => r.users >= 10 && r.viewsPerUser !== null);
  if (deep.length >= 2) {
    const sorted = [...deep].sort(
      (a, b) => (b.viewsPerUser ?? 0) - (a.viewsPerUser ?? 0),
    );
    const [first, last] = [sorted[0], sorted[sorted.length - 1]];
    if ((first.viewsPerUser ?? 0) - (last.viewsPerUser ?? 0) >= 0.15) {
      out.push(
        `${first.model} visitors browse deeper than ${last.model} visitors (${first.viewsPerUser?.toFixed(2)} vs ${last.viewsPerUser?.toFixed(2)} views per user).`,
      );
    }
  }

  return out.slice(0, 3);
}

function ChangeCell({ value }: { value: number | null }) {
  if (value === null) return <span className="text-ink-soft">—</span>;
  if (value > 5)
    return <span className="text-teal-deep">▲ {value.toFixed(0)}%</span>;
  if (value < -5)
    return <span className="text-coral">▼ {Math.abs(value).toFixed(0)}%</span>;
  return <span className="text-ink-soft">—</span>;
}

export function ModelPerformance({
  data,
  loading,
  error,
  delayClass = "",
}: ModelPerformanceProps) {
  const rows = [...(data?.rows ?? [])].sort((a, b) => b.views - a.views);
  const conclusions = conclusionsFor(rows);

  return (
    <section
      className={`panel animate-rise rounded-2xl p-4 sm:rounded-3xl sm:p-5 md:p-6 ${delayClass}`}
    >
      <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold tracking-tight text-ink sm:text-xl">
        Model performance
      </h2>
      <p className="mt-1 text-sm text-ink-soft">
        Which cars people are researching on this site — page traffic, browsing
        depth, and the signals each model produced
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
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-soft">
                  <th className="pb-2 pr-3">Model</th>
                  <th className="pb-2 pr-3 text-right">Users</th>
                  <th className="pb-2 pr-3 text-right">Views</th>
                  <th className="pb-2 pr-3 text-right">Views / user</th>
                  <th className="pb-2 pr-3 text-right">Signals</th>
                  <th className="pb-2 text-right">Change</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.model} className="border-t border-[var(--line)]">
                    <td className="py-2 pr-3 font-medium text-ink">{row.model}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-ink">
                      {formatNumber(row.users)}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-ink">
                      {formatNumber(row.views)}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-ink-soft">
                      {row.viewsPerUser === null ? "—" : row.viewsPerUser.toFixed(2)}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-ink">
                      {formatNumber(row.signals)}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      <ChangeCell value={row.usersChange} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {conclusions.length > 0 ? (
            <ul className="mt-4 space-y-1.5 border-t border-[var(--line)] pt-4 text-sm leading-relaxed text-ink">
              {conclusions.map((line, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-teal" />
                  <span className="min-w-0">{line}</span>
                </li>
              ))}
            </ul>
          ) : null}

          <p className="mt-4 text-[11px] leading-snug text-ink-soft/80">
            Model pages recognised from the site&apos;s own URLs. Signals are this
            site&apos;s first-party intent for that model, counted separately from
            page traffic on purpose — research and action are different
            questions.
            {data?.signalsError ? ` Signals unavailable: ${data.signalsError}` : ""}
            {data?.unmappedPaths.length
              ? ` Unrecognised model-like paths: ${data.unmappedPaths.join(", ")}.`
              : ""}
          </p>
        </>
      )}
    </section>
  );
}
