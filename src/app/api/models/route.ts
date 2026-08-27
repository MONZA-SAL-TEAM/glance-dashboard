import { NextRequest, NextResponse } from "next/server";
import { cached } from "@/lib/cache";
import { fetchModelPages } from "@/lib/models";
import { parseRange } from "@/lib/ranges";
import type { DateRangeKey, TrafficFilter } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function parseFilter(value: string | null): TrafficFilter {
  return value === "all" ? "all" : "lb";
}

export async function GET(request: NextRequest) {
  try {
    const range = parseRange(request.nextUrl.searchParams.get("range"));
    const filter = parseFilter(request.nextUrl.searchParams.get("filter"));
    const property = request.nextUrl.searchParams.get("property") || undefined;
    const data = await cached(
      `models:${property ?? "all"}:${range}:${filter}`,
      10 * 60_000,
      () => fetchModelPages(range, filter, property),
    );
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Model pages query failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
