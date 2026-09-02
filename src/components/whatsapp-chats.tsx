"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The WhatsApp inbox: every conversation between the business and a
 * customer, read-only, refreshed continuously.
 *
 * Self-polling on purpose — chats refresh on their own cadence (~8s, like
 * the realtime panel's 15s), independent of the analytics range selector,
 * so this component owns its fetching rather than threading yet another
 * loader through dashboard.tsx.
 *
 * Until Coexistence go-live the store is empty and the panel says exactly
 * what remains, instead of pretending to be broken.
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
  direction: "in" | "out";
  msg_type: string;
  body: string | null;
  sent_at: string;
  status: string | null;
}

const POLL_MS = 8_000;

/**
 * What to call a thread. Meta's BSUID rollout means a customer can hide
 * their phone number behind a username, so the number is no longer
 * guaranteed — fall back through name, username, then the opaque id rather
 * than rendering "+" in front of a BSUID.
 */
function threadTitle(t: {
  profile_name: string | null;
  username: string | null;
  phone: string | null;
  contact_id: string;
  id_kind: string;
}): string {
  if (t.profile_name) return t.profile_name;
  if (t.phone) return `+${t.phone}`;
  if (t.username) return `@${t.username}`;
  return t.id_kind === "bsuid" ? "WhatsApp contact" : `+${t.contact_id}`;
}

/** The secondary line: the number when known, else the username. */
function threadSubtitle(t: {
  profile_name: string | null;
  username: string | null;
  phone: string | null;
}): string {
  if (t.phone) return `+${t.phone}`;
  if (t.username) return `@${t.username}`;
  return "";
}

function timeLabel(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function WhatsAppChats() {
  const [threads, setThreads] = useState<ThreadRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageRow[] | null>(null);
  const [messagesStale, setMessagesStale] = useState(false);
  const threadSeq = useRef(0);
  const messageSeq = useRef(0);
  const messageFailures = useRef(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const lastScrollKey = useRef<string | null>(null);

  const loadThreads = useCallback(async () => {
    const seq = ++threadSeq.current;
    try {
      const res = await fetch("/api/whatsapp/chats", { cache: "no-store" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `Chats failed (${res.status})`);
      }
      const data = (await res.json()) as { threads: ThreadRow[] };
      if (seq !== threadSeq.current) return;
      setThreads(data.threads);
      setError(null);
    } catch (err) {
      if (seq !== threadSeq.current) return;
      setError(err instanceof Error ? err.message : "Chats unavailable");
    }
  }, []);

  const loadMessages = useCallback(async (waId: string) => {
    const seq = ++messageSeq.current;
    try {
      const res = await fetch(
        `/api/whatsapp/chats?thread=${encodeURIComponent(waId)}`,
        { cache: "no-store" },
      );
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { messages: MessageRow[] };
      if (seq !== messageSeq.current) return;
      messageFailures.current = 0;
      setMessagesStale(false);
      setMessages(data.messages);
    } catch {
      // One or two missed polls are routine; a run of them means the last
      // successful snapshot is going stale, and pretending it is current
      // would misrepresent a customer conversation.
      if (seq !== messageSeq.current) return;
      messageFailures.current += 1;
      if (messageFailures.current >= 3) setMessagesStale(true);
    }
  }, []);

  useEffect(() => {
    void loadThreads();
    const t = setInterval(() => void loadThreads(), POLL_MS);
    return () => clearInterval(t);
  }, [loadThreads]);

  useEffect(() => {
    // Reset on every selection change — without this, thread A's bubbles
    // keep rendering under thread B's highlight until B's fetch lands.
    setMessages(null);
    setMessagesStale(false);
    messageFailures.current = 0;
    lastScrollKey.current = null;
    if (!selected) return;
    void loadMessages(selected);
    const t = setInterval(() => void loadMessages(selected), POLL_MS);
    return () => clearInterval(t);
  }, [selected, loadMessages]);

  // Stick to the newest message — but only when the content actually
  // changed, and never while the reader has scrolled up into history.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || messages === null) return;
    const key = `${messages.length}:${messages[messages.length - 1]?.id ?? ""}`;
    if (key === lastScrollKey.current) return;
    const firstRender = lastScrollKey.current === null;
    lastScrollKey.current = key;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 200;
    if (firstRender || nearBottom) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const empty = threads !== null && threads.length === 0;

  return (
    <section className="panel animate-rise rounded-2xl p-4 sm:rounded-3xl sm:p-5 md:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold tracking-tight text-ink sm:text-xl">
            Chats
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            Conversations on +961 70 708 585 · refreshes about every 10
            seconds
          </p>
        </div>
        <span className="rounded-full bg-sand/80 px-3 py-1 text-[11px] font-medium text-ink-soft">
          read-only inbox · replying stays on the phone for now
        </span>
      </div>

      {error ? (
        <p className="mt-4 text-sm text-ink-soft">{error}</p>
      ) : empty ? (
        <div className="mt-4 rounded-xl bg-sand/50 p-4">
          <p className="text-sm font-medium text-ink">
            No chats yet — the live link isn&apos;t connected.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            Two things make it fill: a fully completed Coexistence setup
            (done in one sitting, phone in hand — the phone keeps working)
            and the webhook configuration in docs/WHATSAPP_LIVE.md. Until
            both are done the store stays empty, and this dashboard sends
            nothing and registers nothing on its own.
          </p>
        </div>
      ) : threads === null ? (
        <p className="mt-4 text-sm text-ink-soft">Loading chats…</p>
      ) : (
        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(220px,1fr)_2fr]">
          <ul className="max-h-[420px] space-y-1 overflow-y-auto pr-1">
            {threads.map((t) => (
              <li key={t.contact_id}>
                <button
                  onClick={() => setSelected(t.contact_id)}
                  className={`w-full rounded-xl p-3 text-left transition-colors ${
                    selected === t.contact_id ? "bg-sand" : "hover:bg-sand/50"
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                      {threadTitle(t)}
                    </p>
                    <p className="shrink-0 text-[11px] text-ink-soft">
                      {timeLabel(t.last_message_at)}
                    </p>
                  </div>
                  <p className="mt-0.5 truncate text-[12px] text-ink-soft">
                    {t.profile_name && threadSubtitle(t)
                      ? `${threadSubtitle(t)} · `
                      : ""}
                    {t.last_direction === "out" ? "You: " : ""}
                    {t.last_preview ?? ""}
                  </p>
                </button>
              </li>
            ))}
          </ul>

          <div className="flex max-h-[420px] min-h-[240px] flex-col rounded-xl bg-sand/40 p-3">
            {!selected ? (
              <p className="m-auto text-sm text-ink-soft">
                Select a conversation
              </p>
            ) : messages === null ? (
              <p className="m-auto text-sm text-ink-soft">Loading…</p>
            ) : (
              <div ref={scrollRef} className="space-y-2 overflow-y-auto">
                {messagesStale ? (
                  <p className="rounded-lg bg-sand px-3 py-1.5 text-center text-[11px] text-ink-soft">
                    Connection lost — showing the last loaded messages
                  </p>
                ) : null}
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`flex ${m.direction === "out" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-snug ${
                        m.direction === "out"
                          ? "rounded-br-sm bg-teal/15 text-ink"
                          : "rounded-bl-sm bg-white text-ink"
                      }`}
                    >
                      <p className="whitespace-pre-wrap break-words">{m.body}</p>
                      <p className="mt-1 text-right text-[10px] text-ink-soft">
                        {timeLabel(m.sent_at)}
                        {m.direction === "out" && m.status
                          ? ` · ${m.status}`
                          : ""}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
