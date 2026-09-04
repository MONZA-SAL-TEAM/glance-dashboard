import { attempt, graph } from "./meta";
import type {
  CompetitorRow,
  HashtagRow,
  MentionRow,
  SocialComment,
} from "./types";

/**
 * The listening side of Meta: what people said on your posts, which
 * hashtags are working, who tagged you, and how public competitor accounts
 * compare.
 *
 * Each area carries a hard platform limit that the UI states plainly rather
 * than pretending away — see the comments on each function.
 */

export function listeningConfig() {
  const parse = (raw: string | undefined): string[] => {
    if (!raw) return [];
    try {
      const v = JSON.parse(raw);
      return Array.isArray(v) ? v.map(String) : [];
    } catch {
      // Also accept a plain comma-separated list.
      return raw.split(",").map((s) => s.trim()).filter(Boolean);
    }
  };
  return {
    hashtags: parse(process.env.META_HASHTAGS).map((h) => h.replace(/^#/, "")),
    competitors: parse(process.env.META_COMPETITORS).map((h) =>
      h.replace(/^@/, ""),
    ),
  };
}

/**
 * NOT CALLED from meta.ts. Kept for reference, not dead by accident.
 *
 * Comment text on recent posts. Failed with (#200) "provide valid app ID"
 * on every token tried, including one that carried the exact permission
 * this needs (instagram_manage_comments), which points at a System User
 * token limitation on this edge rather than a missing scope. Reading
 * individual customer comments is also a "listening" feature, outside the
 * read-only Social Media Analytics scope this dashboard is deliberately
 * kept to. Revisit only with a genuine reason to fetch comment text, and
 * test against a real (non-System-User) token first.
 */
export async function fetchComments(
  mediaIds: Array<{ id: string; profile: string; permalink: string }>,
  token: string,
  notes: string[],
): Promise<SocialComment[]> {
  const out: SocialComment[] = [];
  // Cap the fan-out: comment reads are per-media and rate limits are shared.
  for (const media of mediaIds.slice(0, 8)) {
    const res = await attempt(`${media.profile} · comments`, notes, () =>
      graph<{
        data: Array<{
          id: string;
          text?: string;
          username?: string;
          timestamp?: string;
          like_count?: number;
        }>;
      }>(`${media.id}/comments`, {
        fields: "id,text,username,timestamp,like_count",
        limit: "10",
      },
      token,
      ),
    );
    for (const c of res?.data ?? []) {
      out.push({
        id: c.id,
        profile: media.profile,
        permalink: media.permalink,
        username: c.username ?? "someone",
        text: (c.text ?? "").slice(0, 220),
        timestamp: c.timestamp ?? "",
        likes: c.like_count ?? 0,
      });
    }
  }
  out.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
  return out.slice(0, 40);
}

/**
 * Hashtag performance. Meta allows a rolling window of **30 unique hashtags
 * per 7 days per Instagram account**, so the configured list is capped and
 * the UI says how many slots are in use.
 */
export async function fetchHashtags(
  igUserId: string,
  tags: string[],
  token: string,
  notes: string[],
): Promise<HashtagRow[]> {
  const rows: HashtagRow[] = [];
  for (const tag of tags.slice(0, 10)) {
    const found = await attempt(`#${tag} lookup`, notes, () =>
      graph<{ data: Array<{ id: string }> }>("ig_hashtag_search", {
        user_id: igUserId,
        q: tag,
      },
      token,
      ),
    );
    const hashtagId = found?.data?.[0]?.id;
    if (!hashtagId) continue;

    const media = await attempt(`#${tag} top media`, notes, () =>
      graph<{
        data: Array<{
          id: string;
          caption?: string;
          like_count?: number;
          comments_count?: number;
          permalink?: string;
        }>;
      }>(`${hashtagId}/top_media`, {
        user_id: igUserId,
        fields: "id,caption,like_count,comments_count,permalink",
        limit: "12",
      },
      token,
      ),
    );

    const items = media?.data ?? [];
    rows.push({
      tag,
      topMediaCount: items.length,
      totalLikes: items.reduce((a, m) => a + (m.like_count ?? 0), 0),
      totalComments: items.reduce((a, m) => a + (m.comments_count ?? 0), 0),
      topPermalink: items[0]?.permalink ?? "",
    });
  }
  return rows.sort((a, b) => b.totalLikes - a.totalLikes);
}

/**
 * NOT CALLED from meta.ts. Kept for reference, not dead by accident.
 *
 * Media that tagged your account (`/tags`). Answered (#10) "no permission"
 * on every token tried across all three brands' Meta portfolios — the
 * signature of a capability gated behind Meta App Review, not a checkbox
 * missed during token generation. Mentions in captions/comments arrive by
 * webhook rather than query, so this only ever covered tagged media.
 */
export async function fetchMentions(
  igUserId: string,
  label: string,
  token: string,
  notes: string[],
): Promise<MentionRow[]> {
  const res = await attempt(`${label} · tagged media`, notes, () =>
    graph<{
      data: Array<{
        id: string;
        username?: string;
        caption?: string;
        permalink?: string;
        timestamp?: string;
        like_count?: number;
        comments_count?: number;
      }>;
    }>(`${igUserId}/tags`, {
      fields: "id,username,caption,permalink,timestamp,like_count,comments_count",
      limit: "15",
    },
    token,
    ),
  );
  return (res?.data ?? []).map((m) => ({
    id: m.id,
    username: m.username ?? "someone",
    caption: (m.caption ?? "").slice(0, 140),
    permalink: m.permalink ?? "",
    timestamp: m.timestamp ?? "",
    likes: m.like_count ?? 0,
    comments: m.comments_count ?? 0,
  }));
}

/**
 * Competitor benchmarking via `business_discovery`. Public Instagram
 * *business* accounts only, and Meta exposes just headline counts plus
 * recent public media — never their insights, reach or audience.
 */
export async function fetchCompetitors(
  igUserId: string,
  handles: string[],
  token: string,
  notes: string[],
): Promise<CompetitorRow[]> {
  const rows: CompetitorRow[] = [];
  for (const handle of handles.slice(0, 8)) {
    const res = await attempt(`competitor @${handle}`, notes, () =>
      graph<{
        business_discovery?: {
          username?: string;
          followers_count?: number;
          media_count?: number;
          media?: {
            data?: Array<{ like_count?: number; comments_count?: number }>;
          };
        };
      }>(igUserId, {
        fields: `business_discovery.username(${handle}){username,followers_count,media_count,media.limit(12){like_count,comments_count}}`,
      },
      token,
      ),
    );
    const bd = res?.business_discovery;
    if (!bd) continue;
    const media = bd.media?.data ?? [];
    const likes = media.reduce((a, m) => a + (m.like_count ?? 0), 0);
    const comments = media.reduce((a, m) => a + (m.comments_count ?? 0), 0);
    rows.push({
      handle: bd.username ?? handle,
      followers: bd.followers_count ?? 0,
      posts: bd.media_count ?? 0,
      recentLikes: likes,
      recentComments: comments,
      avgEngagementPerPost:
        media.length > 0 ? (likes + comments) / media.length : 0,
    });
  }
  return rows.sort((a, b) => b.followers - a.followers);
}
