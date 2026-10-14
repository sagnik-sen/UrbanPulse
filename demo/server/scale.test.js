const test = require("node:test");
const assert = require("node:assert");
const { ZONE_DEFS, SHELTER_DEFS } = require("./simulator");
const { buildCity, createState, planCity, anchorDay, CITY_POPULATION, TOTAL_KM2 } = require("./experiments/scale");

for (const n of [50, 100, 200]) {
  test(`city of ${n} wards: unique zones, population within 1% of area share`, () => {
    const city = buildCity(n);
    assert.equal(city.zones.length, n);
    assert.equal(new Set(city.zones.map((z) => z.id)).size, n);
    const expected = (CITY_POPULATION * city.wards.reduce((s, w) => s + w.km2, 0)) / TOTAL_KM2;
    const actual = city.zones.reduce((s, z) => s + z.population, 0);
    assert.ok(Math.abs(actual - expected) <= 0.01 * expected, `population ${actual} vs expected ${expected}`);
  });

  test(`city of ${n} wards: ceil(N/2) synthetic shelters at ward centroids`, () => {
    const city = buildCity(n);
    assert.equal(city.shelters.length, Math.ceil(n / 2));
    const zoneIds = new Set(city.zones.map((z) => z.id));
    for (const s of city.shelters) {
      assert.ok(zoneIds.has(s.zoneId));
      assert.equal(s.capacity, 300);
      assert.equal(s.occupancy, 0);
    }
  });
}

test("N = 6 is the real demo: its zones and shelters", () => {
  const city = buildCity(ZONE_DEFS.length);
  assert.deepEqual(city.zones.map((z) => z.id), ZONE_DEFS.map((z) => z.id));
  assert.deepEqual(city.shelters.map((s) => s.id), SHELTER_DEFS.map((s) => s.id));
});

test("N = 50 plan: no shelter receives more people than its free beds", () => {
  const state = createState(buildCity(50));
  const { groups, shelters, result } = planCity(state);
  assert.ok(result.assignments.length > 0, "plan assigns someone");
  for (const s of shelters) {
    const load = result.assignments.filter((a) => a.shelter.id === s.id).reduce((sum, a) => sum + a.people, 0);
    assert.ok(load <= s.capacity - s.occupancy, `${s.id} load ${load} over capacity`);
  }
  const total = groups.reduce((sum, g) => sum + g.people, 0);
  const placed = result.assignments.reduce((sum, a) => sum + a.people, 0);
  assert.equal(placed + result.unassigned, total);
});

test("a clean day of entries anchors in batches of 500 and verifies", async () => {
  const result = await anchorDay(1050);
  assert.equal(result.batches, 3);
  assert.ok(result.anchorMs >= 0 && result.verifyMs >= 0);
});
