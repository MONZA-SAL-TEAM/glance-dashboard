"use client";

import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { SocialExtra } from "@/components/social-extra";
import { formatChartDate, formatNumber } from "@/lib/format";
import type {
  SocialAudienceRow,
  SocialPayload,
  SocialMetric,
  SocialProfile,
} from "@/lib/types";

interface SocialPanelProps {
  data: SocialPayload | null;
  loading: boolean;
  error?: string | null;
  /** Instagram click-outs already captured first-party by the sites. */
  instagramSignals?: number;
}

const NETWORK_LABEL = { instagram: "Instagram", facebook: "Facebook" } as const;

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] uppercase tracking-[0.12em] text-ink-soft">
        {label}
      </p>
      <p className="mt-0.5 font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight text-ink">
        {value}
      </p>
      {hint ? <p className="text-[11px] text-ink-soft">{hint}</p> : null}
    </div>
  );
}

/**
 * A metric Meta declined to report renders as an em dash. Formatting it as 0
 * would state that nobody was reached, which is a claim we cannot make — and
 * the panel's own footer already promises that anything Meta withheld is
 * missing from the view rather than shown as a zero.
 */
function metric(profile: SocialProfile, key: SocialMetric): string {
  if (profile.unavailable?.includes(key)) return "—";
  return formatNumber(key === "reach" ? profile.reach : profile.engaged);
}

function ProfileCard({ profile }: { profile: SocialProfile }) {
  const spark = profile.series.map((p) => ({ ...p }));
  return (
    <section className="panel animate-rise rounded-2xl p-4 sm:rounded-3xl sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate font-[family-name:var(--font-display)] text-lg font-semibold tracking-tight text-ink">
            {profile.label}
          </h3>
          <p className="truncate text-xs text-ink-soft">
            {NETWORK_LABEL[profile.network]}
            {profile.handle ? ` · ${profile.handle}` : ""}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
            profile.network === "instagram"
              ? "bg-coral/15 text-coral"
              : "bg-teal/15 text-teal-deep"
          }`}
        >
          {NETWORK_LABEL[profile.network]}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Stat label="Followers" value={formatNumber(profile.followers)} />
        <Stat label="Reach" value={metric(profile, "reach")} hint="people" />
        {profile.network === "instagram" ? (
          <>
            <Stat label="Views" value={formatNumber(profile.views)} />
            <Stat
              label="Profile visits"
              value={formatNumber(profile.profileViews)}
            />
            <Stat
              label="Website taps"
              value={formatNumber(profile.websiteClicks)}
            />
            <Stat label="Accounts engaged" value={formatNumber(profile.engaged)} />
          </>
        ) : (
          <Stat label="Engagements" value={metric(profile, "engaged")} />
        )}
      </div>

      {spark.length > 1 ? (
        <div className="mt-4 h-20">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={spark} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={`sg-${profile.network}-${profile.label}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0e8f7c" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#0e8f7c" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                tickFormatter={formatChartDate}
                tick={{ fill: "#3d5160", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                minTickGap={30}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: 12,
                  border: "1px solid rgba(18,32,43,0.08)",
                  background: "rgba(255,255,255,0.95)",
                  fontSize: 12,
                }}
                labelFormatter={(l) => formatChartDate(String(l))}
                formatter={(v, n) => [formatNumber(Number(v ?? 0)), n === "reach" ? "Reach" : "Views"]}
              />
              <Area
                type="monotone"
                dataKey="reach"
                stroke="#0e8f7c"
                strokeWidth={1.75}
                fill={`url(#sg-${profile.network}-${profile.label})`}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : null}
    </section>
  );
}

