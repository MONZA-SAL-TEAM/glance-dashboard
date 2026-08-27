import type { NextRequest } from "next/server";
import { isAuthCookieValid } from "./auth-token";

/**
 * Auth for the two self-authenticating job routes (/api/health/run and
 * /api/digest/run), which the middleware deliberately does not gate:
 *  - Vercel Cron calls carry `Authorization: Bearer ${CRON_SECRET}` when the
 *    CRON_SECRET env var is set on the project. Without CRON_SECRET the cron
 *    request carries no credentials at all — so the schedules silently do
 *    nothing until it is configured; we log that loudly below.
 *  - A logged-in dashboard session (valid signed glance_auth cookie) may
 *    trigger manually.
 *  - With neither password nor secret configured (local dev), allow.
 */
export async function isAuthorizedJob(request: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") === `Bearer ${secret}`) {
    return true;
  }
  const password = process.env.DASHBOARD_PASSWORD;
  if (password) {
    const ok = await isAuthCookieValid(
      request.cookies.get("glance_auth")?.value,
    );
    if (!ok && (request.headers.get("user-agent") || "").includes("vercel-cron")) {
      console.error(
        "[glance-cron] Vercel cron call rejected — set CRON_SECRET in the project env or the scheduled health/digest jobs will never run.",
      );
    }
    return ok;
  }
  return !secret;
}
