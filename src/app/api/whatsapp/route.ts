import { NextRequest, NextResponse } from "next/server";
import { cached } from "@/lib/cache";
import { parseRange } from "@/lib/ranges";
import { fetchWhatsAppStats } from "@/lib/whatsapp";
import { fetchNumberHealth } from "@/lib/whatsapp-meta";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const range = parseRange(request.nextUrl.searchParams.get("range"));
    // Stats and number health fail independently: the analytics must not
    // disappear because a Meta read was denied, and vice versa.
    const [stats, health] = await Promise.all([
      cached(`whatsapp:${range}`, 5 * 60_000, () => fetchWhatsAppStats(range)),
      cached("whatsapp:health", 15 * 60_000, fetchNumberHealth).catch(() => ({
        configured: false as const,
        notes: ["number health lookup failed"],
      })),
    ]);
    return NextResponse.json(
      { ...stats, numberHealth: health },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "WhatsApp stats failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