function Breakdown({
  title,
  rows,
}: {
  title: string;
  rows: SocialAudienceRow[];
}) {
  if (rows.length === 0) return null;
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="min-w-0">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-soft">
        {title}
      </p>
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.label} className="min-w-0">
            <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate text-ink">{r.label}</span>
              <span className="shrink-0 tabular-nums text-ink-soft">
                {formatNumber(r.value)}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-sand">
              <div
                className="bar-fill h-full rounded-full bg-gradient-to-r from-teal to-teal-deep"
                style={{ width: `${(r.value / max) * 100}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Instagram and Facebook in detail. Reach and engagement come from Meta;
 * the click-outs those posts produced are already measured first-party by
 * the sites, so the two are shown together — audience size on its own does
 * not tell you whether anyone acted.
 */
export function SocialPanel({
  data,
  loading,
  error,
  instagramSignals,
}: SocialPanelProps) {
  if (error) {
    return (
      <div className="rounded-2xl border border-coral/30 bg-coral/10 px-4 py-3 text-sm text-coral">
        {error}
      </div>
    );
  }
  if (loading && !data) {
    return (
      <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="panel h-56 animate-pulse rounded-2xl sm:rounded-3xl" />
        ))}
      </div>
    );
  }
  if (!data) return null;

  if (!data.configured) {
    return (
      <section className="panel animate-rise rounded-2xl p-5 sm:rounded-3xl sm:p-6">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold tracking-tight text-ink sm:text-xl">
          Instagram &amp; Facebook — not connected yet
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
          The reporting is built and waiting on credentials. Add these to the
          Vercel project environment (Production), then redeploy — never commit
          them to the repo:
        </p>
        <ul className="mt-3 space-y-1.5 text-sm text-ink-soft">
          <li>
            <code className="rounded bg-sand px-1.5 py-0.5 text-ink">META_ACCESS_TOKEN</code>{" "}
            — a long-lived Page/System-User token
          </li>
          <li>
            <code className="rounded bg-sand px-1.5 py-0.5 text-ink">META_PROFILES</code>{" "}
            — e.g.{" "}
            <code className="rounded bg-sand px-1.5 py-0.5 text-ink">
              [{`{"label":"Monza SAL","ig_user_id":"…","page_id":"…"}`}]
            </code>
          </li>
          <li>
            <code className="rounded bg-sand px-1.5 py-0.5 text-ink">META_API_VERSION</code>{" "}
            — optional, defaults to v24.0
          </li>
        </ul>
        <SocialExtra data={data} />

      {data.notes.length > 0 ? (
          <ul className="mt-4 space-y-1 text-[11px] text-ink-soft/80">
            {data.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        ) : null}
        <p className="mt-4 text-[11px] leading-snug text-ink-soft/80">
          Full setup steps, including which permissions the token needs, are in
          docs/META_SETUP.md in this repository.
        </p>
      </section>
    );
  }

  const ig = data.profiles.filter((p) => p.network === "instagram");
  const totalFollowers = data.profiles.reduce((a, p) => a + p.followers, 0);
  const totalReach = data.profiles.reduce((a, p) => a + p.reach, 0);
  // If every profile withheld reach there is no total to state — summing
  // absences into 0 is how "not reported" becomes "nobody was reached".
  const reachReported = data.profiles.some(
    (p) => !p.unavailable?.includes("reach"),
  );
  const totalWebsiteTaps = ig.reduce((a, p) => a + p.websiteClicks, 0);

  return (
    <div className="space-y-3 sm:space-y-4">
      <section className="panel animate-rise rounded-2xl p-4 sm:rounded-3xl sm:p-5 md:p-6">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold tracking-tight text-ink sm:text-xl">
          Social overview
        </h2>
        <p className="mt-1 text-sm text-ink-soft">
          Instagram and Facebook across {data.profiles.length} profile
          {data.profiles.length === 1 ? "" : "s"} · last {data.windowDays} days
        </p>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Followers" value={formatNumber(totalFollowers)} hint="all profiles" />
          <Stat
            label="Reach"
            value={reachReported ? formatNumber(totalReach) : "—"}
            hint="people reached"
          />
          <Stat label="Website taps" value={formatNumber(totalWebsiteTaps)} hint="from Instagram" />
          <Stat
            label="Instagram signals"
            value={instagramSignals === undefined ? "—" : formatNumber(instagramSignals)}
            hint="click-outs captured on-site"
          />
        </div>
        <p className="mt-4 text-[11px] leading-snug text-ink-soft/80">
          The first three numbers are what Meta reports. The last is what those
          audiences actually did on your sites, measured first-party — reach
          alone does not tell you whether anyone acted.
        </p>
      </section>

      <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
        {data.profiles.map((p) => (
          <ProfileCard key={`${p.network}-${p.label}`} profile={p} />
        ))}
      </div>

      {data.posts.length > 0 ? (
        <section className="panel animate-rise rounded-2xl p-4 sm:rounded-3xl sm:p-5 md:p-6">
          <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold tracking-tight text-ink sm:text-xl">
            Top posts
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            Ranked by total interactions in the last {data.windowDays} days
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-soft">
                  <th className="pb-2 pr-3">Post</th>
                  <th className="pb-2 pr-3">Type</th>
                  <th className="pb-2 pr-3 text-right">Reach</th>
                  <th className="pb-2 pr-3 text-right">Likes</th>
                  <th className="pb-2 pr-3 text-right">Comments</th>
                  <th className="pb-2 pr-3 text-right">Shares</th>
                  <th className="pb-2 pr-3 text-right">Saves</th>
                  <th className="pb-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.posts.map((p) => (
                  <tr key={p.id} className="border-t border-[var(--line)]">
                    <td className="max-w-[260px] py-2 pr-3">
                      <a
                        href={p.permalink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block truncate text-ink underline-offset-2 hover:underline"
                        title={p.caption}
                      >
                        {p.caption || "(no caption)"}
                      </a>
                      <span className="text-[11px] text-ink-soft">
                        {p.profile} · {p.timestamp.slice(0, 10)}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-ink-soft">{p.type}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-ink-soft">
                      {p.reach ? formatNumber(p.reach) : "—"}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-ink">{formatNumber(p.likes)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-ink-soft">{formatNumber(p.comments)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-ink-soft">{formatNumber(p.shares)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-ink-soft">
                      {p.network === "instagram" ? formatNumber(p.saves) : "—"}
                    </td>
                    <td className="py-2 text-right tabular-nums font-medium text-ink">
                      {formatNumber(p.interactions)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {data.audience.cities.length > 0 ||
      data.audience.countries.length > 0 ||
      data.audience.age.length > 0 ||
      data.audience.gender.length > 0 ? (
        <section className="panel animate-rise rounded-2xl p-4 sm:rounded-3xl sm:p-5 md:p-6">
          <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold tracking-tight text-ink sm:text-xl">
            Audience
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            Instagram follower demographics
          </p>
          <div className="mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <Breakdown title="Cities" rows={data.audience.cities} />
            <Breakdown title="Countries" rows={data.audience.countries} />
            <Breakdown title="Age" rows={data.audience.age} />
            <Breakdown title="Gender" rows={data.audience.gender} />
          </div>
        </section>
      ) : null}

      {data.notes.length > 0 ? (
        <details className="panel animate-rise rounded-2xl p-4 sm:rounded-3xl sm:p-5">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-ink">
            {data.notes.length} item{data.notes.length === 1 ? "" : "s"} Meta did
            not return
            <span className="ml-auto text-xs font-normal text-ink-soft">▾</span>
          </summary>
          <ul className="mt-3 space-y-1 text-[11px] leading-snug text-ink-soft">
            {data.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] text-ink-soft/80">
            Meta retires insight metrics regularly. Anything listed here is
            missing from this view rather than shown as a zero.
          </p>
        </details>
      ) : null}
    </div>
  );
}
