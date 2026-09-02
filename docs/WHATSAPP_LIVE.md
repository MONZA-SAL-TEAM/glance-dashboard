# WhatsApp live inbox — go-live runbook

The chat interface and ingestion pipeline are fully built and deployed
dormant. The store is empty and the webhook rejects everything until the
steps below are done. **Nothing in this codebase can register, deregister,
or message; the phone's WhatsApp login cannot be affected by deploying it.**

## Read-only by design

Glance reads and analyses; it does not operate. Conversations are handled —
and replies sent — in the customer chat system, which already owns that job.
Glance's inbox exists to *view* conversations and report on them: volume, AI
versus human handling, unanswered threads, response times, and which vehicle
or campaign produced each conversation.

This is a permanent architectural boundary, not a phase. A send path is not
planned, and adding one would make Glance a second operational system
competing with the one that already owns the conversation. Anyone extending
this code should treat "no outbound messaging" as a constraint to design
within rather than a gap to fill.

## What exists already

- `POST /api/whatsapp/webhook` — HMAC-verified (X-Hub-Signature-256)
  receiver; fail-closed while `META_APP_SECRET` is unset. Idempotent:
  Meta's redeliveries insert nothing twice.
- Supabase store (`wa_threads`, `wa_messages`) — RLS with no policies;
  all access through token-gated `SECURITY DEFINER` RPCs
  (`api.wa_ingest`, `api.wa_threads`, `api.wa_thread_messages`).
- The Chats panel on the WhatsApp view — thread list + conversation
  bubbles, both directions, ~8s refresh. Replies sent from the customer
  chat system arrive here as Coexistence echo events, so the thread reads
  as a whole conversation; sending is not possible from Glance.

## Go-live steps, in order

1. **Blue badge answer first.** Ask Meta support whether the number's
   Approved Official Business Account status survives Coexistence.
   Research says new Coexistence accounts can't get the badge; whether an
   existing one is kept needs their answer. Do not proceed without it.
2. **Eligibility probe (zero risk).** Start Coexistence onboarding only
   far enough to see whether "Connect your existing WhatsApp Business
   App" is offered for +961 70 708 585, then stop. No change is made.
3. **Complete Coexistence in ONE SITTING, phone in hand.** The QR is
   scanned from inside the logged-in app (Settings → Account → Business
   Platform). The app stays signed in — that is the design. The 2026-08-29
   lockout was a half-finished run of exactly this flow; finished, it is
   a non-event. App version must be ≥ 2.24.17.
4. **Vercel env (Production):**
   - `META_APP_SECRET` — the app secret of the Meta app that owns the
     webhook subscription (App dashboard → Settings → Basic).
   - `WHATSAPP_VERIFY_TOKEN` — any long random string you invent; used
     once in step 5's handshake.
   - Confirm `GLANCE_SIGNALS_TOKEN` is present (it already is for the
     analytics) — every wa_* RPC is gated on it, and without it the
     webhook would 500 on each delivery and put Meta into a retry loop.
   Redeploy after adding (env vars bind at deploy time).
5. **Subscribe the webhook.** App dashboard → WhatsApp → Configuration:
   - Callback URL: `https://<dashboard-domain>/api/whatsapp/webhook`
   - Verify token: the value from step 4 (Meta calls GET, the route
     answers the challenge).
   - Subscribe to the `messages` field, and enable the coexistence echo
     field (`smb_message_echoes`) so replies sent from the phone appear.
6. **Test:** message the business number from a personal phone. The chat
   appears in the dashboard within about ten seconds (webhook delivery
   plus the inbox's 8s poll); reply from the phone app and the reply
   appears too.

## Standing rules once live

- Open the WhatsApp Business app at least every **14 days** (Coexistence
  disconnects on primary-device inactivity).
- **Never uninstall** the app while Coexistence is active.
- Broadcast lists stop working; groups and calls stay app-only.

## Local testing

`node scripts/e2e-webhook.mjs` against `next dev` with the dev secrets in
the script header — exercises handshake, signature rejection, inbound,
echo, replay idempotency, and status updates end-to-end.

**Know where it writes:** there is one Supabase project, so with
`GLANCE_SIGNALS_TOKEN` in `.env.local` the test rows land in the SAME
chat store the live dashboard reads. Delete them afterwards:
`delete from wa_messages where wa_id = '96170000001';` and the matching
`wa_threads` row.
