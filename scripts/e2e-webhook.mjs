// Local end-to-end exercise of the WhatsApp webhook: signed inbound message,
// coexistence echo, replay (idempotency), and a status update, then reads
// them back through the chats API. Run against `next dev` with
// META_APP_SECRET / WHATSAPP_VERIFY_TOKEN set to the values below (or
// export your own). There is only ONE Supabase project: even against
// localhost, the test rows land in the SHARED production chat store
// (wa_id 96170000001) - delete them from wa_messages/wa_threads after.
import { createHmac } from "crypto";
const secret = process.env.META_APP_SECRET || "local_test_secret_e2e";
const now = Math.floor(Date.now() / 1000);

async function send(payload) {
  const body = JSON.stringify(payload);
  const sig = "sha256=" + createHmac("sha256", secret).update(body, "utf8").digest("hex");
  const res = await fetch("http://localhost:3000/api/whatsapp/webhook", {
    method: "POST",
    headers: { "content-type": "application/json", "x-hub-signature-256": sig },
    body,
  });
  return `${res.status} ${JSON.stringify(await res.json())}`;
}

const inboundPayload = {
  object: "whatsapp_business_account",
  entry: [{ id: "1502691630809243", changes: [{ field: "messages", value: {
    contacts: [{ profile: { name: "E2E Test Customer" }, wa_id: "96170000001" }],
    messages: [{ from: "96170000001", id: "wamid.e2e.test.1", timestamp: String(now), type: "text",
      text: { body: "E2E: interested in the VOYAH Free, is green available?" } }],
  }}]}],
};

const v = await fetch("http://localhost:3000/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=local_verify_e2e&hub.challenge=CHALLENGE_42");
console.log("handshake:", v.status, await v.text());
const bad = await fetch("http://localhost:3000/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=WRONG&hub.challenge=x");
console.log("bad handshake rejected:", bad.status);

const unsigned = await fetch("http://localhost:3000/api/whatsapp/webhook", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ entry: [] }),
});
console.log("unsigned rejected:", unsigned.status);

console.log("inbound:", await send(inboundPayload));
console.log("echo:", await send({
  entry: [{ changes: [{ value: { smb_message_echoes: [{ from: "96170708585", to: "96170000001",
    id: "wamid.e2e.test.2", timestamp: String(now + 30), type: "text",
    text: { body: "E2E reply: yes, Sage Green in stock." } }] } }] }],
}));
console.log("replay (expect stored 0):", await send(inboundPayload));
console.log("status:", await send({
  entry: [{ changes: [{ value: { statuses: [{ id: "wamid.e2e.test.2", status: "read" }] } }] }],
}));

const threads = await (await fetch("http://localhost:3000/api/whatsapp/chats")).json();
console.log("threads:", JSON.stringify(threads));
const msgs = await (await fetch("http://localhost:3000/api/whatsapp/chats?thread=96170000001")).json();
console.log("messages:", JSON.stringify(msgs.messages?.map((m) => [m.direction, m.body, m.status])));
