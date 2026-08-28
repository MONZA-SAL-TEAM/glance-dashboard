import { format, subDays } from "date-fns";
import { rangeDays } from "./ranges";
import type {
  DateRangeKey,
  SocialAudience,
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

const API_VERSION = process.env.META_API_VERSION || "v21.0";
const TOKEN = process.env.META_ACCESS_TOKEN || "";

export interface MetaProfileConfig {
  label: string;
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
      }))
      .filter((p) => p.igUserId || p.pageId);
  } catch {
    return [];
  }
}

async function graph<T>(
  path: string,
  params: Record<string, string> = {},
): Promise<T> {
  const url = new URL(`https://graph.facebook.com/${API_VERSION}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("access_token", TOKEN);

  const res = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => ({}))) as {
    error?: { message?: string };
  };
  if (!res.ok || body.error) {
    const raw = body.error?.message || `HTTP ${res.status}`;
    throw new Error(TOKEN ? raw.split(TOKEN).join("[token]") : raw);
  }
  return body as T;
}

/** Runs a call, recording the reason instead of throwing. */
async function attempt<T>(
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

  // `views` superseded `impressions` for Instagram. Try the modern metric
  // set first and fall back, so this works on either API vintage.
  const modern = await attempt(`${cfg.label} · IG daily insights`, notes, () =>
    graph<{ data: InsightEntry[] }>(`${id}/insights`, {
      metric: "reach,views,profile_views,website_clicks,accounts_engaged",
      period: "day",
      since,
      until,
    }),
  );
  const legacy = modern
    ? null
    : await attempt(`${cfg.label} · IG daily insights (legacy)`, notes, () =>
        graph<{ data: InsightEntry[] }>(`${id}/insights`, {
          metric: "reach,impressions,profile_views,website_clicks",
          period: "day",
          since,
          until,
        }),
      );

  const byName = new Map(
    ((modern?.data ?? legacy?.data ?? []) as InsightEntry[]).map((e) => [
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
    reach: sumSeries(byName.get("reach")),
    views: sumSeries(viewsEntry),
    profileViews: sumSeries(byName.get("profile_views")),
    websiteClicks: sumSeries(byName.get("website_clicks")),
    engaged: sumSeries(byName.get("accounts_engaged")),
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

  const daily = await attempt(`${cfg.label} · FB page insights`, notes, () =>
    graph<{ data: InsightEntry[] }>(`${id}/insights`, {
      metric: "page_impressions_unique,page_post_engagements,page_fan_adds",
      period: "day",
      since,
      until,
    }),
  );
  const byName = new Map((daily?.data ?? []).map((e) => [e.name, e]));

  return {
    label: cfg.label,
    network: "facebook",
    handle: page?.name,
    followers: page?.followers_count ?? page?.fan_count ?? 0,
    posts: 0,
    reach: sumSeries(byName.get("page_impressions_unique")),
    views: 0,
    profileViews: 0,
    websiteClicks: 0,
    engaged: sumSeries(byName.get("page_post_engagements")),
    series: mergeSeries(
      seriesOf(byName.get("page_impressions_unique")),
      new Map(),
    ),
  };
}

async function facebookPosts(
  pageId: string,
  label: string,
  since: string,
  notes: string[],
): Promise<SocialPost[]> {
  const res = await attempt(`${label} · FB posts`, notes, () =>
    graph<{ data: Array<Record<string, unknown>> }>(
      `${pageId}/published_posts`,
      {
        fields:
          "id,message,created_time,permalink_url,shares,reactions.summary(true).limit(0),comments.summary(true).limit(0)",
        limit: "25",
      },
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

  if (!TOKEN || profiles.length === 0) {
    return {
      range,
      fetchedAt: new Date().toISOString(),
      configured: false,
      windowDays: 0,
      profiles: [],
      posts: [],
      audience: emptyAudience,
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

  return {
    range,
    fetchedAt: new Date().toISOString(),
    configured: true,
    windowDays: days,
    profiles: built,
    posts: allPosts.slice(0, 20),
    audience,
    notes,
  };
}
