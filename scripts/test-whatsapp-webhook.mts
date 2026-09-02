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
// `order` has had its own case since referral support landed; use a type
// with no case at all to exercise the default branch.
check("unknown type bracketed", messageBody({ type: "poll" }) === "[poll]");

console.log("BSUID identity (Meta's forward-compatible key):");
// Inbound from a customer who has adopted a WhatsApp username: Meta sends
// user_id/from_user_id and OMITS the phone number entirely. A phone-keyed
// store drops this message; a BSUID-keyed store threads it correctly.
const bsuidOnly = {
  entry: [{ changes: [{ value: {
    metadata: { display_phone_number: "96170708585" },
    contacts: [{ user_id: "CC.abc123xyz", username: "ali.hassan", profile: { name: "Ali Hassan" } }],
    messages: [{
      from_user_id: "CC.abc123xyz",
      id: "wamid.bsuid.1",
      timestamp: "1756640000",
      type: "text",
      text: { body: "Still available in green?" },
    }],
  } }] }],
};
const b1 = normalizeWebhook(bsuidOnly);
check("message survives with no phone number", b1.length === 1);
check("bsuid captured", b1[0].bsuid === "CC.abc123xyz");
check("wa_id absent, not fabricated", b1[0].wa_id === undefined);
check("username captured", b1[0].username === "ali.hassan");
check("profile name resolved via BSUID", b1[0].name === "Ali Hassan");

// Transitional: both identities present. BSUID must win as the key while the
// phone is retained as an attribute.
const both = {
  entry: [{ changes: [{ value: {
    metadata: { display_phone_number: "96170708585" },
    contacts: [{ wa_id: "96171234567", user_id: "CC.dual", profile: { name: "Dual" } }],
    messages: [{
      from: "96171234567",
      from_user_id: "CC.dual",
      id: "wamid.dual.1",
      timestamp: "1756640000",
      type: "text",
      text: { body: "hi" },
    }],
  } }] }],
};
const b2 = normalizeWebhook(both);
check("bsuid preferred as identity", b2[0].bsuid === "CC.dual");
check("phone retained as attribute", b2[0].wa_id === "96171234567");
check("sender_id set from from_user_id", b2[0].sender_id === "CC.dual");

// Echo of a business reply to a username-only customer.
const bsuidEcho = {
  entry: [{ changes: [{ value: {
    metadata: { display_phone_number: "96170708585" },
    contacts: [{ user_id: "CC.abc123xyz", username: "ali.hassan" }],
    smb_message_echoes: [{
      from: "96170708585",
      to_user_id: "CC.abc123xyz",
      id: "wamid.bsuid.echo",
      timestamp: "1756640100",
      type: "text",
      text: { body: "Yes, Sage Green in stock." },
    }],
  } }] }],
};
const b3 = normalizeWebhook(bsuidEcho);
check("echo threads under the customer's BSUID", b3.length === 1 && b3[0].bsuid === "CC.abc123xyz");
check("echo direction out", b3[0].direction === "out");

// Legacy phone-only traffic must keep working throughout the rollout.
const legacy = {
  entry: [{ changes: [{ value: {
    metadata: { display_phone_number: "96170708585" },
    contacts: [{ wa_id: "96179999999", profile: { name: "Legacy" } }],
    messages: [{ from: "96179999999", id: "wamid.legacy.1", timestamp: "1756640000", type: "text", text: { body: "hello" } }],
  } }] }],
};
const b4 = normalizeWebhook(legacy);
check("phone-only still normalizes", b4.length === 1 && b4[0].wa_id === "96179999999");
check("no bsuid invented when Meta sends none", b4[0].bsuid === undefined);

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

console.log("Click-to-WhatsApp ad attribution (referral):");
// Meta attaches `referral` to the FIRST message of an ad-originated
// conversation and never again. Dropping it destroys the only paid
// attribution key that conversation will ever have.
const ctwa = {
  entry: [{ changes: [{ field: "messages", value: {
    metadata: { display_phone_number: "96170708585" },
    contacts: [{ wa_id: "96171112222", profile: { name: "Ad Clicker" } }],
    messages: [{
      from: "96171112222",
      id: "wamid.ctwa.1",
      timestamp: "1756640000",
      type: "text",
      text: { body: "Saw your ad — is the Taishan available?" },
      referral: {
        source_url: "https://fb.com/ad/123",
        source_id: "6012345678901",
        source_type: "ad",
        headline: "VOYAH Taishan — now in Lebanon",
        body: "Book a test drive",
        media_type: "video",
        ctwa_clid: "ARBxyz987clickid",
      },
    }],
  }}]}],
};
const c1 = normalizeWebhook(ctwa);
check("ctwa_clid captured", c1[0].ctwa_clid === "ARBxyz987clickid");
check("ad source_id captured", c1[0].referral_source_id === "6012345678901");
check("source_type captured", c1[0].referral_source_type === "ad");
check("headline captured", c1[0].referral_headline === "VOYAH Taishan — now in Lebanon");

// A normal organic message must carry no attribution rather than empty strings.
const organic = normalizeWebhook({
  entry: [{ changes: [{ value: {
    metadata: { display_phone_number: "96170708585" },
    contacts: [{ wa_id: "96171112223" }],
    messages: [{ from: "96171112223", id: "wamid.organic.1", timestamp: "1756640000", type: "text", text: { body: "hi" } }],
  } }] }],
});
check("organic message has no ctwa_clid", organic[0].ctwa_clid === undefined);

console.log("message context (reply threading):");
const replyMsg = normalizeWebhook({
  entry: [{ changes: [{ value: {
    metadata: { display_phone_number: "96170708585" },
    contacts: [{ wa_id: "96171112224" }],
    messages: [{ from: "96171112224", id: "wamid.reply.1", timestamp: "1756640000", type: "text",
      text: { body: "yes that one" }, context: { id: "wamid.original.99" } }],
  } }] }],
});
check("reply_to_id captured from context", replyMsg[0].reply_to_id === "wamid.original.99");

console.log("message types the schema lists:");
check("reaction renders the emoji", messageBody({ type: "reaction", reaction: { emoji: "👍" } }) === "reacted 👍");
check("shared contact renders the name", messageBody({ type: "contacts", contacts: [{ name: { formatted_name: "Rami K" } }] }) === "👤 Rami K");
check("order renders item count", messageBody({ type: "order", order: { product_items: [1, 2] } }) === "🛒 order · 2 items");
check("system message renders its body", messageBody({ type: "system", system: { body: "User changed their phone number" } }) === "User changed their phone number");
check("unsupported is labelled", messageBody({ type: "unsupported" }) === "unsupported message type");

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
