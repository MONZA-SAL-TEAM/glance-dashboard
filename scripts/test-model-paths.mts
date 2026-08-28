import { modelForPath } from "../src/lib/models";
import { isCanonicalModel } from "../src/lib/sites";

const cases: Array<[string, string | null]> = [
  // VOYAH — canonical
  ["/models/free", "VOYAH Free"],
  ["/models/courage", "VOYAH Courage"],
  ["/models/dream", "VOYAH Dream"],
  ["/models/passion", "VOYAH Passion"],
  ["/models/passion-l", "VOYAH Passion L"],
  ["/models/taishan", "VOYAH Taishan"],
  ["/models/free-plus", "VOYAH Free+"],
  // shape variations GA can emit
  ["/models/free/", "VOYAH Free"],
  ["/models/free?utm_source=instagram", "VOYAH Free"],
  ["/models/FREE", "VOYAH Free"],
  ["/models/free.html", "VOYAH Free"],
  ["/models/passion-l/", "VOYAH Passion L"],
  ["/models/free-318-competition", "VOYAH Free"],
  // MHERO — public names, every alias folds in
  ["/mhero-1", "MHERO 1"],
  ["/mhero-2", "MHERO 2"],
  ["/mhero-1.html", "MHERO 1"],
  ["/mhero-2.html", "MHERO 2"],
  ["/917", "MHERO 1"],
  ["/817", "MHERO 2"],
  ["/mhero-917", "MHERO 1"],
  ["/mhero-817", "MHERO 2"],
  ["/model-1", "MHERO 1"],
  ["/model-2", "MHERO 2"],
  // must NOT match
  ["/", null],
  ["/models", null],
  ["/appointment", null],
  ["/charging", null],
  ["/mhero.html", null],
  ["/voyah.html", null],
  ["/models/passion-x", null],
  ["/about", null],
];

let pass = 0;
const failures: string[] = [];
for (const [input, expected] of cases) {
  const actual = modelForPath(input);
  if (actual === expected) pass++;
  else failures.push(`  ${input} -> got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
}

console.log(`model path mapping: ${pass}/${cases.length} passed`);
if (failures.length) {
  console.log("FAILURES:");
  console.log(failures.join("\n"));
  process.exit(1);
}

// Passion must never be shadowed by the Passion L rule or vice versa.
if (modelForPath("/models/passion") === modelForPath("/models/passion-l")) {
  console.log("FAIL: passion and passion-l collide");
  process.exit(1);
}
console.log("ordering check: passion vs passion-l distinct — OK");

// Every label a path can map to must be in CANONICAL_MODELS, or the demand
// board would silently file that model under "brand-level interest".
const mapped = new Set(
  cases.map(([input]) => modelForPath(input)).filter((v): v is string => v !== null),
);
const missing = [...mapped].filter((label) => !isCanonicalModel(label));
if (missing.length) {
  console.log(`FAIL: mapped labels missing from CANONICAL_MODELS: ${missing.join(", ")}`);
  process.exit(1);
}
console.log(`canonical-model coverage: ${mapped.size} mapped labels all recognised — OK`);
