import { classifySource, isSocial, SOCIAL_PLATFORMS } from "../src/lib/sources";

// Real GA4 sessionSource / sessionMedium pairs. Meta's link shims
// (l.instagram.com, l.facebook.com, lm.facebook.com) are what actually shows
// up in the reports far more often than the clean platform names.
const cases: Array<[string, string, string]> = [
  // Instagram, every spelling GA4 emits
  ["instagram", "referral", "Instagram"],
  ["l.instagram.com", "referral", "Instagram"],
  ["instagram.com", "referral", "Instagram"],
  ["ig", "social", "Instagram"],
  ["instagram", "paid_social", "Instagram"],
  ["Instagram", "Referral", "Instagram"],
  // Facebook
  ["facebook", "referral", "Facebook"],
  ["m.facebook.com", "referral", "Facebook"],
  ["l.facebook.com", "referral", "Facebook"],
  ["lm.facebook.com", "referral", "Facebook"],
  ["fb", "social", "Facebook"],
  ["fb.me", "referral", "Facebook"],
  // Others
  ["tiktok", "referral", "TikTok"],
  ["whatsapp", "referral", "WhatsApp"],
  ["com.whatsapp", "referral", "WhatsApp"],
  ["google", "organic", "Google"],
  ["google", "cpc", "Google"],
  ["youtube.com", "referral", "Google"],
  // Direct / unattributed
  ["(direct)", "(none)", "Direct"],
  ["", "", "Direct"],
  ["(not set)", "(not set)", "Direct"],
  // Anything else
  ["bing", "organic", "Other"],
  ["yallamotor.com", "referral", "Other"],
  ["linkedin.com", "referral", "Other"],
];

let pass = 0;
const failures: string[] = [];
for (const [source, medium, expected] of cases) {
  const got = classifySource(source, medium);
  if (got === expected) pass++;
  else failures.push(`  "${source}" / "${medium}" -> ${got}, expected ${expected}`);
}
console.log(`source classification: ${pass}/${cases.length} passed`);
if (failures.length) {
  console.log("FAILURES:");
  console.log(failures.join("\n"));
  process.exit(1);
}

// A platform counted as social must be one the social tiles render, or its
// sessions would vanish between the rollup and the panel.
const socialFromCases = new Set(
  cases
    .map(([s, m]) => classifySource(s, m))
    .filter((p) => isSocial(p)),
);
const unrendered = [...socialFromCases].filter(
  (p) => !SOCIAL_PLATFORMS.includes(p),
);
if (unrendered.length) {
  console.log(`FAIL: social platforms not in SOCIAL_PLATFORMS: ${unrendered.join(", ")}`);
  process.exit(1);
}
console.log(`social coverage: ${socialFromCases.size} platforms all rendered — OK`);

// Google must never be classified as social: it would inflate the "social
// sent X% of sessions" line with organic search.
if (isSocial(classifySource("google", "organic"))) {
  console.log("FAIL: google classified as social");
  process.exit(1);
}
console.log("google is not social — OK");
