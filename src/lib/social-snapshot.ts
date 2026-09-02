import { format, subDays } from "date-fns";
import { attempt, graph, metaProfiles, type MetaProfileConfig } from "./meta";
import { supabaseRpc } from "./signals";
import { CANONICAL_MODELS } from "./sites";

/**
 * The social snapshot engine — Glance's memory of Meta.
 *
 * Meta gives today's data and forgets: insight windows cap at roughly 30
 * days, and stories are gone from the API 24 hours after posting. Without
 * this, growth, "vs previous period", a content calendar and anomaly
 * detection are all impossible, because there is nothing to compare against.
 *
 * Two things make the first run unusually valuable:
 *  1. `reach` and `follower_count` come back as DAILY SERIES, so a first run
 *     backfills ~30 days of history immediately rather than starting empty.
 *  2. Stories captured today are the only copy that will ever exist.
 *
 * Every fetch is independent and failure-tolerant: a brand whose token is
 * broken, or a metric Meta has retired, records a note and costs that one
 * value — never the whole run. A snapshot job that fails atomically would
 * leave permanent holes in the history it exists to prevent.
 */

const CAPTURE_DAYS = 30; // Meta's practical insight ceiling.

interface InsightValue {
  value: number | Record<string, number>;
  end_time?: string;
}
interface InsightEntry {
  name: string;
  values?: InsightValue[];
  total_value?: { value?: number };
}

export interface ProfileDailyRow {
  profile_key: string;
  day: string;
  brand: string;
  network: "instagram" | "facebook";
  followers?: number;
  reach?: number;
  views?: number;
  profile_views?: number;
  website_clicks?: number;
  accounts_engaged?: number;
}

export interface PostRow {
  id: string;
  profile_key: string;
  brand: string;
  network: string;
  post_type?: string;
  caption?: string;
  permalink?: string;
  posted_at?: string;
  model?: string;
  captured_on: string;
  reach?: number;
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
  interactions?: number;
}

export interface StoryRow {
  id: string;
  profile_key: string;
  brand: string;
  story_type?: string;
  permalink?: string;
  posted_at?: string;
  views?: number;
  reach?: number;
  replies?: number;
  exits?: number;
  taps_forward?: number;
  taps_back?: number;
}

export interface AudienceRow {
  profile_key: string;
  day: string;
  brand: string;
  dimension: "city" | "country" | "age" | "gender" | "online_hour";
  label: string;
  value: number;
}

export interface SnapshotPayload {
  brands: string[];
  profile_daily: ProfileDailyRow[];
  posts: PostRow[];
  stories: StoryRow[];
  audience: AudienceRow[];
  days_backfilled: number;
  notes: string[];
  ok: boolean;
}

/** "<brand>:<network>" — stable across token rotation and account re-linking. */
export function profileKey(brand: string, network: string): string {
  return `${brand}:${network}`;
}

/**
 * Expand a Meta daily-series entry into date → value.
 *
 * Meta stamps each bucket with `end_time`, which is the START of the
 * following day in UTC — a value labelled 2026-09-03T07:00:00+0000 is
 * Tuesday the 2nd's number. Attributing it to the 3rd would shift the entire
 * history by one day and make every "vs yesterday" comparison wrong.
 */
export function seriesByDay(entry: InsightEntry | undefined): Map<string, number> {
  const out = new Map<string, number>();
  for (const v of entry?.values ?? []) {
    if (typeof v.value !== "number" || !v.end_time) continue;
    const end = new Date(v.end_time);
    if (Number.isNaN(end.getTime())) continue;
    out.set(format(subDays(end, 1), "yyyy-MM-dd"), v.value);
  }
  return out;
}

/** Total-value metrics answer with a single number, not a series. */
function totalOf(entry: InsightEntry | undefined): number | undefined {
  const v = entry?.total_value?.value;
  if (typeof v === "number") return v;
  if (entry?.values?.length) {
    return entry.values.reduce(
      (a, x) => a + (typeof x.value === "number" ? x.value : 0),
      0,
    );
  }
  return undefined;
}

/**
 * Best-effort model tagging from a caption. Reuses CANONICAL_MODELS so social
 * content groups by the same vocabulary as website signals and the demand
 * board — otherwise "which vehicle performs best" would answer differently
 * depending on which page you asked.
 *
 * Longest name first: "VOYAH Passion L" must win over "VOYAH Passion".
 */
