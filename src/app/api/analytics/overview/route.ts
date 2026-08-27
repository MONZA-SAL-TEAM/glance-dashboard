import { NextRequest, NextResponse } from "next/server";
import { cached } from "@/lib/cache";
import { fetchOverview } from "@/lib/ga";
import { parseRange } from "@/lib/ranges";
import type { DateRangeKey, TrafficFilter } from "@/lib/types";

export const dynamic = "force-dynamic";

function parseFilter(value: string | null): TrafficFilter {
  return value === "all" ? "all" : "lb";
}

export async function GET(request: NextRequest) {
  try {
    const range = parseRange(request.nextUrl.searchParams.get("range"));
    const property = request.nextUrl.searchParams.get("property");
    const filter = parseFilter(request.nextUrl.searchParams.get("filter"));
    const data = await cached(
      `overview:${property ?? "default"}:${range}:${filter}`,
      10 * 60_000,
      () => fetchOverview(range, property, filter),
    );
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load analytics";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
