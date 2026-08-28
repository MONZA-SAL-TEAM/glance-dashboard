import { NextRequest, NextResponse } from "next/server";
import { cached } from "@/lib/cache";
import { fetchSocial } from "@/lib/meta";
import { parseRange } from "@/lib/ranges";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    const range = parseRange(request.nextUrl.searchParams.get("range"));
    // Meta rate limits per app; 15 minutes matches the other heavy reports.
    const data = await cached(`social:${range}`, 15 * 60_000, () =>
      fetchSocial(range),
    );
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Social query failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
