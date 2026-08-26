import { format, startOfWeek, subDays } from "date-fns";
import { cached } from "./cache";
import { fetchDeadUrls } from "./deadurls";
import { fetchPortfolio, getCachedHealth } from "./portfolio";
import type { DigestPayload, DigestSiteSummary } from "./types";

/**
 * Weekly management digest: what changed, what matters, what needs action.
 * Deterministic insights only — every line is grounded in the numbers it
 * ships with; observations and hypotheses are worded as such.
 */

function pct(current: number, previous: number): string | null {
  if (!Number.isFinite(previous) || previous <= 0) return null;
  const change = ((current - previous) / previous) * 100;
  if (Math.abs(change) < 0.5) return "±0%";
  return `${change > 0 ? "+" : "−"}${Math.abs(change).toFixed(0)}%`;
}

export async function buildDigest(): Promise<DigestPayload> {
  const [portfolio, health, deadUrls] = await Promise.all([
    fetchPortfolio("7d", "lb"),
    // Health is best-effort with a hard deadline: a cold health run must not
    // push the whole digest job past its execution limit.
    Promise.race([
      getCachedHealth().catch(() => null),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 20_000)),
    ]),
    cached("deadurls:7d", 15 * 60_000, () => fetchDeadUrls("7d")).catch(
      () => null,
    ),
  ]);

  const topModelFor = (domain: string): string | null =>
    [...portfolio.demand]
      .sort((a, b) => (b.bySite[domain] ?? 0) - (a.bySite[domain] ?? 0))
      .find((d) => (d.bySite[domain] ?? 0) > 0)?.vehicle ?? null;

  const sites: DigestSiteSummary[] = portfolio.sites.map((s) => ({
    name: s.name,
    domain: s.domain,
    users: s.users,
    prevUsers: s.prevUsers,
    signals: s.signals,
    prevSignals: s.prevSignals,
    signalRate: s.signalRate,
    topModel: topModelFor(s.domain),
    gaError: s.error,
  }));

  const gaOkSites = sites.filter((s) => !s.gaError);
  const totals = {
    users: gaOkSites.reduce((a, s) => a + s.users, 0),
    prevUsers: gaOkSites.reduce((a, s) => a + s.prevUsers, 0),
    sessions: portfolio.sites
      .filter((s) => !s.error)
      .reduce((a, s) => a + s.sessions, 0),
    signals: sites.reduce((a, s) => a + s.signals, 0),
    prevSignals: sites.reduce((a, s) => a + s.prevSignals, 0),
  };

  const healthWarnings: string[] = [];
  for (const site of health?.sites ?? []) {
    if (site.status === "warning" || site.status === "critical") {
      healthWarnings.push(`${site.site}: ${site.summary}`);
    }
  }
  for (const s of sites) {
    if (s.gaError) {
      healthWarnings.push(`${s.name}: GA query failed (${s.gaError}) — user counts unavailable`);
    }
  }
  if (portfolio.signalsError) {
    healthWarnings.push(`Signals source: ${portfolio.signalsError}`);
  }

  const openDead = (deadUrls?.rows ?? []).filter((r) => r.verdict === "open");

  const insights: string[] = [];
  const totalDelta = pct(totals.users, totals.prevUsers);
  if (totalDelta && gaOkSites.length === sites.length) {
    insights.push(`Visitors ${totalDelta} vs last week (${totals.users} across all sites, Lebanon traffic).`);
  } else if (gaOkSites.length < sites.length) {
    insights.push(
      `GA data unavailable for ${sites.length - gaOkSites.length} of ${sites.length} sites — traffic totals below are partial.`,
    );
  }
  const signalsDelta = pct(totals.signals, totals.prevSignals);
  if (signalsDelta) insights.push(`Intent signals ${signalsDelta} vs last week (${totals.signals} total).`);
  for (const s of sites) {
    if (s.gaError) continue;
    const d = pct(s.users, s.prevUsers);
    if (d && Math.abs(((s.users - s.prevUsers) / Math.max(s.prevUsers, 1)) * 100) >= 15 && s.prevUsers >= 20) {
      insights.push(`${s.name} traffic ${d} (${s.prevUsers} → ${s.users} users).`);
    }
    if (s.prevSignals >= 5 && s.signals === 0) {
      insights.push(
        `${s.name} recorded zero signals this week after ${s.prevSignals} last week — check tracking before assuming demand fell.`,
      );
    }
  }
  if (portfolio.demand[0]) {
    insights.push(
      `${portfolio.demand[0].vehicle} generated the most first-party demand (${portfolio.demand[0].total} signals — directional at this volume).`,
    );
  }
  if (openDead.length > 0) {
    insights.push(
      `${openDead.length} dead URL${openDead.length > 1 ? "s" : ""} still receiving traffic (top: ${openDead[0].path}, ${openDead[0].hits} users).`,
    );
  }
  if (healthWarnings.length === 0 && health) {
    insights.push("No tracking failures detected across monitored pages.");
  } else if (healthWarnings.length > 0) {
    insights.push(
      `${healthWarnings.length} tracking warning${healthWarnings.length > 1 ? "s" : ""} need attention (details below).`,
    );
  }

  // The trailing-7-day GA window is essentially the PREVIOUS week when the
  // Monday-morning cron fires — label the digest with the week it reports.
  const monday = startOfWeek(new Date(), { weekStartsOn: 1 });
  const reportedMonday = subDays(monday, 7);
  return {
    weekOf: format(reportedMonday, "yyyy-MM-dd"),
    generatedAt: new Date().toISOString(),
    totals,
    sites,
    demand: portfolio.demand.slice(0, 8),
    healthWarnings,
    deadUrls: openDead
      .slice(0, 5)
      .map((r) => ({ path: r.path, hits: r.hits, verdict: r.verdict })),
    insights,
  };
}

