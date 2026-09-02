import { metaProfiles, socialBrands } from "../src/lib/meta";
import { instagramSignalsForBrand } from "../src/lib/sites";

/** metaProfiles/socialBrands read process.env at call time, so each case
 * sets the environment and re-reads rather than importing a snapshot. */
function withEnv(env: Record<string, string | undefined>, fn: () => void) {
  const saved: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(env)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

let failures = 0;
function check(name: string, cond: boolean) {
  if (cond) console.log(`  ok   ${name}`);
  else {
    console.log(`  FAIL ${name}`);
    failures++;
  }
}

const VOYAH_TOKEN = "voyah_token_that_is_long_enough_to_count";
const MHERO_TOKEN = "mhero_token_that_is_long_enough_to_count";

console.log("two brands, separate tokens:");
withEnv(
  {
    META_ACCESS_TOKEN: VOYAH_TOKEN,
    META_ACCESS_TOKEN_MHERO: MHERO_TOKEN,
    META_PROFILES: JSON.stringify([
      { label: "VOYAH Lebanon", ig_user_id: "1", page_id: "2" },
      {
        label: "MHERO Lebanon",
        ig_user_id: "3",
        page_id: "4",
        token_env: "META_ACCESS_TOKEN_MHERO",
      },
    ]),
  },
  () => {
    const p = metaProfiles();
    check("both profiles parsed", p.length === 2);
    check("VOYAH brand derived from label", p[0].brand === "voyah");
    check("MHERO brand derived from label", p[1].brand === "mhero");
    check("VOYAH uses the default token", p[0].token === VOYAH_TOKEN);
    check("MHERO uses its own token", p[1].token === MHERO_TOKEN);
    const brands = socialBrands();
    check("one view per brand", brands.length === 2);
    check("view labels are brand names", brands[0].label === "VOYAH" && brands[1].label === "MHERO");
  },
);

console.log("a profile whose token variable is empty:");
withEnv(
  {
    META_ACCESS_TOKEN: undefined,
    META_ACCESS_TOKEN_MHERO: undefined,
    META_PROFILES: JSON.stringify([
      { label: "MHERO Lebanon", ig_user_id: "3", token_env: "META_ACCESS_TOKEN_MHERO" },
    ]),
  },
  () => {
    // Better to drop it than to call Meta with an empty token and render
    // an authentication error as though the account itself were broken.
    check("dropped rather than called with no token", metaProfiles().length === 0);
  },
);

console.log("an explicit brand overrides the label:");
withEnv(
  {
    META_ACCESS_TOKEN: VOYAH_TOKEN,
    META_PROFILES: JSON.stringify([
      { label: "Monza SAL Official", ig_user_id: "9", brand: "monza" },
    ]),
  },
  () => {
    check("explicit brand wins", metaProfiles()[0].brand === "monza");
  },
);

console.log("two profiles sharing one brand:");
withEnv(
  {
    META_ACCESS_TOKEN: VOYAH_TOKEN,
    META_PROFILES: JSON.stringify([
      { label: "VOYAH Lebanon", ig_user_id: "1" },
      { label: "VOYAH Lebanon Showroom", page_id: "2", brand: "voyah" },
    ]),
  },
  () => {
    check("still one view", socialBrands().length === 1);
    check("both profiles kept", metaProfiles().length === 2);
  },
);

console.log("a brand is added by its OWN variable, never by rewriting another:");
// These are stored as Vercel secrets, which cannot be read back. If a second
// brand had to be appended to META_PROFILES, adding MHERO would mean retyping
// VOYAH's ids from memory over a value nobody can diff.
withEnv(
  {
    META_ACCESS_TOKEN: VOYAH_TOKEN,
    META_ACCESS_TOKEN_MHERO: "mhero-token-longer-than-twenty-chars",
    META_PROFILES: JSON.stringify([{ label: "VOYAH Lebanon", ig_user_id: "1" }]),
    META_PROFILES_MHERO: JSON.stringify({
      label: "MHERO Lebanon",
      brand: "mhero",
      page_id: "419538711242175",
      token_env: "META_ACCESS_TOKEN_MHERO",
    }),
  },
  () => {
    const profiles = metaProfiles();
    check("both brands present", profiles.length === 2);
    check("the untouched brand still resolves", profiles[0].igUserId === "1");
    check("the added brand resolves", profiles[1].pageId === "419538711242175");
    check("each keeps its own token", profiles[0].token !== profiles[1].token);
    check("a bare object needs no array wrapper", profiles[1].brand === "mhero");
    check("two Social views", socialBrands().length === 2);
    // "M HERO Lebanon" would render as "M Social" — the label is display text,
    // so it spells the brand the way the dropdown should read.
    check("view label reads MHERO", socialBrands()[1].label === "MHERO");
  },
);

console.log("one malformed variable does not blank out a working brand:");
withEnv(
  {
    META_ACCESS_TOKEN: VOYAH_TOKEN,
    META_PROFILES: JSON.stringify([{ label: "VOYAH Lebanon", ig_user_id: "1" }]),
    META_PROFILES_BROKEN: "{not json",
  },
  () => {
    check("working brand survives a neighbour's typo", metaProfiles().length === 1);
  },
);

console.log("Instagram signals belong to the brand whose view is open:");
// Found on the MHERO Social view: it showed 34 Instagram click-outs for a
// brand with no Instagram account configured. The figure was summed across
// the whole portfolio, so every brand's view displayed VOYAH's number.
const SITES = [
  { alias: "voyah", byType: { instagram_click: 34 } },
  { alias: "mhero", byType: { instagram_click: 2 } },
  { alias: "monza", byType: { instagram_click: 7 } },
];
check("voyah sees only its own", instagramSignalsForBrand(SITES, "voyah") === 34);
check("mhero sees only its own", instagramSignalsForBrand(SITES, "mhero") === 2);
check(
  "two brands no longer report the same number",
  instagramSignalsForBrand(SITES, "voyah") !== instagramSignalsForBrand(SITES, "mhero"),
);
check(
  "a brand with no site reports nothing, not zero",
  instagramSignalsForBrand(SITES, "nosuchbrand") === undefined,
);
// The bare "social" id from the single-view version passes no brand.
check("legacy view keeps the portfolio total", instagramSignalsForBrand(SITES, "") === 43);
check("no sites at all totals zero", instagramSignalsForBrand([], "") === 0);

if (failures > 0) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nall meta profile checks passed");
