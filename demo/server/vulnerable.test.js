const test = require("node:test");
const assert = require("node:assert");
const { validate, summarize, NEEDS_ACCESSIBLE } = require("./vulnerable");
const { planGroups, planWithPriority } = require("./planner");

const flatRisk = { at: () => ({ p: 0, zoneId: null }) };
const origin = (id, zoneId) => ({ id, zoneId, lat: 0, lng: 0 });
// the shelter id decides the drive time: sA is 20 minutes away, sB is 5 minutes away
const MINUTES = { sA: 20, sB: 5 };
const candidatesFor = (_o, shelterId) => [{ coords: [[0, 0], [0, 0.01]], distanceKm: 1, durationMin: MINUTES[shelterId] ?? 10, expectedFloodKm: 0 }];
const sum = (rows) => rows.reduce((s, a) => s + a.people, 0);

test("validate keeps only zone, category and count", () => {
  const out = validate({ zoneId: "velachery", category: "mobility", count: 3, name: "Asha", phone: "9999", address: "12 Main St" });
  assert.deepEqual(out, { value: { zoneId: "velachery", category: "mobility", count: 3 } });
  assert.deepEqual(validate({ zoneId: "omr", category: "infant", count: "2" }).value, { zoneId: "omr", category: "infant", count: 2 });
});

test("validate rejects an unknown category, a count outside 1-10 and a fraction", () => {
  assert.ok(validate({ zoneId: "omr", category: "pets", count: 1 }).error);
  assert.ok(validate({ zoneId: "omr", category: "elderly", count: 0 }).error);
  assert.ok(validate({ zoneId: "omr", category: "elderly", count: 11 }).error);
  assert.ok(validate({ zoneId: "omr", category: "elderly", count: 2.5 }).error);
  assert.ok(validate({ zoneId: "omr", category: "elderly", count: [5] }).error);
  assert.ok(validate({ zoneId: "", category: "elderly", count: 1 }).error);
  assert.ok(validate(undefined).error);
  assert.equal(validate({ zoneId: "omr", category: "elderly", count: 10 }).value.count, 10);
});

test("accessible-needing categories are mobility and medical", () => {
  assert.deepEqual([...NEEDS_ACCESSIBLE].sort(), ["medical", "mobility"]);
});

test("summarize totals counts per zone and category and drops unknown categories", () => {
  const out = summarize([
    { zoneId: "omr", category: "elderly", count: 2 },
    { zoneId: "omr", category: "mobility", count: 3 },
    { zoneId: "omr", category: "elderly", count: 1 },
    { zoneId: "adyar", category: "infant", count: 4 },
    { zoneId: "adyar", category: "pets", count: 9 },
  ]);
  assert.deepEqual(out.omr, { elderly: 3, mobility: 3, medical: 0, infant: 0, total: 6 });
  assert.deepEqual(out.adyar, { elderly: 0, mobility: 0, medical: 0, infant: 4, total: 4 });
  assert.deepEqual(summarize([]), {});
});

test("accessible-needing people only ever go to accessible shelters", () => {
  const shelters = [
    { id: "sA", capacity: 3, occupancy: 0, accessible: true },
    { id: "sB", capacity: 100, occupancy: 0, accessible: false },
  ];
  const groups = [{ origin: origin("z1-c", "z1"), people: 10 }];
  const plan = planWithPriority({ groups, shelters, candidatesFor, risk: flatRisk, vulnerableByZone: { z1: { elderly: 0, mobility: 4, medical: 0, infant: 0, total: 4 } } });
  const accessibleRows = plan.assignments.filter((a) => a.tier === "accessible");
  assert.ok(accessibleRows.length > 0);
  assert.ok(accessibleRows.every((a) => a.shelter.id === "sA"));
  assert.equal(plan.tiers.accessible.assigned, 3);
  assert.equal(plan.tiers.accessible.unassigned, 1);
  // the general tier still uses the cheaper, non-accessible shelter
  assert.equal(plan.tiers.general.assigned, 6);
});

test("priority people get the beds before everyone else when beds are short", () => {
  const shelters = [{ id: "sB", capacity: 6, occupancy: 0, accessible: false }];
  const groups = [{ origin: origin("z1-c", "z1"), people: 10 }];
  const plan = planWithPriority({ groups, shelters, candidatesFor, risk: flatRisk, vulnerableByZone: { z1: { elderly: 4, mobility: 0, medical: 0, infant: 0, total: 4 } } });
  assert.equal(plan.tiers.priority.people, 4);
  assert.equal(plan.tiers.priority.assigned, 4);
  assert.equal(plan.tiers.general.assigned, 2);
  assert.equal(plan.tiers.general.unassigned, 4);
  assert.equal(plan.unassigned, 4);
});

test("placed people never exceed the free beds, and the caller's shelters are not changed", () => {
  const shelters = [
    { id: "sA", capacity: 5, occupancy: 2, accessible: true },
    { id: "sB", capacity: 7, occupancy: 1, accessible: false },
  ];
  const reserved = { sB: 2 };
  const groups = [
    { origin: origin("z1-c", "z1"), people: 6 },
    { origin: origin("z1-ne", "z1"), people: 5 },
    { origin: origin("z2-c", "z2"), people: 7 },
  ];
  const vulnerableByZone = {
    z1: { elderly: 4, mobility: 2, medical: 0, infant: 0, total: 6 },
    z2: { elderly: 0, mobility: 0, medical: 3, infant: 0, total: 3 },
  };
  const plan = planWithPriority({ groups, shelters, candidatesFor, risk: flatRisk, vulnerableByZone, reserved });
  assert.ok(sum(plan.assignments.filter((a) => a.shelter.id === "sA")) <= 3);
  assert.ok(sum(plan.assignments.filter((a) => a.shelter.id === "sB")) <= 4);
  assert.equal(sum(plan.assignments), 18 - plan.unassigned);
  assert.deepEqual(shelters.map((s) => s.occupancy), [2, 1]);
});

test("without registrations the plan places as many people as the single-stage optimal plan", () => {
  const shelters = [
    { id: "sA", capacity: 5, occupancy: 0, accessible: true },
    { id: "sB", capacity: 7, occupancy: 0, accessible: false },
  ];
  const groups = [
    { origin: origin("z1-c", "z1"), people: 9 },
    { origin: origin("z2-c", "z2"), people: 9 },
  ];
  const single = planGroups({ groups, shelters, candidatesFor, risk: flatRisk, method: "optimal" });
  const priority = planWithPriority({ groups, shelters, candidatesFor, risk: flatRisk, vulnerableByZone: {} });
  assert.equal(priority.unassigned, single.unassigned);
  assert.equal(sum(priority.assignments), sum(single.assignments));
  assert.ok(priority.assignments.every((a) => a.tier === "general"));
});
