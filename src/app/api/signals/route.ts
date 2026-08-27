import { NextRequest, NextResponse } from "next/server";
import { cached } from "@/lib/cache";
import { getPropertyMeta, resolvePropertyId } from "@/lib/properties";
import { fetchSignals } from "@/lib/signals";
import { siteDomainForProperty } from "@/lib/sites";
import { parseRange } from "@/lib/ranges";
import type { DateRangeKey } from "@/lib/types";

export const dynamic = "force-dynamic";

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

    const data = await cached(`signals:${site}:${range}`, 5 * 60_000, () =>
      fetchSignals(range, site),
    );
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load signals";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
