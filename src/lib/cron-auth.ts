import type { NextRequest } from "next/server";

/**
 * Auth for the two self-authenticating job routes (/api/health/run and
 * /api/digest/run), which the middleware deliberately does not gate:
 *  - Vercel Cron calls carry `Authorization: Bearer ${CRON_SECRET}` when the
 *    CRON_SECRET env var is set on the project.
 *  - A logged-in dashboard session (glance_auth cookie) may trigger manually.
 *  - With neither password nor secret configured (local dev), allow.
 */
export function isAuthorizedJob(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") === `Bearer ${secret}`) {
    return true;
  }
  const password = process.env.DASHBOARD_PASSWORD;
  if (password) {
    return request.cookies.get("glance_auth")?.value === "1";
  }
  return !secret;
}
