import { format, subDays } from "date-fns";
import { fetchAds } from "./meta-ads";
import {
  fetchCompetitors,
  fetchComments,
  fetchHashtags,
  fetchMentions,
  listeningConfig,
} from "./meta-listening";
import { rangeDays } from "./ranges";
import type {
  AdsSummary,
  CompetitorRow,
  DateRangeKey,
  HashtagRow,
  MentionRow,
  SocialAudience,
  SocialComment,
  SocialAudienceRow,
  SocialPayload,
  SocialPost,
  SocialProfile,
  SocialSeriesPoint,
} from "./types";

/**
 * Instagram + Facebook reporting via the Meta Graph API.
 *
 * Two realities shape this file:
 *  1. Meta retires insight metrics on its own schedule (Instagram's
 *     `impressions` gave way to `views`; a large batch of Page metrics was
 *     retired during 2024-25). Every metric group is therefore requested
 *     independently, a failure degrades that group only, and whatever could
 *     not be fetched is reported in `notes` rather than silently shown as 0.
 *  2. Credentials live only in server env. The token is never returned to
 *     the browser and is scrubbed from any error text.
 */

const API_VERSION = process.env.META_API_VERSION || "v24.0";
const TOKEN = process.env.META_ACCESS_TOKEN || "";

export interface MetaProfileConfig {
  label: string;
  /** Marketing API ad account, e.g. act_1234567890. */
  adAccountId?: string;
  /** Instagram Business/Creator account id — not the @handle. */
  igUserId?: string;
  /** Facebook Page id. */
  pageId?: string;
}

/** META_PROFILES mirrors the GA_PROPERTIES pattern already used for GA4. */
export function metaProfiles(): MetaProfileConfig[] {
  const raw = process.env.META_PROFILES;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Array<Record<string, string>>;
    return parsed
      .map((p) => ({
        label: p.label || p.name || "Profile",
        igUserId: p.ig_user_id || p.igUserId,
        pageId: p.page_id || p.pageId,
        adAccountId: p.ad_account_id || p.adAccountId,
      }))
      .filter((p) => p.igUserId || p.pageId || p.adAccountId);
  } catch {
    return [];
  }
}

