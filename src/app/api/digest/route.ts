import { NextRequest, NextResponse } from "next/server";
import { buildDigest, renderDigestHtml, renderDigestText } from "@/lib/digest";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Digest preview for the logged-in dashboard (?format=json|text|html). */
export async function GET(request: NextRequest) {
  try {
    const digest = await buildDigest();
    const fmt = request.nextUrl.searchParams.get("format") || "json";
    if (fmt === "text") {
      return new NextResponse(renderDigestText(digest), {
        headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
      });
    }
    if (fmt === "html") {
      return new NextResponse(renderDigestHtml(digest), {
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
      });
    }
    return NextResponse.json(digest, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Digest failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
