const test = require("node:test");
const assert = require("node:assert");
const { forecast, stepsToBreach } = require("./forecast");
const { planEvacuation, routeExposure } = require("./evacuation");
const { snapshotRisk, forecastRisk, levelDistribution } = require("./risk");
const { openDb } = require("./db");
const { createZones, stepZones, injectStorm, seededRng } = require("./simulator");
const { createAuth, hashPassword, verifyPassword, requireRole } = require("./auth");

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
  const risk = snapshotRisk([zone]);
  const through = routeExposure({ coords: [[12.98, 80.2], [13.0, 80.2], [13.02, 80.2]], durationMin: 6 }, risk);
  assert.ok(through.expectedFloodKm > 1);
  assert.deepEqual(through.crossed, ["z"]);
  const away = routeExposure({ coords: [[12.98, 80.3], [13.02, 80.3]], durationMin: 6 }, risk);
  assert.equal(away.expectedFloodKm, 0);
});

test("planner prefers a detour around the flooded zone", async () => {
  const from = { lat: 12.97, lng: 80.2 };
  const shelter = { id: "s", lat: 13.03, lng: 80.2, capacity: 100, occupancy: 0 };
  const fetchRoute = async (points) =>
    points.length === 2
      ? [{ coords: [[12.97, 80.2], [13.0, 80.2], [13.03, 80.2]], distanceKm: 6.7, durationMin: 10 }]
      : [{ coords: [[12.97, 80.2], [points[1].lat, points[1].lng], [13.03, 80.2]], distanceKm: 9, durationMin: 16 }];
  const plan = await planEvacuation({ from, shelters: [shelter], zones: [zone], risk: snapshotRisk([zone]), fetchRoute });
  assert.equal(plan.source, "osrm");
  assert.equal(plan.route.expectedFloodKm, 0);
  assert.deepEqual(plan.avoided, ["z"]);
});

test("planner falls back to a straight line when routing fails, and skips full shelters", async () => {
  const shelters = [
    { id: "full", lat: 12.971, lng: 80.2, capacity: 10, occupancy: 10 },
    { id: "ok", lat: 13.05, lng: 80.25, capacity: 10, occupancy: 0 },
  ];
  const plan = await planEvacuation({ from: { lat: 12.97, lng: 80.2 }, shelters, zones: [], risk: snapshotRisk([]), fetchRoute: async () => { throw new Error("down"); } });
  assert.equal(plan.source, "fallback");
  assert.equal(plan.shelter.id, "ok");
});

test("planner avoids a shelter inside an active danger zone when another is open", async () => {
  const from = { lat: 12.99, lng: 80.2 };
  const inFlood = { id: "flooded", lat: 13.0, lng: 80.201, capacity: 100, occupancy: 0 };
  const dry = { id: "dry", lat: 13.06, lng: 80.2, capacity: 100, occupancy: 0 };
  const fetchRoute = async ([a, b]) => [{ coords: [[a.lat, a.lng], [b.lat, b.lng]], distanceKm: 1, durationMin: b.id === "dry" ? 15 : 2 }];
  const plan = await planEvacuation({ from, shelters: [inFlood, dry], zones: [zone], risk: snapshotRisk([zone]), fetchRoute });
  assert.equal(plan.shelter.id, "dry");
});

test("records round-trip through SQLite, newest first, and upserts by id", () => {
  const db = openDb(":memory:");
  db.save("reports", { id: "a", note: "old" }, 1);
  db.save("reports", { id: "b", note: "new" }, 2);
  db.save("reports", { id: "a", note: "edited" }, 1);
  assert.deepEqual(db.load("reports", 10).map((r) => r.note), ["new", "edited"]);
  db.setSetting("thresholds", { warning: 30, danger: 60 });
  assert.deepEqual(db.getSetting("thresholds", null), { warning: 30, danger: 60 });
  db.clearRecords();
  assert.equal(db.load("reports", 10).length, 0);
  assert.throws(() => db.load("users; DROP TABLE users", 1));
});

test("passwords are salted scrypt hashes and verify correctly", () => {
  const a = hashPassword("secret");
  assert.notEqual(a, hashPassword("secret"), "salted: same password, different hash");
  assert.ok(verifyPassword("secret", a));
  assert.ok(!verifyPassword("wrong", a));
  assert.ok(!verifyPassword("secret", "garbage"));
});

test("login issues a session cookie that resolves back to the user; logout ends it", () => {
  const auth = createAuth(openDb(":memory:").raw);
  assert.equal(auth.login("admin", "nope").status, 401);
  assert.equal(auth.login("ghost", "admin123").error, "Invalid username or password");
  const ok = auth.login("Admin", "admin123");
  assert.equal(ok.user.role, "admin");
  assert.ok(!("password_hash" in ok.user));
  const cookie = `other=1; up_session=${ok.token}`;
  assert.equal(auth.userFromCookieHeader(cookie).username, "admin");
  auth.logout(cookie);
  assert.equal(auth.userFromCookieHeader(cookie), null);
});