export function modelFromCaption(caption: string | undefined): string | undefined {
  if (!caption) return undefined;
  const hay = caption.toLowerCase().replace(/[#_]/g, " ").replace(/\s+/g, " ");
  const ordered = [...CANONICAL_MODELS].sort((a, b) => b.length - a.length);
  for (const model of ordered) {
    if (hay.includes(model.toLowerCase())) return model;
    // "#voyahpassionl" — hashtags arrive without separators.
    if (hay.includes(model.toLowerCase().replace(/[\s+]/g, ""))) return model;
  }
  return undefined;
}

const isoDay = (d: Date) => format(d, "yyyy-MM-dd");

/**
 * Meta's `follower_count` is a DAILY DELTA, not a level — the number of
 * followers gained or lost that day. Plotting it directly would draw churn
 * on a chart labelled "followers".
 *
 * Only today's absolute count is known (from the account object), so each
 * earlier day's level is reconstructed by walking backwards and undoing the
 * deltas. Given today = 3560 and today's delta = +10, yesterday was 3550.
 *
 * Returns an empty map when the absolute count is unavailable: a follower
 * series anchored to a guess is worse than no series.
 */
export function reconstructFollowerLevels(
  todayCount: number | undefined,
  deltasByDay: Map<string, number>,
  today: string,
): Map<string, number> {
  const levels = new Map<string, number>();
  if (typeof todayCount !== "number") return levels;
  levels.set(today, todayCount);
  let running = todayCount;
  // Newest first: subtract each day's own delta to get the previous day.
  for (const day of [...deltasByDay.keys()].sort().reverse()) {
    running -= deltasByDay.get(day) ?? 0;
    const previous = format(subDays(new Date(`${day}T00:00:00Z`), 1), "yyyy-MM-dd");
    levels.set(previous, running);
  }
  return levels;
}

async function instagramSnapshot(
  cfg: MetaProfileConfig,
  since: string,
  until: string,
  today: string,
  out: SnapshotPayload,
): Promise<void> {
  const id = cfg.igUserId as string;
  const key = profileKey(cfg.brand, "instagram");

  const account = await attempt(`${cfg.label} · IG account`, out.notes, () =>
    graph<{ followers_count?: number }>(
      id,
      { fields: "followers_count" },
      cfg.token,
    ),
  );

  // Daily series — the backfill. reach and follower_count both support
  // period=day with since/until, so one call yields ~30 days of history.
  const series = await attempt(`${cfg.label} · IG daily series`, out.notes, () =>
    graph<{ data: InsightEntry[] }>(
      `${id}/insights`,
      { metric: "reach,follower_count", period: "day", since, until },
      cfg.token,
    ),
  );
  const byName = new Map((series?.data ?? []).map((e) => [e.name, e]));
  const reachByDay = seriesByDay(byName.get("reach"));
  const followersByDay = seriesByDay(byName.get("follower_count"));

  const levels = reconstructFollowerLevels(
    account?.followers_count,
    followersByDay,
    today,
  );

  // Totals for today only (Meta serves these as a window aggregate).
  const totals = await attempt(`${cfg.label} · IG totals`, out.notes, () =>
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
  const totalByName = new Map((totals?.data ?? []).map((e) => [e.name, e]));

  const days = new Set([...reachByDay.keys(), ...levels.keys()]);
  for (const day of days) {
    out.profile_daily.push({
      profile_key: key,
      day,
      brand: cfg.brand,
      network: "instagram",
      followers: levels.get(day),
      reach: reachByDay.get(day),
      // Window aggregates belong to the day they were captured, not to
      // every day in the series.
      views: day === today ? totalOf(totalByName.get("views")) : undefined,
      profile_views:
        day === today ? totalOf(totalByName.get("profile_views")) : undefined,
      website_clicks:
        day === today ? totalOf(totalByName.get("website_clicks")) : undefined,
      accounts_engaged:
        day === today ? totalOf(totalByName.get("accounts_engaged")) : undefined,
    });
  }
  out.days_backfilled = Math.max(out.days_backfilled, days.size);

  // Content
  const media = await attempt(`${cfg.label} · IG media`, out.notes, () =>
    graph<{ data: Array<Record<string, string | number>> }>(
      `${id}/media`,
      {
        fields:
          "id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count",
        limit: "50",
      },
      cfg.token,
    ),
  );
  for (const m of media?.data ?? []) {
    const postId = String(m.id);
    const insights = await attempt(
      `${cfg.label} · IG post insights`,
      out.notes,
      () =>
        graph<{ data: InsightEntry[] }>(
          `${postId}/insights`,
          { metric: "reach,views,total_interactions,saved,shares" },
          cfg.token,
        ),
    );
    const pm = new Map((insights?.data ?? []).map((e) => [e.name, e]));
    const caption = m.caption ? String(m.caption) : undefined;
    out.posts.push({
      id: postId,
      profile_key: key,
      brand: cfg.brand,
      network: "instagram",
      post_type: String(m.media_product_type ?? m.media_type ?? ""),
      caption,
      permalink: m.permalink ? String(m.permalink) : undefined,
      posted_at: m.timestamp ? String(m.timestamp) : undefined,
      model: modelFromCaption(caption),
      captured_on: today,
      reach: totalOf(pm.get("reach")),
      views: totalOf(pm.get("views")),
      likes: Number(m.like_count) || 0,
      comments: Number(m.comments_count) || 0,
      shares: totalOf(pm.get("shares")),
      saves: totalOf(pm.get("saved")),
      interactions: totalOf(pm.get("total_interactions")),
    });
  }

  // Stories — the only chance to record these before they expire.
  const stories = await attempt(`${cfg.label} · IG stories`, out.notes, () =>
    graph<{ data: Array<Record<string, string>> }>(
      `${id}/stories`,
      { fields: "id,media_type,permalink,timestamp" },
      cfg.token,
    ),
  );
  for (const st of stories?.data ?? []) {
    const storyId = String(st.id);
    const si = await attempt(`${cfg.label} · IG story insights`, out.notes, () =>
      graph<{ data: InsightEntry[] }>(
        `${storyId}/insights`,
        { metric: "views,reach,replies,navigation" },
        cfg.token,
      ),
    );
    const sm = new Map((si?.data ?? []).map((e) => [e.name, e]));
    out.stories.push({
      id: storyId,
      profile_key: key,
      brand: cfg.brand,
      story_type: st.media_type,
      permalink: st.permalink,
      posted_at: st.timestamp,
      views: totalOf(sm.get("views")),
      reach: totalOf(sm.get("reach")),
      replies: totalOf(sm.get("replies")),
    });
  }

  // Audience demographics + when followers are actually online.
  for (const [breakdown, dimension] of [
    ["city", "city"],
    ["country", "country"],
    ["age", "age"],
    ["gender", "gender"],
  ] as const) {
    const demo = await attempt(
      `${cfg.label} · IG audience (${breakdown})`,
      out.notes,
      () =>
        graph<{
          data: Array<{
            total_value?: {
              breakdowns?: Array<{
                results?: Array<{ dimension_values: string[]; value: number }>;
              }>;
            };
          }>;
        }>(
          `${id}/insights`,
          {
            metric: "follower_demographics",
            period: "lifetime",
            metric_type: "total_value",
            breakdown,
          },
          cfg.token,
        ),
    );
    for (const row of demo?.data?.[0]?.total_value?.breakdowns?.[0]?.results ??
      []) {
      out.audience.push({
        profile_key: key,
        day: today,
        brand: cfg.brand,
        dimension,
        label: row.dimension_values?.[0] ?? "unknown",
        value: row.value,
      });
    }
  }

  const online = await attempt(`${cfg.label} · IG online followers`, out.notes, () =>
    graph<{ data: InsightEntry[] }>(
      `${id}/insights`,
      { metric: "online_followers", period: "lifetime" },
      cfg.token,
    ),
  );
  const hourly = online?.data?.[0]?.values?.[online.data[0].values!.length - 1];
  if (hourly && typeof hourly.value === "object") {
    for (const [hour, value] of Object.entries(hourly.value)) {
      out.audience.push({
        profile_key: key,
        day: today,
        brand: cfg.brand,
        dimension: "online_hour",
        label: hour,
        value: Number(value) || 0,
      });
    }
  }
}

async function facebookSnapshot(
  cfg: MetaProfileConfig,
  today: string,
  out: SnapshotPayload,
): Promise<void> {
  const id = cfg.pageId as string;
  const key = profileKey(cfg.brand, "facebook");

  const page = await attempt(`${cfg.label} · FB page`, out.notes, () =>
    graph<{ followers_count?: number; fan_count?: number }>(
      id,
      { fields: "followers_count,fan_count" },
      cfg.token,
    ),
  );

  out.profile_daily.push({
    profile_key: key,
    day: today,
    brand: cfg.brand,
    network: "facebook",
    followers: page?.followers_count ?? page?.fan_count,
  });
}

/**
 * Capture one snapshot across every configured brand and write it to the
 * warehouse. Brands are independent: one broken token records a note and
 * costs that brand's numbers, never the run.
 */
export async function runSocialSnapshot(): Promise<{
  stored: Record<string, number>;
  payload: SnapshotPayload;
}> {
  const profiles = metaProfiles();
  const now = new Date();
  const today = isoDay(now);
  const payload: SnapshotPayload = {
    brands: [...new Set(profiles.map((p) => p.brand))],
    profile_daily: [],
    posts: [],
    stories: [],
    audience: [],
    days_backfilled: 0,
    notes: [],
    ok: true,
  };

  if (profiles.length === 0) {
    payload.ok = false;
    payload.notes.push("No Meta profiles configured — nothing to snapshot.");
    return { stored: {}, payload };
  }

  const since = isoDay(subDays(now, CAPTURE_DAYS));
  const until = today;

  for (const cfg of profiles) {
    if (cfg.igUserId) {
      await instagramSnapshot(cfg, since, until, today, payload);
    }
    if (cfg.pageId) {
      await facebookSnapshot(cfg, today, payload);
    }
  }

  const token = process.env.GLANCE_SIGNALS_TOKEN;
  const stored = await supabaseRpc<Record<string, number>>(
    "social_snapshot_ingest",
    {
      p_payload: payload,
      ...(token ? { p_token: token } : {}),
    },
  );
  return { stored, payload };
}
