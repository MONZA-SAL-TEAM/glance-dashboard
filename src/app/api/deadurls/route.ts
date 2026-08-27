import { NextRequest, NextResponse } from "next/server";
import { cached } from "@/lib/cache";
import { fetchDeadUrls } from "@/lib/deadurls";
import { parseRange } from "@/lib/ranges";
import type { DateRangeKey } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    const range = parseRange(request.nextUrl.searchParams.get("range"));
    const data = await cached(`deadurls:${range}`, 15 * 60_000, () =>
      fetchDeadUrls(range),
    );
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Dead URL report failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