test("repeated failed logins lock the account", () => {
  const auth = createAuth(openDb(":memory:").raw);
  for (let i = 0; i < 10; i++) auth.login("viewer", "bad");
  assert.equal(auth.login("viewer", "viewer123").status, 429);
});

test("requireRole answers 401 when signed out and 403 for the wrong role", () => {
  const run = (user, roles) => {
    let code = 200;
    const res = { status(c) { code = c; return { json() {} }; } };
    requireRole(...roles)({ user }, res, () => {});
    return code;
  };
  assert.equal(run(null, ["admin"]), 401);
  assert.equal(run({ role: "viewer" }, ["admin", "officer"]), 403);
  assert.equal(run({ role: "officer" }, ["admin", "officer"]), 200);
});

test("simulator is reproducible from a seed, bounded, and responds to storms", () => {
  const run = (seed, storm) => {
    const zones = createZones();
    const rng = seededRng(seed);
    const out = [];
    for (let t = 1; t <= 200; t++) {
      if (storm && t === 50) injectStorm(zones, "velachery", 50);
      stepZones(zones, t, rng);
      out.push(zones.map((z) => z.level));
    }
    return out;
  };
  assert.deepEqual(run(42), run(42));
  assert.notDeepEqual(run(42), run(43));
  assert.ok(run(7).flat().every((v) => v >= 0 && v <= 100));
  const vel = (rows) => rows[51][1];
  assert.ok(vel(run(7, true)) > vel(run(7, false)) + 30);
});

test("forecast exposes unclamped mean and a sigma that grows with horizon", () => {
  const path = forecast([...Array(20).fill(50), 60, 75, 90, 100, 100, 100, 100, 100, 100, 100], 60);
  assert.ok(path.every((p) => Number.isFinite(p.rawMean) && p.sigma > 0));
  assert.ok(path[30].sigma > path[0].sigma);
  assert.ok(path[0].rawMean >= path[0].mean - 0.5, "raw mean is not clipped to 100");
});

// a zone whose forecast is a flat line at `level` with a fixed sigma
const flatForecast = (level, sigma = 3, steps = 30) => Array.from({ length: steps }, (_, i) => ({ h: i + 1, mean: level, lo: level, hi: level, rawMean: level, sigma }));

test("forecast risk maps minutes to forecast steps, interpolates, and holds beyond the horizon", () => {
  const zone = { id: "z", lat: 13, lng: 80.2, level: 50, forecast: [
    { h: 1, rawMean: 60, sigma: 2 }, { h: 2, rawMean: 80, sigma: 4 },
  ] };
  assert.equal(levelDistribution(zone, 0, 2).mean, 50);
  assert.equal(levelDistribution(zone, 1, 2).mean, 55); // halfway to step 1
  assert.equal(levelDistribution(zone, 3, 2).mean, 70); // halfway between steps 1 and 2
  assert.equal(levelDistribution(zone, 99, 2).mean, 80); // held at horizon
  assert.equal(levelDistribution(zone, 99, 2).sigma, 4);
});

test("forecast risk probability rises with the projected level", () => {
  const at = (level) => forecastRisk([{ id: "z", lat: 13, lng: 80.2, level, forecast: flatForecast(level) }], 70, 2).at({ lat: 13, lng: 80.2 }, 10).p;
  assert.ok(at(50) < 0.01);
  assert.ok(Math.abs(at(70) - 0.5) < 0.01);
  assert.ok(at(90) > 0.99);
  assert.ok(at(60) < at(65) && at(65) < at(75));
});

test("forecast-aware routing avoids a zone that is safe now but will flood; snapshot routing does not", async () => {
  // two roads to the same shelter: one through a rising zone (safe now, flooded soon), one through a draining zone
  const rising = { id: "rising", lat: 13.0, lng: 80.2, level: 30, risk: "safe", forecast: Array.from({ length: 30 }, (_, i) => ({ h: i + 1, rawMean: 30 + (i + 1) * 10, sigma: 3 })) };
  const draining = { id: "draining", lat: 13.0, lng: 80.26, level: 75, risk: "danger", forecast: Array.from({ length: 30 }, (_, i) => ({ h: i + 1, rawMean: 75 - (i + 1) * 10, sigma: 3 })) };
  const zones = [rising, draining];
  const from = { lat: 12.96, lng: 80.23 };
  const shelter = { id: "s", lat: 13.04, lng: 80.23, capacity: 100, occupancy: 0 };
  const viaRising = { coords: [[12.96, 80.23], [13.0, 80.2], [13.04, 80.23]], distanceKm: 10, durationMin: 20 };
  const viaDraining = { coords: [[12.96, 80.23], [13.0, 80.26], [13.04, 80.23]], distanceKm: 10, durationMin: 20 };
  const fetchRoute = async () => [viaRising, viaDraining];
  const pick = async (risk) => (await planEvacuation({ from, shelters: [shelter], zones, risk, fetchRoute })).route.coords[1][1];
  assert.equal(await pick(snapshotRisk(zones)), 80.2, "snapshot sees the rising zone as safe and goes through it");
  assert.equal(await pick(forecastRisk(zones, 70, 2)), 80.26, "forecast-aware goes through the zone that will have drained");
});
