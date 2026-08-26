import { NextRequest, NextResponse } from "next/server";
import { fetchOverview } from "@/lib/ga";
import type { DateRangeKey } from "@/lib/types";

export const dynamic = "force-dynamic";

function parseRange(value: string | null): DateRangeKey {
  if (value === "7d" || value === "90d" || value === "28d") return value;
  return "28d";
}

export async function GET(request: NextRequest) {
  try {
    const range = parseRange(request.nextUrl.searchParams.get("range"));
    const property = request.nextUrl.searchParams.get("property");
    const data = await fetchOverview(range, property);
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load analytics";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
