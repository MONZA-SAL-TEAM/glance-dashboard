import { NextRequest, NextResponse } from "next/server";
import { getPropertyMeta, resolvePropertyId } from "@/lib/properties";
import { fetchSignals } from "@/lib/signals";
import { siteDomainForProperty } from "@/lib/sites";
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
    const propertyId = await resolvePropertyId(property);
    const meta = await getPropertyMeta(propertyId);
    const site = siteDomainForProperty(propertyId, meta.url);

    if (!site) {
      return NextResponse.json(
        { error: `No site mapping for property ${propertyId} — signals unavailable.` },
        { status: 404 },
      );
    }

    const data = await fetchSignals(range, site);
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load signals";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
