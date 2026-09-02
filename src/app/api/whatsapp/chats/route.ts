import { NextRequest, NextResponse } from "next/server";
import { supabaseRpc } from "@/lib/signals";

export const dynamic = "force-dynamic";

/**
 * Chat reads for the dashboard inbox. The outer protection is the
 * middleware cookie gate (this route is NOT in its exemption list) — but
 * that gate is a no-op when DASHBOARD_PASSWORD is unset, and this route
 * serves customer phone numbers and message bodies. So unlike the other
 * API routes, it fails closed in production without a password.
 */

interface ThreadRow {
  contact_id: string;
  id_kind: string;
  phone: string | null;
  username: string | null;
  profile_name: string | null;
  last_message_at: string | null;
  last_preview: string | null;
  last_direction: string | null;
  message_count: number;
}

interface MessageRow {
  id: string;
  contact_id: string;
  direction: "in" | "out";
  msg_type: string;
  body: string | null;
  sent_at: string;
  status: string | null;
}

export async function GET(request: NextRequest) {
  try {
    if (
      process.env.NODE_ENV === "production" &&
      !process.env.DASHBOARD_PASSWORD
    ) {
      return NextResponse.json(
        { error: "Chats require DASHBOARD_PASSWORD to be configured." },
        { status: 503 },
      );
    }
    const token = process.env.GLANCE_SIGNALS_TOKEN;
    const waId = request.nextUrl.searchParams.get("thread");

    if (waId) {
      // A contact id is either a phone-based wa_id (digits) or a BSUID,
      // which Meta documents as "CC." plus up to 128 characters — so digits
      // alone is no longer a valid test.
      if (!/^[A-Za-z0-9._:-]{5,128}$/.test(waId)) {
        return NextResponse.json({ error: "invalid thread" }, { status: 400 });
      }
      const messages = await supabaseRpc<MessageRow[]>("wa_thread_messages", {
        p_contact_id: waId,
        p_limit: 200,
        ...(token ? { p_token: token } : {}),
      });
      return NextResponse.json(
        { messages },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const threads = await supabaseRpc<ThreadRow[]>("wa_threads", {
      p_limit: 100,
      ...(token ? { p_token: token } : {}),
    });
    return NextResponse.json(
      { threads },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    // Detail goes to the server log only — RPC errors can hint at the
    // token configuration, and this response reaches the browser.
    console.error(
      "chats read failed:",
      error instanceof Error ? error.message : error,
    );
    return NextResponse.json({ error: "Chats unavailable" }, { status: 500 });
  }
}
