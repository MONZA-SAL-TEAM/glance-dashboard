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

async function probe(path: string): Promise<number> {
  try {
    const res = await fetch(BASE + path, {
      method: "GET",
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": "GlanceHealth/1.0 (+monzasal.com)" },
    });
    return res.status;
  } catch {
    return 0;
  }
}

function verdictFor(status: number): DeadUrlRow["verdict"] {
  if (status === 404 || status === 410) return "open";
  if (status >= 300 && status < 400) return "redirect-deployed";
  if (status === 200) return "resolved";
  return "unknown";
}

export async function fetchDeadUrls(
  range: DateRangeKey,
): Promise<DeadUrlsPayload> {
  const client = getClient();
  const property = propertyPath(MONZA_PROPERTY);
  const { current } = dateRangesFor(range);

  const [bySourceRes, byDateRes] = await Promise.all([
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
  const topSourceByPath = new Map<string, { source: string; users: number }>();
  for (const row of bySourceRes[0].rows ?? []) {
    const path = dimensionValue(row, 0);
    const source = dimensionValue(row, 1) || "(direct)";
    const users = metricNumber(row, 0);
    hitsByPath.set(path, (hitsByPath.get(path) ?? 0) + users);
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

  const statuses = await Promise.all(candidates.map((p) => probe(p)));

  const rows: DeadUrlRow[] = [];
  candidates.forEach((path, i) => {
    const status = statuses[i];
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
      verdict: verdictFor(status),
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
