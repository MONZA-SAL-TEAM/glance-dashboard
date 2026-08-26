import { NextRequest, NextResponse } from "next/server";
import { cached } from "@/lib/cache";
import { fetchRealtime } from "@/lib/ga";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const property = request.nextUrl.searchParams.get("property");
    // Short TTL: long enough to coalesce a burst of open tabs, short enough
    // that the client's 15s polling still sees fresh numbers each tick.
    const data = await cached(`realtime:${property ?? "default"}`, 15_000, () =>
      fetchRealtime(property),
    );
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load realtime";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
