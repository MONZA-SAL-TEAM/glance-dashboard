import { NextRequest, NextResponse } from "next/server";
import { cached } from "@/lib/cache";
import { fetchPortfolio } from "@/lib/portfolio";
import { parseRange } from "@/lib/ranges";
import type { DateRangeKey, TrafficFilter } from "@/lib/types";

export const dynamic = "force-dynamic";

function parseFilter(value: string | null): TrafficFilter {
  return value === "all" ? "all" : "lb";
}

export async function GET(request: NextRequest) {
  try {
    const range = parseRange(request.nextUrl.searchParams.get("range"));
    const filter = parseFilter(request.nextUrl.searchParams.get("filter"));
    const data = await cached(`portfolio:${range}:${filter}`, 10 * 60_000, () =>
      fetchPortfolio(range, filter),
    );
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load portfolio";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
