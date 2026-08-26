import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (
    pathname === "/login" ||
    pathname.startsWith("/api/auth") ||
    // Scheduled jobs authenticate themselves (CRON_SECRET bearer or an
    // already-authed dashboard cookie) — see src/lib/cron-auth.ts.
    pathname === "/api/health/run" ||
    pathname === "/api/digest/run" ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  const authed = request.cookies.get("glance_auth")?.value === "1";
  if (authed) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.png$).*)"],
};
