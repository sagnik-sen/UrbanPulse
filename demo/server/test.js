const test = require("node:test");
const assert = require("node:assert");
const { forecast, stepsToBreach } = require("./forecast");
const { planEvacuation, routeExposure } = require("./evacuation");

test("rising series projects upward and breaches danger", () => {
  const series = Array.from({ length: 20 }, (_, i) => 30 + i * 2);
  const path = forecast(series, 30);
  assert.equal(path.length, 30);
  assert.ok(path[0].mean > series.at(-1) - 1);
  assert.ok(stepsToBreach(series.at(-1), path, 70) > 0);
});

test("after a storm spike the projection drains back down with a usable band", () => {
  const series = [...Array(20).fill(50), 60, 75, 90, 100, 100, 100, 100, 100, 100, 100];
  const path = forecast(series, 60);
  assert.ok(path[59].mean < path[0].mean - 10, "should recede over the horizon");
  assert.ok(path[59].hi - path[59].lo < 70, "band should not span the whole range");
});

test("flat series never breaches and band widens with horizon", () => {
  const path = forecast(Array(20).fill(40), 30);
  assert.equal(stepsToBreach(40, path, 70), null);
  assert.ok(path[29].hi - path[29].lo > path[0].hi - path[0].lo);
  assert.ok(path.every((p) => p.lo <= p.mean && p.mean <= p.hi && p.lo >= 0 && p.hi <= 100));
});

test("already above threshold breaches at step 0; short series gives no forecast", () => {
  assert.equal(stepsToBreach(80, [], 70), 0);
  assert.deepEqual(forecast([1, 2, 3], 10), []);
});

const zone = { id: "z", lat: 13.0, lng: 80.2, risk: "danger" };

test("route through a danger zone is measured, a distant one is not", () => {
  const through = routeExposure([[12.98, 80.2], [13.0, 80.2], [13.02, 80.2]], [zone]);
  assert.ok(through.dangerKm > 1);
  assert.deepEqual(through.crossed, ["z"]);
  const away = routeExposure([[12.98, 80.3], [13.02, 80.3]], [zone]);
  assert.equal(away.dangerKm, 0);
});

test("planner prefers a detour around the flooded zone", async () => {
  const from = { lat: 12.97, lng: 80.2 };
  const shelter = { id: "s", lat: 13.03, lng: 80.2, capacity: 100, occupancy: 0 };
  const fetchRoute = async (points) =>
    points.length === 2
      ? [{ coords: [[12.97, 80.2], [13.0, 80.2], [13.03, 80.2]], distanceKm: 6.7, durationMin: 10 }]
      : [{ coords: [[12.97, 80.2], [points[1].lat, points[1].lng], [13.03, 80.2]], distanceKm: 9, durationMin: 16 }];
  const plan = await planEvacuation({ from, shelters: [shelter], zones: [zone], fetchRoute });
  assert.equal(plan.source, "osrm");
  assert.equal(plan.route.dangerKm, 0);
  assert.deepEqual(plan.avoided, ["z"]);
});

test("planner falls back to a straight line when routing fails, and skips full shelters", async () => {
  const shelters = [
    { id: "full", lat: 12.971, lng: 80.2, capacity: 10, occupancy: 10 },
    { id: "ok", lat: 13.05, lng: 80.25, capacity: 10, occupancy: 0 },
  ];
  const plan = await planEvacuation({ from: { lat: 12.97, lng: 80.2 }, shelters, zones: [], fetchRoute: async () => { throw new Error("down"); } });
  assert.equal(plan.source, "fallback");
  assert.equal(plan.shelter.id, "ok");
});

test("planner avoids a shelter inside an active danger zone when another is open", async () => {
  const from = { lat: 12.99, lng: 80.2 };
  const inFlood = { id: "flooded", lat: 13.0, lng: 80.201, capacity: 100, occupancy: 0 };
  const dry = { id: "dry", lat: 13.06, lng: 80.2, capacity: 100, occupancy: 0 };
  const fetchRoute = async ([a, b]) => [{ coords: [[a.lat, a.lng], [b.lat, b.lng]], distanceKm: 1, durationMin: b.id === "dry" ? 15 : 2 }];
  const plan = await planEvacuation({ from, shelters: [inFlood, dry], zones: [zone], fetchRoute });
  assert.equal(plan.shelter.id, "dry");
});
