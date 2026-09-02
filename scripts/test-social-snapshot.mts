import {
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
check("no model mentioned -> undefined", modelFromCaption("Happy Eid from Monza SAL") === undefined);
check("empty caption -> undefined", modelFromCaption(undefined) === undefined);

console.log("profile keys are stable identifiers:");
check("brand:network shape", profileKey("voyah", "instagram") === "voyah:instagram");
check("distinct per network", profileKey("voyah", "facebook") !== profileKey("voyah", "instagram"));

if (failures) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nall social snapshot checks passed");
