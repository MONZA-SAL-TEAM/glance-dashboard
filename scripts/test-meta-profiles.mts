import { metaProfiles, socialBrands } from "../src/lib/meta";

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

if (failures > 0) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nall meta profile checks passed");
