import { NextRequest, NextResponse } from "next/server";
import { fetchRealtime } from "@/lib/ga";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const property = request.nextUrl.searchParams.get("property");
    const data = await fetchRealtime(property);
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load realtime";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
