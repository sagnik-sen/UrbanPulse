const test = require("node:test");
const assert = require("node:assert");
const { PARAMS } = require("./fusion");
const { trustFromReports, fusedZones, fusionSeverity, tickOf } = require("./fusion-live");

const NOW = 200_000; // tick 100
const rep = (id, deviceId, status, extra = {}) => ({ id, deviceId, zoneId: "z", severity: "high", ts: NOW, status, ...extra });
const zone = (level) => [{ id: "z", level }];
const run = (zones, reports, offline = new Set()) => fusedZones({ zones, reports, offline, now: NOW });

test("trust replays confirmed and false reports for one device", () => {
  const reports = [
    rep("1", "d", "resolved"),
    rep("2", "d", "in_progress"),
    rep("3", "d", "rejected"),
    rep("4", "d", "open"),
    rep("5", "other", "resolved"),
  ];
  assert.deepEqual(trustFromReports(reports, "d"), { a: 3, b: 4 });
  assert.deepEqual(trustFromReports(reports, "d", "1"), { a: 2, b: 4 }, "excluded report does not count");
  assert.equal(trustFromReports([rep("4", "d", "open")], "d"), null, "open reports carry no outcome");
  assert.equal(trustFromReports(reports, "unknown"), null);
  assert.equal(trustFromReports(reports, null), null, "anonymous reports have no trust record");
});

test("offline zone with no reports sits at the prior", () => {
  const out = run(zone(10), [], new Set(["z"]));
  assert.equal(out.z.p, Math.round(PARAMS.PRIOR * 100) / 100);
  assert.equal(out.z.sensorOnline, false);
  assert.equal(out.z.recentReports, 0);
});

test("offline zone flagged from several reports by an established reporter", () => {
  const past = [rep("p1", "e", "resolved", { zoneId: "elsewhere" }), rep("p2", "e", "resolved", { zoneId: "elsewhere" }), rep("p3", "e", "resolved", { zoneId: "elsewhere" })];
  const reports = [...past, rep("a", "e", "open"), rep("b", "e", "open"), rep("c", "e", "open")];
  const out = run(zone(10), reports, new Set(["z"]));
  assert.ok(out.z.p >= 0.5, `got ${out.z.p}`);
  assert.equal(out.z.recentReports, 3);
});

test("the same reports from brand-new devices stay below the declaration line", () => {
  const reports = [rep("a", "n1", "open"), rep("b", "n2", "open"), rep("c", "n3", "open")];
  const out = run(zone(10), reports, new Set(["z"]));
  assert.ok(out.z.p < 0.5, `got ${out.z.p}`);
});

test("rejected reports are ignored for the zone and do not count as recent", () => {
  const reports = [rep("a", "n1", "rejected"), rep("b", "n2", "rejected")];
  const out = run(zone(10), reports, new Set(["z"]));
  assert.equal(out.z.p, Math.round(PARAMS.PRIOR * 100) / 100);
  assert.equal(out.z.recentReports, 0);
});

test("online zone with a high water level is flagged by the sensor", () => {
  const out = run(zone(80), []);
  assert.ok(out.z.p >= 0.5, `got ${out.z.p}`);
  assert.equal(out.z.sensorOnline, true);
});

test("water depth maps onto fusion severity, and the report's own higher severity wins", () => {
  assert.equal(fusionSeverity({ severity: "low", depth: "ankle" }), "low");
  assert.equal(fusionSeverity({ severity: "low", depth: "knee" }), "medium");
  assert.equal(fusionSeverity({ severity: "low", depth: "waist" }), "high");
  assert.equal(fusionSeverity({ severity: "low", depth: "chest" }), "high");
  assert.equal(fusionSeverity({ severity: "medium", depth: "ankle" }), "medium", "own severity is higher");
  assert.equal(fusionSeverity({ severity: "high", depth: "ankle" }), "high");
  assert.equal(fusionSeverity({ severity: "medium", depth: null }), "medium", "no depth leaves severity alone");
  assert.equal(fusionSeverity({ severity: "medium" }), "medium");
});

test("a deeper water report weighs more in fusion, and an ankle report fuses like a low report", () => {
  const one = (extra) => run(zone(10), [rep("a", "n1", "open", extra)], new Set(["z"])).z.p;
  const ankle = one({ severity: "low", depth: "ankle" });
  const waist = one({ severity: "low", depth: "waist" });
  assert.ok(waist > ankle, `waist ${waist} should exceed ankle ${ankle}`);
  assert.equal(ankle, one({ severity: "low" }));
});

test("ticks are two-second buckets of the wall clock", () => {
  assert.equal(tickOf(NOW), 100);
  assert.equal(tickOf(NOW - 1), 99);
});
