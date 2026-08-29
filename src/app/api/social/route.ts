import { NextRequest, NextResponse } from "next/server";
import { cached } from "@/lib/cache";
import { fetchSocial } from "@/lib/meta";
import { parseRange } from "@/lib/ranges";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    const range = parseRange(request.nextUrl.searchParams.get("range"));
    // Brands live in separate Meta portfolios, so they cache separately —
    // one key for all of them would serve VOYAH's numbers under MHERO.
    const brand = request.nextUrl.searchParams.get("brand") || undefined;
    // Meta rate limits per app; 15 minutes matches the other heavy reports.
    const data = await cached(`social:${brand ?? "all"}:${range}`, 15 * 60_000, () =>
      fetchSocial(range, brand),
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
