import { formatNumber } from "@/lib/format";
import type { DeadUrlsPayload } from "@/lib/types";

interface DeadUrlsPanelProps {
  data: DeadUrlsPayload | null;
  loading: boolean;
  error?: string | null;
  delayClass?: string;
}

const VERDICT_STYLE: Record<string, { label: string; className: string }> = {
  open: { label: "Open", className: "bg-coral/15 text-coral" },
  "redirect-deployed": {
    label: "Redirect deployed",
    className: "bg-teal/15 text-teal-deep",
  },
  resolved: { label: "Resolved", className: "bg-teal/15 text-teal-deep" },
  unknown: { label: "Unknown", className: "bg-sand/70 text-ink-soft" },
};

/** Monza-focused: URLs GA still records traffic for that don't resolve to
 * real content, with the live probe verdict so fixed redirects stop alarming. */
export function DeadUrlsPanel({
  data,
  loading,
  error,
  delayClass = "",
}: DeadUrlsPanelProps) {
  const openCount = data?.rows.filter((r) => r.verdict === "open").length ?? 0;
  return (
    <details
      className={`panel animate-rise rounded-2xl p-4 sm:rounded-3xl sm:p-5 md:p-6 ${delayClass}`}
      open={openCount > 0}
    >
      <summary className="flex cursor-pointer list-none flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold tracking-tight text-ink sm:text-xl">
          Dead &amp; legacy URLs
        </h2>
        {data ? (
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${openCount > 0 ? "bg-coral/15 text-coral" : "bg-teal/15 text-teal-deep"}`}
          >
            {openCount > 0 ? `${openCount} open` : "none open"}
          </span>
        ) : null}
        <span className="ml-auto text-xs text-ink-soft">details ▾</span>
      </summary>
      <p className="mt-1 text-sm text-ink-soft">
        Paths still receiving traffic, probed live — open 404s lose the users
        that hit them
      </p>

      {error ? (
        <p className="mt-4 rounded-2xl border border-coral/30 bg-coral/10 px-4 py-3 text-sm text-coral">
          {error}
        </p>
      ) : loading && !data ? (
        <p className="mt-4 text-sm text-ink-soft">Probing URLs…</p>
      ) : data && data.rows.length > 0 ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-soft">
                <th className="pb-2 pr-3">Path</th>
                <th className="pb-2 pr-3">Users</th>
                <th className="pb-2 pr-3">Top source</th>
                <th className="pb-2 pr-3">Last seen</th>
                <th className="pb-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => {
                const verdict =
                  VERDICT_STYLE[row.verdict] ?? VERDICT_STYLE.unknown;
                return (
                  <tr key={row.path} className="border-t border-[var(--line)]">
                    <td className="max-w-[220px] truncate py-2 pr-3 text-ink">
                      {row.path}
                    </td>
                    <td className="py-2 pr-3 tabular-nums text-ink">
                      {formatNumber(row.hits)}
                    </td>
                    <td className="max-w-[130px] truncate py-2 pr-3 text-ink-soft">
                      {row.topSource}
                    </td>
                    <td className="py-2 pr-3 text-ink-soft">{row.lastSeen}</td>
                    <td className="py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${verdict.className}`}
                        title={`Live HTTP ${row.liveStatus || "unreachable"}`}
                      >
                        {verdict.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : data ? (
        <p className="mt-4 text-sm text-ink-soft">
          No dead URLs receiving traffic in this range.
        </p>
      ) : null}
    </details>
  );
}
