import { formatNumber } from "@/lib/format";
import type { SocialPayload } from "@/lib/types";

/**
 * Paid performance, benchmarking and listening — the sections that sit
 * below the organic overview on the Social view.
 */

const money = (n: number) =>
  n.toLocaleString("en", { maximumFractionDigits: n < 100 ? 2 : 0 });

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] uppercase tracking-[0.12em] text-ink-soft">{label}</p>
      <p className="mt-0.5 font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight text-ink">
        {value}
      </p>
      {hint ? <p className="text-[11px] text-ink-soft">{hint}</p> : null}
    </div>
  );
}

export function SocialExtra({ data }: { data: SocialPayload }) {
  return (
    <>
      {data.ads.configured ? (
        <section className="panel animate-rise rounded-2xl p-4 sm:rounded-3xl sm:p-5 md:p-6">
          <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold tracking-tight text-ink sm:text-xl">
            Paid campaigns
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            Meta Ads over the same window — spend measured against results, not
            clicks
          </p>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Spend" value={money(data.ads.spend)} hint="all campaigns" />
            <Stat
              label="Results"
              value={formatNumber(data.ads.leads)}
              hint="leads + conversations"
            />
            <Stat
              label="Cost / result"
              value={
                data.ads.leads > 0 ? money(data.ads.spend / data.ads.leads) : "—"
              }
            />
            <Stat label="Paid reach" value={formatNumber(data.ads.reach)} />
          </div>

          {data.ads.campaigns.length > 0 ? (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[680px] text-sm">
                <thead>
                  <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-soft">
                    <th className="pb-2 pr-3">Campaign</th>
                    <th className="pb-2 pr-3 text-right">Spend</th>
                    <th className="pb-2 pr-3 text-right">Reach</th>
                    <th className="pb-2 pr-3 text-right">Clicks</th>
                    <th className="pb-2 pr-3 text-right">CTR</th>
                    <th className="pb-2 pr-3 text-right">Results</th>
                    <th className="pb-2 text-right">Cost / result</th>
                  </tr>
                </thead>
                <tbody>
                  {data.ads.campaigns.map((c) => (
                    <tr key={c.id || c.name} className="border-t border-[var(--line)]">
                      <td className="max-w-[240px] py-2 pr-3">
                        <span className="block truncate text-ink">{c.name}</span>
                        <span className="text-[11px] text-ink-soft">{c.account}</span>
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums text-ink">
                        {money(c.spend)}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums text-ink-soft">
                        {formatNumber(c.reach)}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums text-ink-soft">
                        {formatNumber(c.clicks)}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums text-ink-soft">
                        {c.ctr.toFixed(2)}%
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums text-ink">
                        {formatNumber(c.results)}
                      </td>
                      <td className="py-2 text-right tabular-nums font-medium text-ink">
                        {c.costPerResult === null ? "—" : money(c.costPerResult)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-4 text-sm text-ink-soft">
              No campaigns ran in this window.
            </p>
          )}

          <p className="mt-4 text-[11px] leading-snug text-ink-soft/80">
            A result is a form lead or a messaging conversation started. A click
            is not a result, so cost-per-result never flatters a campaign by
            counting traffic as conversion. Amounts are in the ad account&apos;s
            own billing currency.
          </p>
        </section>
      ) : null}

      {data.competitors.length > 0 ? (
        <section className="panel animate-rise rounded-2xl p-4 sm:rounded-3xl sm:p-5 md:p-6">
          <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold tracking-tight text-ink sm:text-xl">
            Competitors
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            Public Instagram business accounts, for scale comparison
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-soft">
                  <th className="pb-2 pr-3">Account</th>
                  <th className="pb-2 pr-3 text-right">Followers</th>
                  <th className="pb-2 pr-3 text-right">Posts</th>
                  <th className="pb-2 text-right">Avg engagement / post</th>
                </tr>
              </thead>
              <tbody>
                {data.competitors.map((c) => (
                  <tr key={c.handle} className="border-t border-[var(--line)]">
                    <td className="py-2 pr-3 text-ink">@{c.handle}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-ink">
                      {formatNumber(c.followers)}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-ink-soft">
                      {formatNumber(c.posts)}
                    </td>
                    <td className="py-2 text-right tabular-nums text-ink">
                      {formatNumber(Math.round(c.avgEngagementPerPost))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-[11px] leading-snug text-ink-soft/80">
            Meta exposes only public headline counts and recent public media for
            accounts you don&apos;t own — never their reach, audience or
            insights. Engagement is averaged over their last 12 posts.
          </p>
        </section>
      ) : null}

      {data.hashtags.length > 0 ? (
        <section className="panel animate-rise rounded-2xl p-4 sm:rounded-3xl sm:p-5 md:p-6">
          <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold tracking-tight text-ink sm:text-xl">
            Hashtags
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            Engagement on the top public posts for each tracked tag
          </p>
          <ul className="mt-4 space-y-2">
            {data.hashtags.map((h) => (
              <li
                key={h.tag}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-[var(--line)] pt-2 text-sm"
              >
                <a
                  href={h.topPermalink || undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-ink underline-offset-2 hover:underline"
                >
                  #{h.tag}
                </a>
                <span className="tabular-nums text-ink-soft">
                  {formatNumber(h.totalLikes)} likes ·{" "}
                  {formatNumber(h.totalComments)} comments across{" "}
                  {h.topMediaCount} top posts
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[11px] leading-snug text-ink-soft/80">
            Meta allows 30 unique hashtags per 7 days per account, so this
            tracks a configured shortlist rather than everything.
          </p>
        </section>
      ) : null}

      {data.mentions.length > 0 ? (
        <section className="panel animate-rise rounded-2xl p-4 sm:rounded-3xl sm:p-5 md:p-6">
          <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold tracking-tight text-ink sm:text-xl">
            Tagged by others
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            Posts from other accounts that tagged you
          </p>
          <ul className="mt-4 space-y-3">
            {data.mentions.map((m) => (
              <li key={m.id} className="border-t border-[var(--line)] pt-3 text-sm">
                <a
                  href={m.permalink || undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-ink underline-offset-2 hover:underline"
                >
                  @{m.username}
                </a>
                <span className="ml-2 text-ink-soft">
                  {m.caption || "(no caption)"}
                </span>
                <span className="ml-2 whitespace-nowrap text-[11px] text-ink-soft">
                  {m.timestamp.slice(0, 10)} · {formatNumber(m.likes)} likes
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {data.comments.length > 0 ? (
        <details className="panel animate-rise rounded-2xl p-4 sm:rounded-3xl sm:p-5 md:p-6">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-ink">
            Recent comments
            <span className="font-normal text-ink-soft">
              · {data.comments.length} on your latest posts
            </span>
            <span className="ml-auto text-xs font-normal text-ink-soft">▾</span>
          </summary>
          <ul className="mt-4 space-y-3">
            {data.comments.map((c) => (
              <li key={c.id} className="border-t border-[var(--line)] pt-3 text-sm">
                <a
                  href={c.permalink || undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-ink underline-offset-2 hover:underline"
                >
                  @{c.username}
                </a>
                <span className="ml-2 text-ink-soft">{c.text}</span>
                <span className="ml-2 whitespace-nowrap text-[11px] text-ink-soft">
                  {c.timestamp.slice(0, 10)}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] leading-snug text-ink-soft/80">
            Comments on your own posts only. Direct messages are private
            conversations and are deliberately not collected here.
          </p>
        </details>
      ) : null}
    </>
  );
}
