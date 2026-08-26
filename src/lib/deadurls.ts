import { dateRangesFor, dimensionValue, getClient, metricNumber, propertyPath } from "./ga";
import type { DateRangeKey, DeadUrlRow, DeadUrlsPayload } from "./types";

/**
 * Monza-focused dead-URL report: pages GA still records traffic for that do
 * not resolve to real content. Live status is probed without following
 * redirects so "redirect deployed" (301/308) is distinguishable from an open
 * 404 — once a redirect verifiably works the row stops being an alarm and
 * becomes history.
 */
const MONZA_PROPERTY = "547222815";
const BASE = "https://www.monzasal.com";

/** Legacy paths we know about; always probed so their fixed/open state shows
 * even after traffic to them dies down. */
const KNOWN_LEGACY = [
  "/m-hero",
  "/armored-vehicles",
  "/luxurious-armored-vehicles",
  "/showroom",
  "/index.php/armored",
  "/bulletproof-rolls-royce",
  "/category/uncategorized",
];

async function fetchStatus(url: string): Promise<{ status: number; location: string | null }> {
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": "GlanceHealth/1.0 (+monzasal.com)" },
    });
    const location = res.headers.get("location");
    // Release the connection — undici keeps it open until the body is drained.
    try {
      await res.body?.cancel();
    } catch {}
    return { status: res.status, location };
  } catch {
    return { status: 0, location: null };
  }
}

/** A redirect only counts as deployed when its target actually resolves —
 * a 301 into a 404 is still an open dead URL. */
async function probe(path: string): Promise<{ status: number; verdict: DeadUrlRow["verdict"] }> {
  const first = await fetchStatus(BASE + path);
  if (first.status === 404 || first.status === 410) return { status: first.status, verdict: "open" };
  if (first.status === 200) return { status: first.status, verdict: "resolved" };
  if (first.status >= 300 && first.status < 400 && first.location) {
    const target = new URL(first.location, BASE).toString();
    const hop = await fetchStatus(target);
    const landsOk =
      hop.status === 200 || (hop.status >= 300 && hop.status < 400);
    return {
      status: first.status,
      verdict: landsOk ? "redirect-deployed" : "open",
    };
  }
  return { status: first.status, verdict: "unknown" };
}

async function probeAll(
  paths: string[],
): Promise<Array<{ status: number; verdict: DeadUrlRow["verdict"] }>> {
  // Batched so ~47 candidates don't hit the small site in one burst.
  const results: Array<{ status: number; verdict: DeadUrlRow["verdict"] }> = [];
  const batchSize = 8;
  for (let i = 0; i < paths.length; i += batchSize) {
    const batch = paths.slice(i, i + batchSize);
    results.push(...(await Promise.all(batch.map((p) => probe(p)))));
  }
  return results;
}

export async function fetchDeadUrls(
  range: DateRangeKey,
): Promise<DeadUrlsPayload> {
  const client = getClient();
  const property = propertyPath(MONZA_PROPERTY);
  const { current } = dateRangesFor(range);

  const [hitsRes, bySourceRes, byDateRes] = await Promise.all([
    // Hit counts come from a path-only report — summing across
    // (path, source) rows would count multi-source users repeatedly.
    client.runReport({
      property,
      dateRanges: [current],
      dimensions: [{ name: "pagePath" }],
      metrics: [{ name: "totalUsers" }],
      orderBys: [{ metric: { metricName: "totalUsers" }, desc: true }],
      limit: 100,
    }),
    client.runReport({
      property,
      dateRanges: [current],
      dimensions: [{ name: "pagePath" }, { name: "sessionSource" }],
      metrics: [{ name: "totalUsers" }],
      orderBys: [{ metric: { metricName: "totalUsers" }, desc: true }],
      limit: 200,
    }),
    client.runReport({
      property,
      dateRanges: [current],
      dimensions: [{ name: "pagePath" }, { name: "date" }],
      metrics: [{ name: "totalUsers" }],
      limit: 1000,
    }),
  ]);

  const hitsByPath = new Map<string, number>();
  for (const row of hitsRes[0].rows ?? []) {
    hitsByPath.set(dimensionValue(row, 0), metricNumber(row, 0));
  }
  const topSourceByPath = new Map<string, { source: string; users: number }>();
  for (const row of bySourceRes[0].rows ?? []) {
    const path = dimensionValue(row, 0);
    const source = dimensionValue(row, 1) || "(direct)";
    const users = metricNumber(row, 0);
    const top = topSourceByPath.get(path);
    if (!top || users > top.users) topSourceByPath.set(path, { source, users });
  }

  const datesByPath = new Map<string, { first: string; last: string }>();
  for (const row of byDateRes[0].rows ?? []) {
    const path = dimensionValue(row, 0);
    const raw = dimensionValue(row, 1);
    const date = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
    const cur = datesByPath.get(path);
    datesByPath.set(path, {
      first: cur && cur.first < date ? cur.first : date,
      last: cur && cur.last > date ? cur.last : date,
    });
  }

  // Candidates: every GA path (top 40 by hits) plus the known legacy list.
  const gaPaths = [...hitsByPath.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 40)
    .map(([path]) => path);
  const candidates = [...new Set([...gaPaths, ...KNOWN_LEGACY])].filter(
    (p) => p.startsWith("/") && p.length < 200,
  );

  const probes = await probeAll(candidates);

  const rows: DeadUrlRow[] = [];
  candidates.forEach((path, i) => {
    const { status, verdict } = probes[i];
    const isLegacy = KNOWN_LEGACY.includes(path);
    // Healthy pages are not dead URLs; keep 200s only for known legacy paths
    // (a legacy path serving 200 means someone resolved it with content).
    if (status === 200 && !isLegacy) return;
    if (status === 0 && !isLegacy && (hitsByPath.get(path) ?? 0) < 2) return;
    rows.push({
      path,
      hits: hitsByPath.get(path) ?? 0,
      topSource: topSourceByPath.get(path)?.source ?? "—",
      firstSeen: datesByPath.get(path)?.first ?? "—",
      lastSeen: datesByPath.get(path)?.last ?? "—",
      liveStatus: status,
      verdict,
    });
  });

  rows.sort((a, b) => {
    const order = { open: 0, unknown: 1, "redirect-deployed": 2, resolved: 3 };
    return order[a.verdict] - order[b.verdict] || b.hits - a.hits;
  });

  return {
    propertyId: MONZA_PROPERTY,
    range,
    fetchedAt: new Date().toISOString(),
    rows,
  };
}
