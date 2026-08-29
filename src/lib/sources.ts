/**
 * GA4 reports a traffic source as a raw string, and the same platform arrives
 * spelled several ways: "instagram", "l.instagram.com", "ig"; "facebook",
 * "m.facebook.com", "fb". Left alone they rank as separate rows, so no single
 * number ever says how much traffic Instagram sent. This folds the spellings
 * into one platform each.
 *
 * Instagram and Facebook stay separate even though Meta owns both — they are
 * different audiences posting different content, and merging them would hide
 * which one actually works.
 */

export const PLATFORMS = [
  "Instagram",
  "Facebook",
  "TikTok",
  "WhatsApp",
  "Google",
  "Direct",
  "Other",
] as const;

export type Platform = (typeof PLATFORMS)[number];

/** Platforms reported in the social section, Meta first — those are the
 * accounts Monza actually runs. */
export const SOCIAL_PLATFORMS: readonly Platform[] = [
  "Instagram",
  "Facebook",
  "TikTok",
  "WhatsApp",
] as const;

// Order matters: the first match wins, so the specific patterns lead.
const RULES: ReadonlyArray<{ test: RegExp; platform: Platform }> = [
  { test: /instagram|\big\b/, platform: "Instagram" },
  { test: /facebook|\bfb\b|fb\.me/, platform: "Facebook" },
  { test: /tiktok|bytedance/, platform: "TikTok" },
  { test: /whatsapp|wa\.me/, platform: "WhatsApp" },
  { test: /^google|googleads|youtube|doubleclick/, platform: "Google" },
];

/**
 * Classify one GA4 (source, medium) pair. Medium is included in the haystack
 * because paid social often carries the platform only in the medium.
 */
export function classifySource(source: string, medium: string): Platform {
  const s = (source || "").trim().toLowerCase();
  const m = (medium || "").trim().toLowerCase();
  // GA4 writes unattributed traffic as "(direct)" / "(none)".
  if (!s || s === "(direct)" || s === "(not set)") return "Direct";
  const haystack = `${s} ${m}`;
  for (const rule of RULES) {
    if (rule.test.test(haystack)) return rule.platform;
  }
  return "Other";
}

export function isSocial(platform: Platform): boolean {
  return SOCIAL_PLATFORMS.includes(platform);
}
