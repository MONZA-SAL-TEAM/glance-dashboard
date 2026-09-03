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
  SocialMetric,
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

/**
 * Read at call time, not captured at module load. A module-level constant is
 * evaluated once on import, so anything that populates the environment later
 * — a test harness, a lazily-loaded server bundle — sees an empty token and
 * fails as though nothing were configured.
 */
function defaultToken(): string {
  return process.env.META_ACCESS_TOKEN || "";
}

export interface MetaProfileConfig {
  label: string;
  /** Which Social view this profile belongs to — one view per brand. */
  brand: string;
  /**
   * The token this profile authenticates with. Brands that live in separate
   * Meta business portfolios cannot share one: a token issued in the VOYAH
   * portfolio has no visibility of MHERO's Page whatever it is scoped to.
   */
  token: string;
  /** Marketing API ad account, e.g. act_1234567890. */
  adAccountId?: string;
  /** Instagram Business/Creator account id — not the @handle. */
  igUserId?: string;
  /** Facebook Page id. */
  pageId?: string;
}

/** "VOYAH Lebanon" -> "voyah". Only used when `brand` is absent. */
function brandSlug(label: string): string {
  return (
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .split(" ")[0] || "social"
  );
}

/**
 * Every variable holding profile config, in a stable order: META_PROFILES
 * first, then any META_PROFILES_* suffix sorted by name.
 *
 * A second brand is added by setting its OWN variable, never by rewriting
 * the first. These values are normally stored as Vercel secrets, whose
 * contents cannot be read back — so "append a brand" would otherwise mean
 * retyping a working brand's ids from memory and hoping nothing was lost.
 * Splitting them also keeps each brand's assets beside its own token_env,
 * which is how Monza's two Meta portfolios are actually separated.
 */
function profileSources(): string[] {
  const suffixed = Object.keys(process.env)
    .filter((k) => k.startsWith("META_PROFILES_"))
    .sort();
  return ["META_PROFILES", ...suffixed]
    .map((k) => process.env[k])
    .filter((v): v is string => Boolean(v && v.trim()));
}

/** META_PROFILES mirrors the GA_PROPERTIES pattern already used for GA4. */
export function metaProfiles(): MetaProfileConfig[] {
  const sources = profileSources();
  if (!sources.length) return [];
  const parsed: Array<Record<string, string>> = [];
  for (const raw of sources) {
    try {
      const one = JSON.parse(raw) as unknown;
      // A single object is accepted as well as an array: a per-brand variable
      // holds one brand, and requiring [] around it invites a silent typo.
      if (Array.isArray(one)) parsed.push(...(one as Array<Record<string, string>>));
      else if (one && typeof one === "object") parsed.push(one as Record<string, string>);
    } catch {
      // One malformed variable must not blank out every other brand — that
      // would turn a typo in a new brand into an outage for a working one.
      continue;
    }
  }
  try {
    return parsed
      .map((p) => {
        const label = p.label || p.name || "Profile";
        // token_env names the variable, never the value: a token pasted into
        // META_PROFILES would sit in a field this code logs and renders.
        const tokenEnv = p.token_env || p.tokenEnv;
        const token =
          (tokenEnv ? process.env[tokenEnv] : undefined) || defaultToken();
        return {
          label,
          brand: (p.brand || brandSlug(label)).toLowerCase(),
          token,
          igUserId: p.ig_user_id || p.igUserId,
          pageId: p.page_id || p.pageId,
          adAccountId: p.ad_account_id || p.adAccountId,
        };
      })
      .filter((p) => (p.igUserId || p.pageId || p.adAccountId) && p.token);
  } catch {
    return [];
  }
}

/** The Social views to offer, one per brand, in META_PROFILES order. */
export function socialBrands(): Array<{ brand: string; label: string }> {
  const seen = new Map<string, string>();
  for (const p of metaProfiles()) {
    if (seen.has(p.brand)) continue;
    // "VOYAH Lebanon" -> "VOYAH": the view covers the brand, not one account.
    seen.set(p.brand, p.label.split(" ")[0] || p.label);
  }
  return [...seen.entries()].map(([brand, label]) => ({ brand, label }));
}

