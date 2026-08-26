import { NextRequest, NextResponse } from "next/server";
import { listProperties } from "@/lib/properties";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    // ?refresh=1 skips the 5-minute cache, for when access was just granted in GA.
    const refresh = request.nextUrl.searchParams.get("refresh") === "1";
    const { properties, source, warning } = await listProperties({ refresh });
    return NextResponse.json(
      { properties, source, warning },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load websites";
    return NextResponse.json(
      { properties: [], source: "none", error: message },
      { status: 500 },
    );
  }
}
