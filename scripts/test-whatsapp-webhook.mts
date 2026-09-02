import { createHmac } from "crypto";
import {
  messageBody,
  normalizeWebhook,
  verifyMetaSignature,
} from "../src/lib/whatsapp-webhook";

let failures = 0;
function check(name: string, cond: boolean) {
  if (cond) console.log(`  ok   ${name}`);
  else { console.log(`  FAIL ${name}`); failures++; }
}

console.log("signature verification:");
const secret = "test_app_secret";
const body = JSON.stringify({ object: "whatsapp_business_account" });
const good = "sha256=" + createHmac("sha256", secret).update(body, "utf8").digest("hex");
check("valid signature accepted", verifyMetaSignature(body, good, secret));
check("tampered body rejected", !verifyMetaSignature(body + " ", good, secret));
check("wrong secret rejected", !verifyMetaSignature(body, good, "other_secret"));
check("missing header rejected", !verifyMetaSignature(body, null, secret));
check("malformed header rejected", !verifyMetaSignature(body, "sha1=abc", secret));
check("short header rejected", !verifyMetaSignature(body, "sha256=abcd", secret));

console.log("inbound message normalization (real Cloud API shape):");
const inbound = {
  object: "whatsapp_business_account",
  entry: [{
    id: "1502691630809243",
    changes: [{
      field: "messages",
      value: {
        messaging_product: "whatsapp",
        metadata: { display_phone_number: "96170708585", phone_number_id: "984244264767607" },
        contacts: [{ profile: { name: "Ali Hassan" }, wa_id: "96171234567" }],
        messages: [{
          from: "96171234567",
          id: "wamid.HBgLOTYxNzEyMzQ1NjcVAgASGBQzQTdCM0Y3RjY4",
          timestamp: "1756640000",
          text: { body: "Is the VOYAH Free available in green?" },
          type: "text",
        }],
      },
    }],
  }],
};
const e1 = normalizeWebhook(inbound);
check("one event", e1.length === 1);
check("kind message, direction in", e1[0].kind === "message" && e1[0].direction === "in");
check("customer number captured", e1[0].wa_id === "96171234567");
check("profile name joined from contacts", e1[0].name === "Ali Hassan");
check("body extracted", e1[0].body === "Is the VOYAH Free available in green?");
check("unix ts parsed", e1[0].ts === 1756640000);

console.log("coexistence echo (business replies from the phone):");
const echo = {
  entry: [{
    changes: [{
      value: {
        smb_message_echoes: [{
          from: "96170708585",
          to: "96171234567",
          id: "wamid.echo.1",
          timestamp: "1756640100",
          type: "text",
          text: { body: "Yes! Sage Green is in stock." },
        }],
      },
    }],
  }],
};
const e2 = normalizeWebhook(echo);
check("echo becomes outbound", e2.length === 1 && e2[0].direction === "out");
check("threaded under the CUSTOMER's number", e2[0].wa_id === "96171234567");

console.log("status updates:");
const status = {
  entry: [{ changes: [{ value: { statuses: [{ id: "wamid.echo.1", status: "read", timestamp: "1756640200", recipient_id: "96171234567" }] } }] }],
};
const e3 = normalizeWebhook(status);
check("status event", e3.length === 1 && e3[0].kind === "status" && e3[0].status === "read");

console.log("media bodies:");
check("image caption", messageBody({ type: "image", image: { caption: "front view" } }) === "📷 front view");
check("bare image placeholder", messageBody({ type: "image" }) === "📷 photo");
check("voice note", messageBody({ type: "audio" }) === "🎙 voice message");
check("document filename", messageBody({ type: "document", document: { filename: "offer.pdf" } }) === "📄 offer.pdf");
check("unknown type bracketed", messageBody({ type: "order" }) === "[order]");

console.log("business-number guard:");
const selfMsg = {
  entry: [{ changes: [{ value: {
    metadata: { display_phone_number: "961 70 708 585" },
    messages: [{ from: "96170708585", id: "wamid.self.1", timestamp: "1756640000", type: "text", text: { body: "note to self" } }],
  } }] }],
};
check("business's own message never becomes an inbound thread", normalizeWebhook(selfMsg).length === 0);
const customerWithMeta = {
  entry: [{ changes: [{ value: {
    metadata: { display_phone_number: "96170708585" },
    messages: [{ from: "96171234567", id: "wamid.cust.1", timestamp: "1756640000", type: "text", text: { body: "hi" } }],
  } }] }],
};
check("customer message passes the guard", normalizeWebhook(customerWithMeta).length === 1);

console.log("poison payloads never throw:");
for (const [label, p] of Object.entries({
  "null": null,
  "empty object": {},
  "entry not array": { entry: "x" },
  "no value": { entry: [{ changes: [{}] }] },
  "message without id": { entry: [{ changes: [{ value: { messages: [{ from: "961" }] } }] }] },
  "history sync ignored": { entry: [{ changes: [{ value: { history: [{ threads: [] }] } }] }] },
})) {
  try { check(`${label} -> ${normalizeWebhook(p).length === 0 ? "0 events" : "events"}`, normalizeWebhook(p).length === 0); }
  catch { check(`${label} threw`, false); }
}

if (failures) { console.log(`\n${failures} check(s) failed`); process.exit(1); }
console.log("\nall webhook checks passed");
