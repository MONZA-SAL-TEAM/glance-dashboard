import { NextRequest, NextResponse } from "next/server";
import { cached } from "@/lib/cache";
import { fetchHealthHistory } from "@/lib/health";
import { getCachedHealth } from "@/lib/portfolio";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const withHistory =
      request.nextUrl.searchParams.get("history") !== "0";
    const [health, history] = await Promise.all([
      getCachedHealth(),
      withHistory
        ? cached("health:history", 10 * 60_000, () => fetchHealthHistory(14)).catch(
            () => [],
          )
        : Promise.resolve([]),
    ]);
    return NextResponse.json(
      { ...health, history },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Health check failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
