import { createHmac, timingSafeEqual } from "crypto";

/**
 * Meta Cloud API webhook handling: signature verification and payload
 * normalization. The webhook is the one door into the chat store, so it is
 * deliberately paranoid:
 *
 *  - POSTs are accepted only with a valid X-Hub-Signature-256 (HMAC of the
 *    raw body with the app secret). No secret configured = fail closed.
 *  - The normalizer is a pure function over Meta's payload shape, so what
 *    reaches the database is a small fixed vocabulary of events, never the
 *    raw webhook.
 *
 * Under Coexistence, messages the business sends FROM THE PHONE arrive as
 * echo events, so threads show both sides of the conversation — which is
 * the entire point of the inbox.
 */

export interface WaEvent {
  kind: "message" | "status";
  id: string;
  wa_id?: string;
  name?: string;
  direction?: "in" | "out";
  type?: string;
  body?: string;
  ts?: number;
  status?: string;
}

/** Constant-time check of Meta's X-Hub-Signature-256 header. */
export function verifyMetaSignature(
  rawBody: string,
  header: string | null,
  appSecret: string,
): boolean {
  if (!header || !header.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", appSecret)
    .update(rawBody, "utf8")
    .digest("hex");
  const given = header.slice("sha256=".length);
  if (given.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(given, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

interface MetaMessage {
  id?: string;
  from?: string;
  to?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  image?: { caption?: string };
  video?: { caption?: string };
  document?: { caption?: string; filename?: string };
  audio?: unknown;
  sticker?: unknown;
  location?: { name?: string; address?: string };
  button?: { text?: string };
  interactive?: {
    button_reply?: { title?: string };
    list_reply?: { title?: string };
  };
}

/** A readable one-line body for any message type Meta can deliver. */
export function messageBody(msg: MetaMessage): string {
  switch (msg.type) {
    case "text":
      return msg.text?.body ?? "";
    case "image":
      return msg.image?.caption ? `📷 ${msg.image.caption}` : "📷 photo";
    case "video":
      return msg.video?.caption ? `🎬 ${msg.video.caption}` : "🎬 video";
    case "audio":
      return "🎙 voice message";
    case "sticker":
      return "sticker";
    case "document":
      return `📄 ${msg.document?.filename ?? "document"}`;
    case "location":
      return `📍 ${msg.location?.name ?? msg.location?.address ?? "location"}`;
    case "button":
      return msg.button?.text ?? "button reply";
    case "interactive":
      return (
        msg.interactive?.button_reply?.title ??
        msg.interactive?.list_reply?.title ??
        "interactive reply"
      );
    default:
      return msg.type ? `[${msg.type}]` : "";
  }
}

/**
 * Flatten one webhook delivery into normalized events.
 *
 * Handles, per change value:
 *  - `messages` with `contacts`  → inbound customer messages
 *  - `message_echoes` / `smb_message_echoes` → outbound (sent from the
 *    phone app or the API; Coexistence mirrors both)
 *  - `statuses` → delivery/read updates on outbound messages
 * Everything else (template updates, account notices, history sync) is
 * ignored here — unknown shapes must never fail the webhook, because Meta
 * retries non-200s and a poison payload would loop forever.
 */
export function normalizeWebhook(payload: unknown): WaEvent[] {
  const events: WaEvent[] = [];
  const root = payload as { entry?: Array<{ changes?: Array<{ value?: Record<string, unknown> }> }> };
  for (const entry of root?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      const value = change?.value as
        | {
            metadata?: { display_phone_number?: string };
            messages?: MetaMessage[];
            contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>;
            message_echoes?: MetaMessage[];
            smb_message_echoes?: MetaMessage[];
            statuses?: Array<{ id?: string; status?: string }>;
          }
        | undefined;
      if (!value) continue;
      // The business's own number, per Meta's metadata. A message in the
      // `messages` array whose sender IS the business (self-message tests,
      // odd coexistence deliveries) must not become a fake inbound thread
      // keyed by our own number.
      const businessNumber = (value.metadata?.display_phone_number ?? "").replace(/\D/g, "");

      const names = new Map<string, string>();
      for (const c of value.contacts ?? []) {
        if (c?.wa_id && c?.profile?.name) names.set(c.wa_id, c.profile.name);
      }

      for (const msg of value.messages ?? []) {
        if (!msg?.id || !msg?.from) continue;
        if (businessNumber && msg.from.replace(/\D/g, "") === businessNumber) continue;
        events.push({
          kind: "message",
          id: msg.id,
          wa_id: msg.from,
          name: names.get(msg.from),
          direction: "in",
          type: msg.type ?? "text",
          body: messageBody(msg),
          ts: Number(msg.timestamp) || undefined,
        });
      }

      for (const echo of [
        ...(value.message_echoes ?? []),
        ...(value.smb_message_echoes ?? []),
      ]) {
        if (!echo?.id || !echo?.to) continue;
        events.push({
          kind: "message",
          id: echo.id,
          wa_id: echo.to,
          direction: "out",
          type: echo.type ?? "text",
          body: messageBody(echo),
          ts: Number(echo.timestamp) || undefined,
        });
      }

      for (const st of value.statuses ?? []) {
        if (!st?.id || !st?.status) continue;
        events.push({ kind: "status", id: st.id, status: st.status });
      }
    }
  }
  return events;
}
