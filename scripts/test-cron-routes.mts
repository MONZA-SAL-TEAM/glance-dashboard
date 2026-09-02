import { readFileSync } from "fs";

/**
 * Every scheduled path must be exempt from the cookie middleware.
 *
 * A job route missing from that list is rejected by the middleware BEFORE its
 * own CRON_SECRET check runs, so the schedule 401s forever and the only
 * symptom is data that silently never arrives. /api/social/snapshot shipped
 * that way and would never have run once.
 *
 * The two files are edited independently — vercel.json when a schedule is
 * added, middleware.ts when auth is considered — so nothing but a test keeps
 * them in agreement.
 */

let failures = 0;
function check(name: string, cond: boolean) {
  if (cond) console.log(`  ok   ${name}`);
  else { console.log(`  FAIL ${name}`); failures++; }
}

const vercelConfig = JSON.parse(readFileSync("vercel.json", "utf8")) as {
  crons?: Array<{ path: string; schedule: string }>;
};
const middleware = readFileSync("src/middleware.ts", "utf8");
const crons = vercelConfig.crons ?? [];

console.log(`cron paths declared in vercel.json: ${crons.length}`);
check("at least one cron is configured", crons.length > 0);

for (const cron of crons) {
  check(
    `${cron.path} is exempt from the cookie middleware`,
    middleware.includes(`"${cron.path}"`),
  );
  check(
    `${cron.path} has a valid 5-field cron schedule`,
    cron.schedule.trim().split(/\s+/).length === 5,
  );
}

// The webhook is not a cron but is equally unreachable behind the cookie gate.
check(
  "the Meta webhook is exempt too",
  middleware.includes('"/api/whatsapp/webhook"'),
);

// Exemptions must be exact matches, never prefixes: a startsWith on an API
// path would expose neighbouring routes that were never meant to be public.
check(
  "job exemptions are exact-match, not prefix",
  !/startsWith\(\s*"\/api\/(health|digest|social|whatsapp)/.test(middleware),
);

if (failures) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nall cron route checks passed");