/**
 * Every value that must never reach the browser: the token in play plus any
 * META_ACCESS_TOKEN* variable, so adding a second brand's token cannot
 * quietly opt it out of scrubbing. Short values are ignored — a blank or
 * placeholder would otherwise match everywhere and mangle the message.
 */
function knownSecrets(active?: string): string[] {
  const out = new Set<string>();
  if (active && active.length > 20) out.add(active);
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith("META_ACCESS_TOKEN")) continue;
    if (value && value.length > 20) out.add(value);
  }
  return [...out];
}

export async function graph<T>(
  path: string,
  params: Record<string, string> = {},
  /** Page-scoped token for the endpoints Meta refuses to serve to a
   * user or system-user token — Page insights and published_posts both
   * answer (#210) without one. */
  token: string = defaultToken(),
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
    // Every configured token, since the note this becomes is rendered in the
    // browser and Meta echoes the offending token back in some errors.
    for (const secret of knownSecrets(token)) {
      raw = raw.split(secret).join("[token]");
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
    }>(id, { fields: "username,followers_count,media_count" }, cfg.token),
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
      graph<{ data: InsightEntry[] }>(
        `${id}/insights`,
        { metric: "reach", period: "day", since, until },
        cfg.token,
      ),
  );

  const totals = await attempt(`${cfg.label} · IG totals`, notes, () =>
    graph<{ data: InsightEntry[] }>(
      `${id}/insights`,
      {
        metric: "views,profile_views,website_clicks,accounts_engaged",
        metric_type: "total_value",
        period: "day",
        since,
        until,
      },
      cfg.token,
    ),
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
  token: string,
  notes: string[],
): Promise<SocialAudience> {
  const pull = async (breakdown: string): Promise<SocialAudienceRow[]> => {
    const res = await attempt(
      `${label} · IG audience (${breakdown})`,
      notes,
      () =>
        graph<{ data: InsightEntry[] }>(
          `${igUserId}/insights`,
          {
            metric: "follower_demographics",
            period: "lifetime",
            metric_type: "total_value",
            breakdown,
          },
          token,
        ),
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
  token: string,
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
      token,
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
          graph<{ data: InsightEntry[] }>(
            `${m.id}/insights`,
            { metric: "reach,total_interactions,saved,shares" },
            token,
          ),
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
  userToken: string,
  notes: string[],
): Promise<string | null> {
  const key = `${pageId}:${userToken.slice(-12)}`;
  const cached = pageTokens.get(key);
  if (cached) return cached;
  const pending = attempt(`${label} · FB page token`, notes, () =>
    graph<{ access_token?: string }>(
      pageId,
      { fields: "access_token" },
      userToken,
    ),
  ).then((res) => {
    // A SUCCESSFUL call that carries no token is the same silent shape that
    // hid the online_followers bug: attempt() records only throws, so this
    // would return null without a word. Page insights then fall back to the
    // system-user token and answer (#100) "must be a valid insights metric",
    // which reads as a retired metric name when the real problem is the
    // credential. Meta still documents most of those names as valid, so that
    // misreading is easy to make. Never log the token itself — only whether
    // one came back.
    if (res && !res.access_token) {
      notes.push(
        `${label} · FB page token — request succeeded but returned no ` +
          `access_token; Page insights fall back to the user token and may ` +
          `report (#100)`,
      );
    }
    return res?.access_token ?? null;
  });
  pageTokens.set(key, pending);
  return pending;
}

/**
 * Which Facebook-related permissions this token lacks, cached per token.
 *
 * Worth checking because the symptom is silent: Page insights without
 * read_insights are ACCEPTED and answer with an empty data array, so the
 * failure is indistinguishable from a retired metric unless you ask.
 * Permission names are not secrets; the token is never logged.
 */
const permissionCache = new Map<string, Promise<string[]>>();

function missingPagePermissions(token: string): Promise<string[]> {
  const key = token.slice(-12);
  const cached = permissionCache.get(key);
  if (cached) return cached;
  const wanted = ["read_insights", "pages_read_user_content"];
  const pending = attempt<{
    data: Array<{ permission: string; status: string }>;
  }>("meta permissions", [], () =>
    graph<{ data: Array<{ permission: string; status: string }> }>(
      "me/permissions",
      {},
      token,
    ),
  ).then((res) => {
    // Unknown is not the same as missing: if the check itself fails, claim
    // nothing rather than blame a permission that may well be granted.
    if (!res?.data) return [];
    const granted = new Set(
      res.data.filter((x) => x.status === "granted").map((x) => x.permission),
    );
    return wanted.filter((w) => !granted.has(w));
  });
  permissionCache.set(key, pending);
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
  // Why each candidate did not answer, kept per metric. Reporting only the
  // LAST one — as this did — means three candidates can fail for reasons
  // nobody ever sees, and the group looks uniformly retired when it is not.
  const problems: string[] = [];
  for (const metric of candidates) {
    const res = await attempt(`${label} · FB ${metric}`, quiet, () =>
      graph<{ data: InsightEntry[] }>(
        `${pageId}/insights`,
        { metric, period: "day", since, until },
        token ?? undefined,
      ),
    );
    if (!res) {
      const raw = quiet[quiet.length - 1] ?? "";
      problems.push(`${metric}: ${raw.split(" — ").slice(1).join(" — ") || "failed"}`);
      continue;
    }
    const entry = res.data?.[0];
    if (entry) return entry;
    // A SUCCESSFUL call carrying an empty data array is not a retired metric,
    // but it was being reported as one. Same shape that hid online_followers.
    problems.push(`${metric}: request succeeded but returned no data`);
  }
  // One line when every candidate failed the same way; per-metric detail the
  // moment they diverge, since the divergence is the useful part.
  const distinct = [
    ...new Set(problems.map((p) => p.split(": ").slice(1).join(": "))),
  ];
  const detail =
    distinct.length === 1
      ? distinct[0]
      : problems.join(" · ") || "no metric in this group is currently valid";
  notes.push(`${label} · FB ${candidates.join(" / ")} — ${detail}`);
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
    graph<{ name?: string; followers_count?: number; fan_count?: number }>(
      id,
      { fields: "name,followers_count,fan_count" },
      cfg.token,
    ),
  );

  const token = await pageToken(id, cfg.label, cfg.token, notes);

  // TEMPORARY probe — which Pages can this token see, and does any of them
  // have an Instagram account linked? Remove once answered.
  //
  // @mherolebanon (3,175 followers) and @monzasal.official (1,364) exist but
  // are invisible to Glance because no Instagram id is configured. Business
  // Settings would show the ids, but it demands an SMS code that is Samer's
  // to enter. This asks the token instead, which needs no 2FA.
  //
  // Worth doing because the earlier check looked at ONE Page, and the MHERO
  // portfolio has two — the Instagram may simply be linked to the other one.
  const acctNotes: string[] = [];
  const accts = await attempt(`${cfg.label} · FB accounts`, acctNotes, () =>
    graph<{
      data: Array<{
        id: string;
        name?: string;
        instagram_business_account?: { id?: string; username?: string };
      }>;
    }>(
      "me/accounts",
      { fields: "id,name,instagram_business_account{id,username}" },
      cfg.token,
    ),
  );
  if (accts) {
    const lines = (accts.data ?? []).map((pg) => {
      const ig = pg.instagram_business_account;
      return `${pg.name ?? "?"} (${pg.id})${
        ig?.id ? ` -> IG @${ig.username ?? "?"} id=${ig.id}` : " -> no IG linked"
      }`;
    });
    notes.push(
      `${cfg.label} · FB pages visible to this token — ${
        lines.join(" | ") || "none"
      }`,
    );
  }

  // Facebook Page insights require read_insights. Without it Meta ACCEPTS
  // every valid metric name and answers with an EMPTY data array rather than
  // an error — which is exactly why this read as "Meta retired the Page
  // metrics" for so long. Verified on both brands: instagram_manage_insights
  // is granted, so Instagram works, while read_insights is not.
  //
  // Reported only when actually missing, so the note names the fix instead of
  // leaving four cryptic errors to interpret.
  const missing = await missingPagePermissions(cfg.token);
  if (missing.length) {
    notes.push(
      `${cfg.label} · FB permissions — this token is missing ${missing.join(
        " and ",
      )}. Facebook Page insights return no data without read_insights (Meta ` +
        `accepts the metric names and answers empty), and posts need ` +
        `pages_read_user_content. Instagram is unaffected.`,
    );
  }

  const [reachEntry, engagedEntry] = await Promise.all([
    facebookMetric(
      id,
      // Meta retired the whole page_impressions family and renamed the
      // concept to "media view": page_impressions_unique ->
      // page_total_media_view_unique, page_impressions -> page_media_view
      // (deprecations completing through 2026). The retired names stay at
      // the end of the list so an older API version still answers.
      [
        "page_total_media_view_unique",
        "page_media_view",
        "page_impressions_unique",
        "page_impressions",
      ],
      cfg.label,
      since,
      until,
      token,
      notes,
    ),
    facebookMetric(
      id,
      // Meta published no direct replacement for the engagement metrics, so
      // this is a best-effort list; when every candidate fails the panel
      // says so in its notes rather than showing a confident zero.
      ["page_post_engagements", "page_content_activity", "page_total_actions"],
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

  // Every candidate for a metric failing is not the same as the metric being
  // zero. Meta retired the page_impressions family, so these calls come back
  // (#100) "must be a valid insights metric" and the totals below would read 0 —
  // a confident claim that nobody was reached.
  const unavailable: SocialMetric[] = [];
  if (!byName.has("reach")) unavailable.push("reach");
  if (!byName.has("engaged")) unavailable.push("engaged");

  return {
    label: cfg.label,
    network: "facebook",
    handle: page?.name,
    followers: page?.followers_count ?? page?.fan_count ?? 0,
    posts: 0,
    unavailable: unavailable.length ? unavailable : undefined,
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
  userToken: string,
  notes: string[],
): Promise<SocialPost[]> {
  const token = await pageToken(pageId, label, userToken, notes);
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

/**
 * One brand's Social view. Brands live in separate Meta business portfolios
 * with separate tokens, so they are fetched apart rather than merged — a
 * combined follower count across two unrelated brands answers no question
 * anyone has, and one brand's broken token would take the other down.
 */
export async function fetchSocial(
  range: DateRangeKey,
  brand?: string,
): Promise<SocialPayload> {
  const notes: string[] = [];
  const all = metaProfiles();
  const profiles = brand ? all.filter((p) => p.brand === brand) : all;
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

  if (profiles.length === 0) {
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
        !defaultToken() && !all.length
          ? "META_ACCESS_TOKEN is not set."
          : "",
        brand && all.length
          ? `No profile in META_PROFILES has brand "${brand}".`
          : "META_PROFILES is not set, or contains no profile with an Instagram account id or Page id, or the profile's token variable is empty.",
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
        ...(await instagramPosts(
          cfg.igUserId,
          cfg.label,
          since,
          cfg.token,
          notes,
        )),
      );
      // Demographics are account-level; merging accounts would be
      // meaningless, so they come from the first Instagram profile.
      if (audience === emptyAudience) {
        audience = await instagramAudience(
          cfg.igUserId,
          cfg.label,
          cfg.token,
          notes,
        );
      }
    }
    if (cfg.pageId) {
      built.push(await facebookProfile(cfg, since, until, notes));
      allPosts.push(
        ...(await facebookPosts(
          cfg.pageId,
          cfg.label,
          since,
          cfg.token,
          notes,
        )),
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
    fetchAds(profiles, since, until, notes),
    fetchComments(
      topPosts
        .filter((p) => p.network === "instagram")
        .slice(0, 8)
        .map((p) => ({ id: p.id, profile: p.profile, permalink: p.permalink })),
      firstIg?.token ?? "",
      notes,
    ),
    firstIg && wantedTags.length
      ? fetchHashtags(firstIg.igUserId as string, wantedTags, firstIg.token, notes)
      : Promise.resolve([] as HashtagRow[]),
    firstIg
      ? fetchMentions(
          firstIg.igUserId as string,
          firstIg.label,
          firstIg.token,
          notes,
        )
      : Promise.resolve([] as MentionRow[]),
    firstIg && wantedCompetitors.length
      ? fetchCompetitors(
          firstIg.igUserId as string,
          wantedCompetitors,
          firstIg.token,
          notes,
        )
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
