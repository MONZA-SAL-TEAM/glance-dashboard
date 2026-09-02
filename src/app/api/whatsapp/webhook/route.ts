import { NextRequest, NextResponse } from "next/server";
import { supabaseRpc } from "@/lib/signals";
import { normalizeWebhook, verifyMetaSignature } from "@/lib/whatsapp-webhook";

export const dynamic = "force-dynamic";

/**
 * Meta Cloud API webhook. Exempt from the dashboard's cookie auth (Meta
 * cannot log in); it authenticates itself instead:
 *  - GET: the subscription handshake, gated on WHATSAPP_VERIFY_TOKEN.
 *  - POST: HMAC-verified against META_APP_SECRET. Fail closed — while the
 *    secret is unset the endpoint accepts nothing, so deploying this code
 *    before Coexistence go-live is inert.
 */

export async function GET(request: NextRequest) {
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
  const params = request.nextUrl.searchParams;
  if (
    verifyToken &&
    params.get("hub.mode") === "subscribe" &&
    params.get("hub.verify_token") === verifyToken
  ) {
    return new NextResponse(params.get("hub.challenge") ?? "", { status: 200 });
  }
  return NextResponse.json({ error: "verification failed" }, { status: 403 });
}

export async function POST(request: NextRequest) {
  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret) {
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }

  // Reject oversized bodies before buffering or hashing them — Meta's real
  // deliveries are a few KB; anything approaching a megabyte is not Meta.
  const MAX_BODY = 1_000_000;
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY) {
    return NextResponse.json({ error: "too large" }, { status: 413 });
  }
  const raw = await request.text();
  if (raw.length > MAX_BODY) {
    return NextResponse.json({ error: "too large" }, { status: 413 });
  }
  const signature = request.headers.get("x-hub-signature-256");
  if (!verifyMetaSignature(raw, signature, appSecret)) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }

  let events: ReturnType<typeof normalizeWebhook> = [];
  try {
    events = normalizeWebhook(JSON.parse(raw));
  } catch {
    // A verified-but-unparseable body still gets a 200: returning an error
    // makes Meta redeliver the same poison payload forever.
    return NextResponse.json({ ok: true, received: 0, stored: 0 });
  }

  let stored = 0;
  if (events.length > 0) {
    const token = process.env.GLANCE_SIGNALS_TOKEN;
    try {
      // wa_ingest returns how many NEW messages were inserted — replayed
      // deliveries (Meta retries every non-200) come back as 0. The RPC
      // rejects batches over 200 events, and Meta's backlog flushes can
      // exceed that, so send in slices rather than silently losing the tail.
      for (let i = 0; i < events.length; i += 200) {
        stored += await supabaseRpc<number>("wa_ingest", {
          p_events: events.slice(i, i + 200),
          ...(token ? { p_token: token } : {}),
        });
      }
    } catch (error) {
      // Signal Meta to retry later rather than dropping messages silently.
      console.error(
        "wa_ingest failed:",
        error instanceof Error ? error.message : error,
      );
      return NextResponse.json({ error: "store failed" }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, received: events.length, stored });
}
