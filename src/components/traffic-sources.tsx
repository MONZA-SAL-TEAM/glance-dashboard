import { formatNumber } from "@/lib/format";
import { SOCIAL_PLATFORMS, type Platform } from "@/lib/sources";
import type { SourceRow } from "@/lib/types";

interface TrafficSourcesProps {
  sources: SourceRow[];
  delayClass?: string;
}

/**
 * Where visitors came from, with the social platforms called out by name.
 *
 * This is the inbound direction, and it is the opposite of the `instagram_click`
 * signal: that one counts people leaving the site *for* Instagram, this one
 * counts people arriving *from* it. Both are real, they are not the same
 * number, and conflating them is the easiest mistake to make here — hence the
 * explicit wording on both panels.
 */
export function TrafficSources({
  sources,
  delayClass = "",
}: TrafficSourcesProps) {
  const byPlatform = new Map<Platform, { users: number; sessions: number; engaged: number }>();
  for (const row of sources) {
    const entry = byPlatform.get(row.platform) ?? {
      users: 0,
      sessions: 0,
      engaged: 0,
    };
    entry.users += row.users;
    entry.sessions += row.sessions;
    entry.engaged += row.engagedSessions;
    byPlatform.set(row.platform, entry);
  }

  const social = SOCIAL_PLATFORMS.map((platform) => ({
    platform,
    ...(byPlatform.get(platform) ?? { users: 0, sessions: 0, engaged: 0 }),
  })).filter((p) => p.sessions > 0);

  const allSessions = sources.reduce((a, r) => a + r.sessions, 0);
  const socialSessions = social.reduce((a, p) => a + p.sessions, 0);

  // Rank the raw source rows too — the platform totals are a rollup, and a
  // number nobody can trace back to its rows is a number nobody trusts.
  const topSources = [...sources]
    .filter((r) => r.sessions > 0)
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, 10);
  const maxSessions = Math.max(...topSources.map((r) => r.sessions), 1);

  return (
    <section
      className={`panel animate-rise rounded-2xl p-4 sm:rounded-3xl sm:p-5 md:p-6 ${delayClass}`}
    >
      <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold tracking-tight text-ink sm:text-xl">
        Where visitors came from
      </h2>
      <p className="mt-1 text-sm text-ink-soft">
        Sessions that <em>arrived from</em> each platform — not clicks leaving
        the site for it
      </p>

      {social.length > 0 ? (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {social.map((p) => (
            <div key={p.platform} className="min-w-0 rounded-xl bg-sand/60 p-3">
              <p className="truncate text-[11px] uppercase tracking-[0.12em] text-ink-soft">
                {p.platform}
              </p>
              <p className="mt-0.5 font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight text-ink">
                {formatNumber(p.sessions)}
              </p>
              <p className="text-[11px] text-ink-soft">
                {formatNumber(p.users)} users ·{" "}
                {p.sessions > 0
                  ? `${Math.round((p.engaged / p.sessions) * 100)}% engaged`
                  : "—"}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm text-ink-soft">
          No social referrals recorded in this window.
        </p>
      )}

      {allSessions > 0 ? (
        <p className="mt-3 text-sm text-ink-soft">
          Social sent{" "}
          <span className="font-medium text-ink">
            {Math.round((socialSessions / allSessions) * 100)}%
          </span>{" "}
          of sessions ({formatNumber(socialSessions)} of{" "}
          {formatNumber(allSessions)}).
        </p>
      ) : null}

      <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-soft">
        Every source
      </p>
      <ul className="mt-2 space-y-2.5">
        {topSources.length === 0 ? (
          <li className="text-sm text-ink-soft">No sessions in this range.</li>
        ) : (
          topSources.map((row, index) => (
            <li key={`${row.source}/${row.medium}`} className="min-w-0">
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <p className="min-w-0 flex-1 truncate text-sm text-ink">
                  {row.source}
                  <span className="text-ink-soft"> · {row.medium}</span>
                </p>
                <p className="shrink-0 text-sm tabular-nums text-ink">
                  {formatNumber(row.sessions)}
                </p>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-sand">
                <div
                  className="bar-fill h-full rounded-full bg-gradient-to-r from-teal to-teal-deep"
                  style={{
                    width: `${(row.sessions / maxSessions) * 100}%`,
                    animationDelay: `${index * 40}ms`,
                  }}
                />
              </div>
            </li>
          ))
        )}
      </ul>

      <p className="mt-4 text-[11px] leading-snug text-ink-soft/80">
        Instagram&apos;s in-app browser frequently strips the referrer, so real
        Instagram traffic is undercounted here and lands partly in
        &quot;(direct)&quot;. The number is a floor, not a total. Tagging your
        bio and story links with <code>?utm_source=instagram</code> is what
        closes that gap.
      </p>
    </section>
  );
}

/**
 * The home-screen version: social platforms only, no source table. The home
 * screen answers what happened, what people want, and whether anything is
 * broken — this adds "and where they came from" in one line of tiles rather
 * than a second full panel.
 */
export function SocialTraffic({
  social,
  delayClass = "",
}: {
  social: Array<{
    platform: Platform;
    users: number;
    sessions: number;
    engagedSessions: number;
  }>;
  delayClass?: string;
}) {
  const shown = social.filter((p) => p.sessions > 0);
  if (shown.length === 0) return null;
  const total = shown.reduce((a, p) => a + p.sessions, 0);

  return (
    <section
      className={`panel animate-rise rounded-2xl p-4 sm:rounded-3xl sm:p-5 md:p-6 ${delayClass}`}
    >
      <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold tracking-tight text-ink sm:text-xl">
        Social traffic
      </h2>
      <p className="mt-1 text-sm text-ink-soft">
        Sessions that arrived <em>from</em> each platform, all three sites
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {shown.map((p) => (
          <div key={p.platform} className="min-w-0 rounded-xl bg-sand/60 p-3">
            <p className="truncate text-[11px] uppercase tracking-[0.12em] text-ink-soft">
              {p.platform}
            </p>
            <p className="mt-0.5 font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight text-ink">
              {formatNumber(p.sessions)}
            </p>
            <p className="text-[11px] text-ink-soft">
              {formatNumber(p.users)} users ·{" "}
              {Math.round((p.sessions / total) * 100)}% of social
            </p>
          </div>
        ))}
      </div>
      <p className="mt-4 text-[11px] leading-snug text-ink-soft/80">
        Arriving from a platform, which is the opposite of the Instagram
        signal on each site — that one counts people leaving for Instagram.
        In-app browsers often strip the referrer, so treat these as a floor.
      </p>
    </section>
  );
}
