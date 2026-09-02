import { buildWhatsAppPayload } from "../src/lib/whatsapp";

let failures = 0;
function check(name: string, cond: boolean) {
  if (cond) console.log(`  ok   ${name}`);
  else { console.log(`  FAIL ${name}`); failures++; }
}

// Fixed clock: 2026-08-29 12:00 UTC = 15:00 Beirut (same calendar day).
const now = new Date("2026-08-29T12:00:00Z");
const row = (day: string, hour: number, site: string, page: string, vehicle: string, n: number) =>
  ({ day, hour, site, source_page: page, vehicle, n });

const rows = [
  // current 7d window (>= 2026-08-22)
  row("2026-08-28", 18, "voyahlebanon.com", "voyahlebanon.com/models/free", "VOYAH Free", 3),
  row("2026-08-24", 9, "mherolebanon.com", "mherolebanon.com/mhero-1", "MHERO 1", 2),
  row("2026-08-22", 18, "voyahlebanon.com", "voyahlebanon.com/", "VOYAH", 1), // brand-level
  // previous window (2026-08-14 .. 2026-08-21)
  row("2026-08-20", 11, "voyahlebanon.com", "voyahlebanon.com/models/free", "VOYAH Free", 4),
  row("2026-08-14", 11, "monzasal.com", "index.html", "unspecified", 1),
  // outside both windows — must be ignored
  row("2026-08-01", 10, "voyahlebanon.com", "voyahlebanon.com/", "VOYAH Free", 99),
];

const p = buildWhatsAppPayload(rows as never, "7d", now);

console.log("window split:");
check("current total = 6", p.total === 6);
check("previous total = 5", p.previousTotal === 5);
check("stale rows ignored", !p.daily.some((d) => d.total === 99));

console.log("model vs brand split:");
check("VOYAH Free ranked with prev", p.byModel[0].label === "VOYAH Free" && p.byModel[0].total === 3 && p.byModel[0].previousTotal === 4);
check("MHERO 1 ranked", p.byModel.some((m) => m.label === "MHERO 1" && m.total === 2));
check("brand-level VOYAH separated, not ranked as model", p.brandLevel.some((b) => b.label === "VOYAH") && !p.byModel.some((m) => m.label === "VOYAH"));
check("unspecified excluded from brand-level", !p.brandLevel.some((b) => b.label === "unspecified"));

console.log("brand vocabulary — exactly three brands, drift surfaced:");
const vocab = buildWhatsAppPayload(
  [
    row("2026-08-28", 10, "monzasal.com", "index.html", "Monza SAL", 5),
    row("2026-08-28", 11, "voyahlebanon.com", "voyahlebanon.com/", "VOYAH", 3),
    row("2026-08-28", 12, "mherolebanon.com", "mherolebanon.com/", "MHERO", 2),
    // A spelling the database normalizer does not yet know — exactly how
    // "Monza" appeared on 2026-09-02 and rendered as a fourth brand.
    row("2026-08-28", 13, "monzasal.com", "index.html", "Monza Group", 4),
  ] as never,
  "7d",
  now,
);
check("exactly three brands", vocab.brandLevel.length === 3);
check(
  "the three are VOYAH / MHERO / Monza SAL",
  ["VOYAH", "MHERO", "Monza SAL"].every((b) =>
    vocab.brandLevel.some((x) => x.label === b),
  ),
);
check("a drifting spelling is NOT counted as a brand",
  !vocab.brandLevel.some((x) => x.label === "Monza Group"));
check("it surfaces as unrecognised instead",
  vocab.unrecognised.length === 1 && vocab.unrecognised[0].label === "Monza Group");
check("unrecognised is still counted, not dropped", vocab.unrecognised[0].total === 4);
check("brands never leak into the model ranking",
  !vocab.byModel.some((m) => ["VOYAH", "MHERO", "Monza SAL", "Monza Group"].includes(m.label)));

console.log("time distributions (current window only):");
check("hour 18 = 4 clicks", p.byHour[18] === 4);
check("hour 9 = 2 clicks", p.byHour[9] === 2);
check("previous-window hours not counted", p.byHour[11] === 0);
// 2026-08-28 is a Friday (index 4 with 0=Mon), 2026-08-24 a Monday, 2026-08-22 a Saturday
check("Fri = 3", p.byDow[4] === 3);
check("Mon = 2", p.byDow[0] === 2);
check("Sat = 1", p.byDow[5] === 1);

console.log("daily series:");
check("dense series spans window (8 points for 7d)", p.daily.length === 8);
check("zero days present", p.daily.some((d) => d.total === 0));
check("2026-08-28 = 3", p.daily.find((d) => d.date === "2026-08-28")?.total === 3);

console.log("pages:");
check("top page is /models/free", p.byPage[0].page === "voyahlebanon.com/models/free" && p.byPage[0].total === 3);
check("pages exclude previous window", !p.byPage.some((x) => x.page === "index.html"));

console.log("cross-site page separation:");
// Same bare path from two different sites must stay two rows, each with its
// own site — merging them credits one site with the other's clicks.
const p2 = buildWhatsAppPayload(
  [
    row("2026-08-28", 10, "monzasal.com", "index.html", "unspecified", 2),
    row("2026-08-28", 11, "mherolebanon.com", "index.html", "MHERO 1", 1),
  ] as never,
  "7d",
  now,
);
check("two rows for the same path", p2.byPage.length === 2);
check("each keeps its own site", new Set(p2.byPage.map((x) => x.site)).size === 2);
check("counts not merged", p2.byPage[0].total === 2 && p2.byPage[1].total === 1);

console.log("string-typed counts coerced:");
const p3 = buildWhatsAppPayload(
  [row("2026-08-28", 10, "monzasal.com", "index.html", "unspecified", "3" as never)] as never,
  "7d",
  now,
);
check("'3' counted as 3, not concatenated", p3.total === 3);

if (failures) { console.log(`\n${failures} check(s) failed`); process.exit(1); }
console.log("\nall whatsapp stat checks passed");
