import {
  matchModel,
  modelFromCaption,
  profileKey,
  reconstructFollowerLevels,
  seriesByDay,
} from "../src/lib/social-snapshot";

let failures = 0;
function check(name: string, cond: boolean) {
  if (cond) console.log(`  ok   ${name}`);
  else {
    console.log(`  FAIL ${name}`);
    failures++;
  }
}

console.log("daily series day-attribution (Meta's end_time is exclusive):");
// Meta stamps each bucket with the START of the following day. A bucket
// labelled 2026-09-03T07:00:00+0000 holds SEPTEMBER 2nd's number. Getting
// this wrong shifts the whole history by a day.
const series = seriesByDay({
  name: "reach",
  values: [
    { value: 1200, end_time: "2026-09-02T07:00:00+0000" },
    { value: 1500, end_time: "2026-09-03T07:00:00+0000" },
  ],
});
check("bucket attributed to the day it measures", series.get("2026-09-01") === 1200);
check("second bucket likewise", series.get("2026-09-02") === 1500);
check("no row for the label date itself", series.get("2026-09-03") === undefined);
check("exactly two days", series.size === 2);

console.log("malformed series entries are skipped, not guessed:");
const messy = seriesByDay({
  name: "reach",
  values: [
    { value: 10, end_time: "2026-09-02T07:00:00+0000" },
    { value: 20 },                                   // no end_time
    { value: 30, end_time: "not-a-date" },           // unparseable
    { value: { a: 1 }, end_time: "2026-09-04T07:00:00+0000" }, // object value
  ],
});
check("only the valid entry survives", messy.size === 1 && messy.get("2026-09-01") === 10);
check("undefined entry yields empty map", seriesByDay(undefined).size === 0);

console.log("follower level reconstruction (Meta sends deltas, not levels):");
// today = 3560 followers. Deltas: 2nd +10, 1st +20.
// So end of 1st = 3550, end of 31st Aug = 3530.
const levels = reconstructFollowerLevels(
  3560,
  new Map([
    ["2026-09-01", 20],
    ["2026-09-02", 10],
  ]),
  "2026-09-02",
);
check("today anchors to the absolute count", levels.get("2026-09-02") === 3560);
check("yesterday = today minus today's delta", levels.get("2026-09-01") === 3550);
check("day before = minus the next delta", levels.get("2026-08-31") === 3530);

console.log("follower reconstruction refuses to guess:");
check(
  "no absolute count -> empty map, not a fabricated series",
  reconstructFollowerLevels(undefined, new Map([["2026-09-01", 5]]), "2026-09-02").size === 0,
);
// A losing week must reconstruct upward into the past.
const losing = reconstructFollowerLevels(
  1000,
  new Map([["2026-09-01", -50]]),
  "2026-09-01",
);
check("negative delta reconstructs a higher earlier level", losing.get("2026-08-31") === 1050);

console.log("model tagging from captions:");
check(
  "longest match wins over its own prefix",
  modelFromCaption("The all-new VOYAH Passion L in Black") === "VOYAH Passion L",
);
check(
  "plain Passion still resolves to Passion",
  modelFromCaption("Introducing the VOYAH Passion") === "VOYAH Passion",
);
check(
  "hashtag without separators",
  modelFromCaption("Stunning. #voyahpassionl #monzasal") === "VOYAH Passion L",
);
check("case insensitive", modelFromCaption("the voyah free is here") === "VOYAH Free");
check("MHERO models", modelFromCaption("MHERO 1 conquering the dunes") === "MHERO 1");
// Free vs Free+ : collapsing "+" away makes these identical, and Free+ is the
// longer name, so every Free mention would silently become Free+.
check("plain Free is not relabelled as Free+", modelFromCaption("the voyah free is here") === "VOYAH Free");
check("Free+ still resolves when actually named", modelFromCaption("The VOYAH Free+ arrives") === "VOYAH Free+");
check("#voyahfree stays Free", modelFromCaption("out now #voyahfree") === "VOYAH Free");
check("#voyahfreeplus is Free+", modelFromCaption("out now #voyahfreeplus") === "VOYAH Free+");
// An exact mention must beat a collapsed match on a different model.
check("exact beats collapsed across models", matchModel("voyah free").status === "recognized");
check("no model mentioned -> undefined", modelFromCaption("Happy Eid from Monza SAL") === undefined);
check("empty caption -> undefined", modelFromCaption(undefined) === undefined);

console.log("raw + canonical + status (audit trail, not just the answer):");
const exact = matchModel("The all-new VOYAH Passion L in Black");
check("exact mention -> recognized", exact.status === "recognized");
check("canonical value", exact.model === "VOYAH Passion L");
check("raw recorded", exact.raw === "VOYAH Passion L");

const tagged = matchModel("Stunning in Sage Green. #voyahpassionl #monzasal");
check("hashtag -> normalized, not recognized", tagged.status === "normalized");
check("still maps to the canonical value", tagged.model === "VOYAH Passion L");
check(
  "raw preserves what the caption ACTUALLY said",
  tagged.raw?.toLowerCase().includes("voyahpassionl") === true,
);

const nothing = matchModel("Happy Eid from all of us at Monza SAL");
check("no model -> status none", nothing.status === "none");
check("no canonical invented", nothing.model === undefined);
check("no raw invented", nothing.raw === undefined);
check("empty caption -> none", matchModel(undefined).status === "none");

// The audit-trail property that makes a later matcher fix appliable:
// from the stored raw alone you can tell WHY a row got its canonical value.
check(
  "recognized and normalized are distinguishable after the fact",
  exact.status !== tagged.status && exact.model === tagged.model,
);

console.log("profile keys are stable identifiers:");
check("brand:network shape", profileKey("voyah", "instagram") === "voyah:instagram");
check("distinct per network", profileKey("voyah", "facebook") !== profileKey("voyah", "instagram"));

if (failures) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nall social snapshot checks passed");