export function renderDigestText(d: DigestPayload): string {
  const lines: string[] = [];
  lines.push(`Glance — Week of ${d.weekOf}`);
  lines.push("");
  for (const i of d.insights) lines.push(`• ${i}`);
  lines.push("");
  lines.push(
    `Totals: ${d.totals.users} users · ${d.totals.sessions} sessions · ${d.totals.signals} intent signals`,
  );
  lines.push("");
  for (const s of d.sites) {
    lines.push(
      `${s.name}: ${s.gaError ? "users unavailable (GA error)" : `${s.users} users`} · ${s.signals} signals` +
        (s.signalRate !== null ? ` · ${s.signalRate.toFixed(1)}% signal rate` : "") +
        (s.topModel ? ` · top interest: ${s.topModel}` : ""),
    );
  }
  if (d.demand.length) {
    lines.push("");
    lines.push("Model demand (all sites, directional):");
    for (const m of d.demand.slice(0, 6)) lines.push(`  ${m.vehicle} — ${m.total}`);
  }
  if (d.healthWarnings.length) {
    lines.push("");
    lines.push("Needs attention:");
    for (const w of d.healthWarnings) lines.push(`  ⚠ ${w}`);
  }
  if (d.deadUrls.length) {
    lines.push("");
    lines.push("Open dead URLs:");
    for (const u of d.deadUrls) lines.push(`  ${u.path} — ${u.hits} users`);
  }
  return lines.join("\n");
}

export function renderDigestHtml(d: DigestPayload): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const row = (label: string, value: string) =>
    `<tr><td style="padding:4px 12px 4px 0;color:#3d5160">${esc(label)}</td><td style="padding:4px 0;font-weight:600">${esc(value)}</td></tr>`;
  return `
<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:560px;margin:0 auto;color:#12202b">
  <p style="letter-spacing:.2em;font-size:12px;font-weight:700;color:#0b6f61;text-transform:uppercase">Glance</p>
  <h1 style="font-size:22px;margin:4px 0 16px">Week of ${esc(d.weekOf)}</h1>
  <ul style="padding-left:18px;line-height:1.6">${d.insights.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>
  <h2 style="font-size:15px;margin:20px 0 6px">Sites (Lebanon traffic, 7 days)</h2>
  <table style="border-collapse:collapse;font-size:14px">${d.sites
    .map((s) =>
      row(
        s.name,
        `${s.gaError ? "users unavailable (GA error)" : `${s.users} users`} · ${s.signals} signals` +
          (s.signalRate !== null ? ` · ${s.signalRate.toFixed(1)}%` : "") +
          (s.topModel ? ` · top: ${s.topModel}` : ""),
      ),
    )
    .join("")}</table>
  <h2 style="font-size:15px;margin:20px 0 6px">Model demand — all sites</h2>
  <table style="border-collapse:collapse;font-size:14px">${d.demand
    .slice(0, 6)
    .map((m) => row(m.vehicle, String(m.total)))
    .join("")}</table>
  ${
    d.healthWarnings.length
      ? `<h2 style="font-size:15px;margin:20px 0 6px;color:#b4530a">Needs attention</h2><ul style="padding-left:18px;line-height:1.6">${d.healthWarnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>`
      : `<p style="color:#0b6f61;margin-top:20px">No tracking failures detected.</p>`
  }
  ${
    d.deadUrls.length
      ? `<h2 style="font-size:15px;margin:20px 0 6px">Open dead URLs</h2><ul style="padding-left:18px">${d.deadUrls.map((u) => `<li>${esc(u.path)} — ${u.hits} users</li>`).join("")}</ul>`
      : ""
  }
  <p style="color:#3d5160;font-size:12px;margin-top:24px">Generated ${esc(d.generatedAt)} · glance-dashboard-iota.vercel.app</p>
</div>`;
}

export interface DigestSendResult {
  sent: boolean;
  detail: string;
}

/** Email via Resend when configured; otherwise report exactly why not. */
export async function sendDigestEmail(
  d: DigestPayload,
): Promise<DigestSendResult> {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.DIGEST_TO;
  const from = process.env.DIGEST_FROM || "Glance <onboarding@resend.dev>";
  if (!key || !to) {
    return {
      sent: false,
      detail:
        "Email not configured — set RESEND_API_KEY and DIGEST_TO (comma-separated) in the environment.",
    };
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: to.split(",").map((s) => s.trim()),
      subject: `Glance weekly — ${d.weekOf}`,
      html: renderDigestHtml(d),
      text: renderDigestText(d),
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`digest email failed (${res.status}): ${body.slice(0, 300)}`);
    return { sent: false, detail: `Email provider returned ${res.status}` };
  }
  return { sent: true, detail: `Sent to ${to}` };
}
