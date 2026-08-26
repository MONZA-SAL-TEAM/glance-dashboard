"use client";

import { formatNumber } from "@/lib/format";
import type { RealtimePayload } from "@/lib/types";

interface RealtimePanelProps {
  data: RealtimePayload | null;
  loading: boolean;
  error?: string | null;
}

export function RealtimePanel({ data, loading, error }: RealtimePanelProps) {
  return (
    <section className="panel animate-rise animate-rise-delay-1 relative overflow-hidden rounded-2xl p-4 sm:rounded-3xl sm:p-5 md:p-6">
      <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-teal/10 blur-2xl" />
      <div className="flex items-center gap-2">
        <span className={error ? "h-2 w-2 rounded-full bg-coral" : "live-dot"} />
        <p
          className={`text-sm font-medium tracking-wide ${error ? "text-coral" : "text-teal-deep"}`}
        >
          {error ? "Live feed offline" : "Live right now"}
        </p>
      </div>
      <p className="mt-3 font-[family-name:var(--font-display)] text-4xl font-semibold tracking-tight text-ink sm:mt-4 sm:text-5xl md:text-6xl">
        {error ? "!" : loading && !data ? "—" : formatNumber(data?.activeUsers ?? 0)}
      </p>
      <p className="mt-1 text-sm text-ink-soft">
        {error ? error : "active users in the last 30 minutes"}
      </p>
      {!error && data?.fetchedAt ? (
        <p className="mt-1 text-xs text-ink-soft">
          Checked {new Date(data.fetchedAt).toLocaleTimeString()}
        </p>
      ) : null}

      <div className="mt-5 grid gap-4 sm:mt-6 sm:grid-cols-2">
        <div className="min-w-0">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-soft sm:text-xs">
            Active pages
          </p>
          <ul className="space-y-2">
            {(data?.byPage ?? []).slice(0, 4).map((page) => (
              <li key={page.path} className="flex items-start justify-between gap-3 text-sm">
                <span className="min-w-0 flex-1 break-words text-ink [overflow-wrap:anywhere] sm:truncate sm:break-normal">
                  {page.path}
                </span>
                <span className="shrink-0 tabular-nums text-ink-soft">{page.users}</span>
              </li>
            ))}
            {!data?.byPage?.length ? (
              <li className="text-sm text-ink-soft">Waiting for visitors…</li>
            ) : null}
          </ul>
        </div>
        <div className="min-w-0">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-soft sm:text-xs">
            Where from
          </p>
          <ul className="space-y-2">
            {(data?.byCountry ?? []).slice(0, 4).map((country) => (
              <li
                key={country.name}
                className="flex items-start justify-between gap-3 text-sm"
              >
                <span className="min-w-0 flex-1 truncate text-ink">{country.name}</span>
                <span className="shrink-0 tabular-nums text-ink-soft">{country.users}</span>
              </li>
            ))}
            {!data?.byCountry?.length ? (
              <li className="text-sm text-ink-soft">No live geo yet</li>
            ) : null}
          </ul>
        </div>
      </div>
    </section>
  );
}
