import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedJob } from "@/lib/cron-auth";
import { runSocialSnapshot } from "@/lib/social-snapshot";

export const dynamic = "force-dynamic";
// Fetching posts and stories per brand is many sequential Graph calls.
export const maxDuration = 300;

/**
 * Nightly social snapshot. Self-authenticating like the other job routes
 * (CRON_SECRET bearer, or a logged-in dashboard session for a manual run) —
 * the middleware deliberately does not gate it.
 *
 * Read-only against Meta; the only writes are into Glance's own warehouse.
 */
export async function POST(request: NextRequest) {
  if (!(await isAuthorizedJob(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { stored, payload } = await runSocialSnapshot();
    return NextResponse.json(
      {
        ok: payload.ok,
        brands: payload.brands,
        stored,
        daysBackfilled: payload.days_backfilled,
        notes: payload.notes,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error(
      "social snapshot failed:",
      error instanceof Error ? error.message : error,
    );
    return NextResponse.json({ error: "Snapshot failed" }, { status: 500 });
  }
}

// Vercel Cron issues GET; accept both so a manual curl and the schedule
// exercise the same path.
export async function GET(request: NextRequest) {
  return POST(request);
}
