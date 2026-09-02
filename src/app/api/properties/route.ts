import { NextRequest, NextResponse } from "next/server";
import { listProperties } from "@/lib/properties";
import { socialBrands } from "@/lib/meta";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    // ?refresh=1 skips the 5-minute cache, for when access was just granted in GA.
    const refresh = request.nextUrl.searchParams.get("refresh") === "1";
    const { properties, source, warning } = await listProperties({ refresh });
    // The switcher cannot know which brands have Meta credentials — only the
    // server reads META_PROFILES — so the list is served rather than guessed.
    return NextResponse.json(
      { properties, source, warning, socialBrands: socialBrands() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load websites";
    return NextResponse.json(
      { properties: [], source: "none", socialBrands: [], error: message },
      { status: 500 },
    );
  }
}