export async function graph<T>(
  path: string,
  params: Record<string, string> = {},
  /** Page-scoped token for the endpoints Meta refuses to serve to a
   * user or system-user token — Page insights and published_posts both
   * answer (#210) without one. */
  token: string = TOKEN,
): Promise<T> {
  const url = new URL(`https://graph.facebook.com/${API_VERSION}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("access_token", token);

  const res = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => ({}))) as {
    error?: { message?: string };
  };
  if (!res.ok || body.error) {
    let raw = body.error?.message || `HTTP ${res.status}`;
    // Both secrets, since the note this becomes is rendered in the browser.
    for (const secret of [token, TOKEN]) {
      if (secret) raw = raw.split(secret).join("[token]");
    }
    throw new Error(raw);
  }
  return body as T;
}

/** Runs a call, recording the reason instead of throwing. */
export async function attempt<T>(
  label: string,
  notes: string[],
  fn: () => Promise<T>,
): Promise<T | null> {
  try {
    return await fn();
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    notes.push(`${label} — ${msg.slice(0, 180)}`);
    return null;
  }
}

interface InsightValue {
  value: number | Record<string, number>;
  end_time?: string;
}
interface InsightEntry {
  name: string;
  values?: InsightValue[];
  total_value?: {
    value?: number;
    breakdowns?: Array<{
      results?: Array<{ dimension_values: string[]; value: number }>;
    }>;
  };
}

function sumSeries(entry: InsightEntry | undefined): number {
  if (!entry?.values) return 0;
  return entry.values.reduce(
    (a, v) => a + (typeof v.value === "number" ? v.value : 0),
    0,
  );
}

/**
 * Total-value metrics answer with a single number instead of a daily series,
 * so summing `values` would silently read them as zero.
 */
function metricTotal(entry: InsightEntry | undefined): number {
  if (entry?.values?.length) return sumSeries(entry);
  const value = entry?.total_value?.value;
  return typeof value === "number" ? value : 0;
}

function seriesOf(entry: InsightEntry | undefined): Map<string, number> {
  const out = new Map<string, number>();
  for (const v of entry?.values ?? []) {
    if (typeof v.value === "number" && v.end_time) {
      out.set(v.end_time.slice(0, 10), v.value);
    }
  }
  return out;
}

function mergeSeries(
  reach: Map<string, number>,
  views: Map<string, number>,
): SocialSeriesPoint[] {
  const days = [...new Set([...reach.keys(), ...views.keys()])].sort();
  return days.map((date) => ({
    date,
    reach: reach.get(date) ?? 0,
    views: views.get(date) ?? 0,
  }));
}

async function instagramProfile(
  cfg: MetaProfileConfig,
  since: string,
  until: string,
  notes: string[],
): Promise<SocialProfile> {
  const id = cfg.igUserId as string;

  const acct = await attempt(`${cfg.label} · IG account`, notes, () =>
    graph<{
      username?: string;
      followers_count?: number;
      media_count?: number;
    }>(id, { fields: "username,followers_count,media_count" }),
  );

  // Instagram insights come in two families that cannot share a request:
  // `reach` is a daily time series, while views / profile_views /
  // website_clicks / accounts_engaged are totals and must carry
  // metric_type=total_value. Asking for them together fails the whole call
  // with (#100) and takes reach down with it — which is exactly how every
  // number on this panel read zero. Two calls, failing independently.
  const timeSeries = await attempt(
    `${cfg.label} · IG reach`,
    notes,
    () =>
      graph<{ data: InsightEntry[] }>(`${id}/insights`, {
        metric: "reach",
        period: "day",
        since,
        until,
      }),
  );

  const totals = await attempt(`${cfg.label} · IG totals`, notes, () =>
    graph<{ data: InsightEntry[] }>(`${id}/insights`, {
      metric: "views,profile_views,website_clicks,accounts_engaged",
      metric_type: "total_value",
      period: "day",
      since,
      until,
    }),
  );

  const byName = new Map(
    [...(timeSeries?.data ?? []), ...(totals?.data ?? [])].map((e) => [
      e.name,
      e,
    ]),
  );
  const viewsEntry = byName.get("views") ?? byName.get("impressions");

  return {
    label: cfg.label,
    network: "instagram",
    handle: acct?.username ? `@${acct.username}` : undefined,
    followers: acct?.followers_count ?? 0,
    posts: acct?.media_count ?? 0,
    reach: metricTotal(byName.get("reach")),
    views: metricTotal(viewsEntry),
    profileViews: metricTotal(byName.get("profile_views")),
    websiteClicks: metricTotal(byName.get("website_clicks")),
    engaged: metricTotal(byName.get("accounts_engaged")),
    series: mergeSeries(seriesOf(byName.get("reach")), seriesOf(viewsEntry)),
  };
}

async function instagramAudience(
  igUserId: string,
  label: string,
  notes: string[],
): Promise<SocialAudience> {
  const pull = async (breakdown: string): Promise<SocialAudienceRow[]> => {
    const res = await attempt(
      `${label} · IG audience (${breakdown})`,
      notes,
      () =>
        graph<{ data: InsightEntry[] }>(`${igUserId}/insights`, {
          metric: "follower_demographics",
          period: "lifetime",
          metric_type: "total_value",
          breakdown,
        }),
    );
    const results = res?.data?.[0]?.total_value?.breakdowns?.[0]?.results ?? [];
    return results
      .map((r) => ({ label: r.dimension_values[0], value: r.value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  };

  const [cities, countries, age, gender] = await Promise.all([
    pull("city"),
    pull("country"),
    pull("age"),
    pull("gender"),
  ]);
  return { cities, countries, age, gender };
}

async function instagramPosts(
  igUserId: string,
  label: string,
  since: string,
  notes: string[],
): Promise<SocialPost[]> {
  const media = await attempt(`${label} · IG media`, notes, () =>
    graph<{ data: Array<Record<string, string | number>> }>(
      `${igUserId}/media`,
      {
        fields:
          "id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count",
        limit: "25",
      },
    ),
  );

  const items = (media?.data ?? []).filter(
    (m) => String(m.timestamp ?? "").slice(0, 10) >= since,
  );

  return Promise.all(
    items.map(async (m) => {
      const ins = await attempt(
        `${label} · IG post insights`,
        notes,
        () =>
          graph<{ data: InsightEntry[] }>(`${m.id}/insights`, {
            metric: "reach,total_interactions,saved,shares",
          }),
      );
      const byName = new Map((ins?.data ?? []).map((e) => [e.name, e]));
      const val = (n: string) => {
        const v = byName.get(n)?.values?.[0]?.value;
        return typeof v === "number" ? v : 0;
      };
      const likes = Number(m.like_count ?? 0);
      const comments = Number(m.comments_count ?? 0);
      return {
        network: "instagram" as const,
        profile: label,
        id: String(m.id),
        caption: String(m.caption ?? "").slice(0, 140),
        type: String(m.media_product_type ?? m.media_type ?? "POST"),
        permalink: String(m.permalink ?? ""),
        timestamp: String(m.timestamp ?? ""),
        likes,
        comments,
        shares: val("shares"),
        saves: val("saved"),
        reach: val("reach"),
        interactions: val("total_interactions") || likes + comments,
      };
    }),
  );
}

/**
 * Page-scoped tokens, one fetch per Page per request.
 *
 * Page insights and published_posts both answer (#210) "a page access token
 * is required" to a user or system-user token, no matter how it is scoped.
 * The Page token is derived from the configured token rather than stored, so
 * there is still exactly one secret in the environment.
 */
const pageTokens = new Map<string, Promise<string | null>>();

function pageToken(
  pageId: string,
  label: string,
  notes: string[],
): Promise<string | null> {
  const cached = pageTokens.get(pageId);
  if (cached) return cached;
  const pending = attempt(`${label} · FB page token`, notes, () =>
    graph<{ access_token?: string }>(pageId, { fields: "access_token" }),
  ).then((res) => res?.access_token ?? null);
  pageTokens.set(pageId, pending);
  return pending;
}

/**
 * Page metrics are retired on Meta's schedule and a single dead name fails
 * the whole request with (#100) "must be a valid insights metric" — which is
 * how reach and engagement both read zero because of one bad third metric.
 * One request per metric, so a retirement costs that number alone.
 *
 * Each measure is a list of names newest-first, tried until one answers:
 * `page_impressions_unique` was itself retired after this code first shipped,
 * and a lone metric name means the next retirement silently becomes a zero.
 * Only a measure whose every candidate failed is worth reporting, and the
 * note then names them all rather than just the last one tried.
 */
async function facebookMetric(
  pageId: string,
  candidates: string[],
  label: string,
  since: string,
  until: string,
  token: string | null,
  notes: string[],
): Promise<InsightEntry | undefined> {
  const quiet: string[] = [];
  for (const metric of candidates) {
    const res = await attempt(`${label} · FB ${metric}`, quiet, () =>
      graph<{ data: InsightEntry[] }>(
        `${pageId}/insights`,
        { metric, period: "day", since, until },
        token ?? undefined,
      ),
    );
    const entry = res?.data?.[0];
    if (entry) return entry;
  }
  // Every candidate failed: report the measure once, not each attempt.
  notes.push(
    `${label} · FB ${candidates.join(" / ")} — ${
      quiet[quiet.length - 1]?.split(" — ").slice(1).join(" — ") ||
      "no metric in this group is currently valid"
    }`,
  );
  return undefined;
}

async function facebookProfile(
  cfg: MetaProfileConfig,
  since: string,
  until: string,
  notes: string[],
): Promise<SocialProfile> {
  const id = cfg.pageId as string;

  const page = await attempt(`${cfg.label} · FB page`, notes, () =>
    graph<{ name?: string; followers_count?: number; fan_count?: number }>(id, {
      fields: "name,followers_count,fan_count",
    }),
  );

  const token = await pageToken(id, cfg.label, notes);
  const [reachEntry, engagedEntry] = await Promise.all([
    facebookMetric(
      id,
      ["page_impressions_unique", "page_impressions", "page_reach"],
      cfg.label,
      since,
      until,
      token,
      notes,
    ),
    facebookMetric(
      id,
      ["page_post_engagements", "page_total_actions"],
      cfg.label,
      since,
      until,
      token,
      notes,
    ),
  ]);
  // Keyed by role rather than by Meta's metric name: which candidate answered
  // is an implementation detail, and keying on the name would break the
  // moment a fallback is the one that succeeds.
  const byName = new Map<string, InsightEntry>();
  if (reachEntry) byName.set("reach", reachEntry);
  if (engagedEntry) byName.set("engaged", engagedEntry);

  return {
    label: cfg.label,
    network: "facebook",
    handle: page?.name,
    followers: page?.followers_count ?? page?.fan_count ?? 0,
    posts: 0,
    reach: metricTotal(byName.get("reach")),
    views: 0,
    profileViews: 0,
    websiteClicks: 0,
    engaged: metricTotal(byName.get("engaged")),
    series: mergeSeries(seriesOf(byName.get("reach")), new Map()),
  };
}

async function facebookPosts(
  pageId: string,
  label: string,
  since: string,
  notes: string[],
): Promise<SocialPost[]> {
  const token = await pageToken(pageId, label, notes);
  const res = await attempt(`${label} · FB posts`, notes, () =>
    graph<{ data: Array<Record<string, unknown>> }>(
      `${pageId}/published_posts`,
      {
        fields:
          "id,message,created_time,permalink_url,shares,reactions.summary(true).limit(0),comments.summary(true).limit(0)",
        limit: "25",
      },
      token ?? undefined,
    ),
  );

  return (res?.data ?? [])
    .filter((p) => String(p.created_time ?? "").slice(0, 10) >= since)
    .map((p) => {
      const reactions =
        (p.reactions as { summary?: { total_count?: number } })?.summary
          ?.total_count ?? 0;
      const comments =
        (p.comments as { summary?: { total_count?: number } })?.summary
          ?.total_count ?? 0;
      const shares = (p.shares as { count?: number })?.count ?? 0;
      return {
        network: "facebook" as const,
        profile: label,
        id: String(p.id),
        caption: String(p.message ?? "").slice(0, 140),
        type: "POST",
        permalink: String(p.permalink_url ?? ""),
        timestamp: String(p.created_time ?? ""),
        likes: reactions,
        comments,
        shares,
        saves: 0,
        reach: 0,
        interactions: reactions + comments + shares,
      };
    });
}

export async function fetchSocial(range: DateRangeKey): Promise<SocialPayload> {
  const notes: string[] = [];
  const profiles = metaProfiles();
  const emptyAudience: SocialAudience = {
    cities: [],
    countries: [],
    age: [],
    gender: [],
  };
  const emptyAds: AdsSummary = {
    configured: false,
    campaigns: [],
    spend: 0,
    leads: 0,
    clicks: 0,
    impressions: 0,
    reach: 0,
  };

  if (!TOKEN || profiles.length === 0) {
    return {
      range,
      fetchedAt: new Date().toISOString(),
      configured: false,
      windowDays: 0,
      profiles: [],
      posts: [],
      audience: emptyAudience,
      ads: emptyAds,
      comments: [],
      hashtags: [],
      mentions: [],
      competitors: [],
      notes: [
        !TOKEN ? "META_ACCESS_TOKEN is not set." : "",
        profiles.length === 0
          ? "META_PROFILES is not set, or contains no profile with an Instagram account id or Page id."
          : "",
      ].filter(Boolean),
    };
  }

  // Meta caps insight queries at roughly a month; longer dashboard ranges
  // report the most recent 30 days and say so rather than quietly truncating.
  const requested = rangeDays(range);
  const days = Math.min(requested, 30);
  const until = format(new Date(), "yyyy-MM-dd");
  const since = format(subDays(new Date(), days), "yyyy-MM-dd");
  if (requested > days) {
    notes.push(
      `Meta limits insights to about 30 days per query, so this shows the last ${days} days rather than ${requested}.`,
    );
  }

  const built: SocialProfile[] = [];
  const allPosts: SocialPost[] = [];
  let audience = emptyAudience;

  for (const cfg of profiles) {
    if (cfg.igUserId) {
      built.push(await instagramProfile(cfg, since, until, notes));
      allPosts.push(
        ...(await instagramPosts(cfg.igUserId, cfg.label, since, notes)),
      );
      // Demographics are account-level; merging accounts would be
      // meaningless, so they come from the first Instagram profile.
      if (audience === emptyAudience) {
        audience = await instagramAudience(cfg.igUserId, cfg.label, notes);
      }
    }
    if (cfg.pageId) {
      built.push(await facebookProfile(cfg, since, until, notes));
      allPosts.push(
        ...(await facebookPosts(cfg.pageId, cfg.label, since, notes)),
      );
    }
  }

  allPosts.sort((a, b) => b.interactions - a.interactions);
  const topPosts = allPosts.slice(0, 20);

  // Paid, listening and benchmarking run alongside each other; each already
  // records its own failures, so one dead area never blocks the others.
  const { hashtags: wantedTags, competitors: wantedCompetitors } =
    listeningConfig();
  const firstIg = profiles.find((p) => p.igUserId);

  const [ads, comments, hashtags, mentions, competitors] = await Promise.all([
    fetchAds(since, until, notes),
    fetchComments(
      topPosts
        .filter((p) => p.network === "instagram")
        .slice(0, 8)
        .map((p) => ({ id: p.id, profile: p.profile, permalink: p.permalink })),
      notes,
    ),
    firstIg && wantedTags.length
      ? fetchHashtags(firstIg.igUserId as string, wantedTags, notes)
      : Promise.resolve([] as HashtagRow[]),
    firstIg
      ? fetchMentions(firstIg.igUserId as string, firstIg.label, notes)
      : Promise.resolve([] as MentionRow[]),
    firstIg && wantedCompetitors.length
      ? fetchCompetitors(firstIg.igUserId as string, wantedCompetitors, notes)
      : Promise.resolve([] as CompetitorRow[]),
  ]);

  return {
    range,
    fetchedAt: new Date().toISOString(),
    configured: true,
    windowDays: days,
    profiles: built,
    posts: topPosts,
    audience,
    ads,
    comments,
    hashtags,
    mentions,
    competitors,
    notes,
  };
}
