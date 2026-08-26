import { NextRequest, NextResponse } from "next/server";
import { prime } from "@/lib/cache";
import { isAuthorizedJob } from "@/lib/cron-auth";
import { runHealthChecks } from "@/lib/health";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Scheduled (or manually triggered) fresh health run that records history.
 * Not behind the password middleware — it authenticates itself. */
async function handle(request: NextRequest) {
  if (!(await isAuthorizedJob(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const health = await runHealthChecks();
    // Same-instance dashboards should see this fresh run immediately instead
    // of a stale cached one.
    prime("health:full", 15 * 60_000, health);
    return NextResponse.json(
      {
        ranAt: health.fetchedAt,
        recorded: health.recorded,
        recordError: health.recordError,
        sites: health.sites.map((s) => ({
          site: s.site,
          status: s.status,
          summary: s.summary,
        })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Health run failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
