import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedJob } from "@/lib/cron-auth";
import { buildDigest, sendDigestEmail } from "@/lib/digest";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Weekly digest job (Vercel cron, Monday morning Beirut). Builds the digest
 * and emails it when the email provider is configured; the build result is
 * returned either way so the run is auditable. */
async function handle(request: NextRequest) {
  if (!(await isAuthorizedJob(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const digest = await buildDigest();
    const delivery = await sendDigestEmail(digest);
    return NextResponse.json(
      {
        weekOf: digest.weekOf,
        insights: digest.insights,
        delivery,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Digest run failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
