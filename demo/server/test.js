const test = require("node:test");
const assert = require("node:assert");
const { forecast, stepsToBreach } = require("./forecast");
const { planEvacuation, routeExposure } = require("./evacuation");
const { snapshotRisk, forecastRisk, levelDistribution } = require("./risk");
const { assignEvacuees, assignGreedyNearest } = require("./assignment");
const { planGroups } = require("./planner");
const { parseRainfall, intensityLabel, createRainfallFeed, buildUrl } = require("./rainfall");
const { openDb } = require("./db");
const { leafHash, merkleRoot, merkleProof, rootFromProof, checkBatch } = require("./anchor");
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

const matrix = (m) => (a, b) => m[a][b];

test("min-cost assignment beats greedy on a hand-solved instance", () => {
  // A prefers X slightly; B badly needs X. Greedy (A first) sends B through a 100-cost route.
  const problem = {
    sources: [{ id: "A", people: 100 }, { id: "B", people: 100 }],
    sinks: [{ id: "X", beds: 100 }, { id: "Y", beds: 100 }],
    cost: matrix({ A: { X: 1, Y: 2 }, B: { X: 2, Y: 100 } }),
  };
  const opt = assignEvacuees(problem);
  assert.equal(opt.totalCost, 400); // A->Y 100x2 + B->X 100x2, solved by hand
  assert.equal(opt.assigned, 200);
  const greedy = assignGreedyNearest(problem);
  assert.equal(greedy.totalCost, 10100);
});

test("assignment never exceeds shelter beds and reports people it cannot place", () => {
  const r = assignEvacuees({
    sources: [{ id: "A", people: 250 }, { id: "B", people: 50 }],
    sinks: [{ id: "X", beds: 120 }, { id: "Y", beds: 80 }],
    cost: matrix({ A: { X: 5, Y: 9 }, B: { X: 1, Y: Infinity } }),
  });
  const into = (id) => r.flows.filter((f) => f.sink === id).reduce((s, f) => s + f.people, 0);
  assert.ok(into("X") <= 120 && into("Y") <= 80);
  assert.equal(r.assigned, 200);
  assert.equal(r.unassigned.reduce((s, u) => s + u.people, 0), 100);
  assert.ok(!r.flows.some((f) => f.source === "B" && f.sink === "Y"), "no route means no flow");
});

test("assignment is optimal on random instances (checked against brute force)", () => {
  const rng = require("./simulator").seededRng(9);
  for (let trial = 0; trial < 30; trial++) {
    const people = [1 + Math.floor(rng() * 4), 1 + Math.floor(rng() * 4)];
    const beds = [1 + Math.floor(rng() * 4), 1 + Math.floor(rng() * 4)];
    const c = [[1 + Math.floor(rng() * 9), 1 + Math.floor(rng() * 9)], [1 + Math.floor(rng() * 9), 1 + Math.floor(rng() * 9)]];
    const r = assignEvacuees({
      sources: [{ id: 0, people: people[0] }, { id: 1, people: people[1] }],
      sinks: [{ id: 0, beds: beds[0] }, { id: 1, beds: beds[1] }],
      cost: (a, b) => c[a][b],
    });
    // brute force: a = people of source 0 sent to sink 0, b = people of source 1 sent to sink 0
    let best = null;
    for (let a = 0; a <= people[0]; a++) for (let a2 = 0; a2 <= people[0] - a; a2++)
      for (let b = 0; b <= people[1]; b++) for (let b2 = 0; b2 <= people[1] - b; b2++) {
        if (a + b > beds[0] || a2 + b2 > beds[1]) continue;
        const flow = a + a2 + b + b2;
        const cost = a * c[0][0] + a2 * c[0][1] + b * c[1][0] + b2 * c[1][1];
        if (!best || flow > best.flow || (flow === best.flow && cost < best.cost)) best = { flow, cost };
      }
    assert.equal(r.assigned, best.flow, `trial ${trial} flow`);
    assert.equal(r.totalCost, best.cost, `trial ${trial} cost`);
  }
});

test("group planner respects held seats and shelter capacity under every method", () => {
  const origin = (id, lat) => ({ id, lat, lng: 80.2 });
  const groups = [{ origin: origin("a", 12.95), people: 60 }, { origin: origin("b", 12.96), people: 60 }];
  const shelters = [
    { id: "near", lat: 12.97, lng: 80.2, capacity: 100, occupancy: 0 },
    { id: "far", lat: 13.05, lng: 80.2, capacity: 100, occupancy: 0 },
  ];
  const route = (o, s) => [{ coords: [[o.lat, o.lng], [s.lat, s.lng]], distanceKm: 1, durationMin: s.id === "near" ? 3 : 12 }];
  const candidatesFor = (o, s) => route(groups.find((g) => g.origin.id === o).origin, shelters.find((x) => x.id === s));
  const risk = snapshotRisk([]);
  const load = (plan, id) => plan.assignments.filter((a) => a.shelter.id === id).reduce((s, a) => s + a.people, 0);

  for (const method of ["greedy", "optimal"]) {
    const plan = planGroups({ groups, shelters, candidatesFor, risk, method, reserved: { near: 30 } });
    assert.ok(load(plan, "near") <= 70, `${method}: held seats reduce free beds`);
    assert.equal(plan.unassigned, 0);
    assert.equal(load(plan, "near") + load(plan, "far"), 120);
  }
  const independent = planGroups({ groups, shelters, candidatesFor, risk, method: "independent" });
  assert.equal(load(independent, "near"), 120, "independent ignores other groups and overfills the nearest shelter");
});

const rainZones = [{ id: "a", lat: 12.97, lng: 80.22 }, { id: "b", lat: 13.0, lng: 80.25 }];
const meteo = (current, values) => ({
  current: { time: "2026-09-28T03:15", precipitation: current },
  hourly: {
    time: Array.from({ length: 48 }, (_, i) => `2026-09-${28 + Math.floor(i / 24)}T${String(i % 24).padStart(2, "0")}:00`),
    precipitation: values,
    precipitation_probability: values.map((v) => (v > 0 ? 80 : 10)),
  },
});

test("rainfall parser starts at the current hour and totals the next 24 hours", () => {
  const values = Array(48).fill(0);
  values[3] = 1; values[5] = 4; values[30] = 9; // hour 30 is beyond the 24 h window from 03:00
  const r = parseRainfall(rainZones, [meteo(0.8, values), meteo(0, Array(48).fill(0))]);
  assert.equal(r.a.hourly[0].time, "2026-09-28T03:00");
  assert.equal(r.a.hourly.length, 24);
  assert.equal(r.a.next24hMm, 5);
  assert.equal(r.a.peakMmPerHr, 4);
  assert.equal(r.a.peakAt, "2026-09-28T05:00");
  assert.equal(r.a.currentMmPerHr, 0.8);
  assert.equal(r.b.next24hMm, 0);
  assert.throws(() => parseRainfall(rainZones, [meteo(0, values)]), /expected 2/);
  assert.match(buildUrl(rainZones), /latitude=12\.9700%2C13\.0000/);
});

test("rainfall intensity labels follow IMD-style bands", () => {
  assert.equal(intensityLabel(0), "No rain");
  assert.equal(intensityLabel(1), "Light rain");
  assert.equal(intensityLabel(5), "Moderate rain");
  assert.equal(intensityLabel(20), "Heavy rain");
  assert.equal(intensityLabel(50), "Very heavy rain");
});

test("rainfall feed keeps the last good reading when a refresh fails", async () => {
  let fail = false;
  const fetchImpl = async () => {
    if (fail) throw new Error("offline");
    return { ok: true, json: async () => [meteo(2, Array(48).fill(1)), meteo(0, Array(48).fill(0))] };
  };
  const feed = createRainfallFeed(rainZones, { fetchImpl, now: () => 1000 });
  assert.equal(feed.get().stale, true);
  await feed.refresh();
  assert.equal(feed.get().stale, false);
  assert.equal(feed.get().zones.a.currentMmPerHr, 2);
  fail = true;
  await feed.refresh();
  assert.equal(feed.get().stale, true);
  assert.equal(feed.get().error, "offline");
  assert.equal(feed.get().zones.a.currentMmPerHr, 2, "old reading kept");
});

test("a network failure reports its cause, not just \"fetch failed\"", async () => {
  const fetchImpl = async () => { throw new TypeError("fetch failed", { cause: Object.assign(new Error("getaddrinfo ENOTFOUND api.open-meteo.com"), { code: "ENOTFOUND" }) }); };
  const feed = createRainfallFeed(rainZones, { fetchImpl });
  await feed.refresh();
  assert.equal(feed.get().error, "fetch failed (ENOTFOUND)");
});

test("audit log is newest-first, filterable, append-only, and survives clearing demo data", () => {
  const db = openDb(":memory:");
  for (let i = 1; i <= 5; i++) db.logAudit({ id: `e${i}`, ts: i, username: "admin", role: "admin", action: i % 2 ? "login" : "broadcast_sent", details: { n: i } });
  const all = db.listAudit();
  assert.deepEqual(all.map((e) => e.id), ["e5", "e4", "e3", "e2", "e1"]);
  assert.deepEqual(all[0].details, { n: 5 });
  assert.equal(all[0].batch_id, null, "not anchored yet");
  assert.deepEqual(db.listAudit({ action: "broadcast_sent" }).map((e) => e.id), ["e4", "e2"]);
  db.clearRecords();
  assert.equal(db.listAudit().length, 5);
});

test("merkle root handles single, odd and even batches and changes with any leaf", () => {
  const leaves = ["a", "b", "c", "d", "e"].map((x) => leafHash({ id: x, ts: 1, username: null, role: null, action: "login", details: "{}" }));
  assert.equal(merkleRoot(leaves.slice(0, 1)), leaves[0]);
  for (const n of [2, 3, 4, 5]) assert.match(merkleRoot(leaves.slice(0, n)), /^0x[0-9a-f]{64}$/);
  assert.notEqual(merkleRoot(leaves), merkleRoot(leaves.slice(0, 4)));
  assert.notEqual(merkleRoot(leaves), merkleRoot([...leaves.slice(0, 4), leaves[0]]));
});

// anchors every pending entry into one batch and returns what the chain would hold
function anchorAll(db, id = 0) {
  const rows = db.unanchoredAudit(500).map((r) => ({ ...r, leaf: leafHash(r) }));
  const onChain = { root: merkleRoot(rows.map((r) => r.leaf)), count: rows.length };
  db.saveAnchorBatch({ id, ...onChain, txHash: "0xtx", anchoredAt: 0 }, rows);
  return onChain;
}

test("anchored audit batch verifies, and edits or deletions are caught", () => {
  const db = openDb(":memory:");
  for (let i = 1; i <= 5; i++) db.logAudit({ id: `e${i}`, ts: i, username: "officer", role: "officer", action: "broadcast_sent", details: { message: `alert ${i}` } });
  const onChain = anchorAll(db);
  assert.equal(db.unanchoredAudit(500).length, 0);
  assert.equal(db.listAudit()[0].tx_hash, "0xtx");

  const clean = checkBatch(db.batchEntries(0), onChain);
  assert.ok(clean.intact);
  assert.equal(Object.values(clean.rows).filter((s) => s === "verified").length, 5);

  // one character changed in one entry: only that entry is flagged
  db.raw.prepare("UPDATE audit SET details = ? WHERE id = 'e3'").run(JSON.stringify({ message: "alert 9" }));
  const edited = checkBatch(db.batchEntries(0), onChain);
  assert.equal(edited.intact, false);
  assert.equal(edited.rows.e3, "tampered");
  assert.equal(edited.rows.e2, "verified");

  // deleting an entry is caught; deleting its anchor record too breaks the whole batch
  db.raw.prepare("DELETE FROM audit WHERE id = 'e5'").run();
  assert.deepEqual(checkBatch(db.batchEntries(0), onChain).deleted, ["e5"]);
  db.raw.prepare("DELETE FROM audit_anchor WHERE audit_id = 'e5'").run();
  const covered = checkBatch(db.batchEntries(0), onChain);
  assert.equal(covered.sealed, false);
  assert.ok(Object.values(covered.rows).every((s) => s === "tampered"));

  // a batch the chain has no record of is never trusted
  assert.equal(checkBatch(db.batchEntries(0), null).intact, false);
});

test("every leaf's inclusion proof rebuilds the root, and a changed leaf does not", () => {
  for (let n = 1; n <= 9; n++) {
    const leaves = Array.from({ length: n }, (_, i) => leafHash({ id: `p${i}`, ts: i, username: null, role: null, action: "alert_published", details: "{}" }));
    const root = merkleRoot(leaves);
    leaves.forEach((leaf, i) => {
      const proof = merkleProof(leaves, i);
      assert.equal(rootFromProof(leaf, proof), root, `n=${n} i=${i}`);
      assert.ok(proof.length <= Math.ceil(Math.log2(n)));
      const other = leafHash({ id: `p${i}`, ts: i, username: null, role: null, action: "alert_published", details: '{"x":1}' });
      if (n > 1) assert.notEqual(rootFromProof(other, proof), root);
    });
  }
});

test("public alert records are found by code and carry no staff identity", () => {
  const db = openDb(":memory:");
  db.logAudit({ id: "x1", ts: 5, username: null, role: null, action: "alert_published", details: { code: "UP-ABCD1234", zone: "Velachery", message: "Move to higher ground" } });
  db.logAudit({ id: "x2", ts: 6, username: "admin", role: "admin", action: "broadcast_sent", details: { code: "UP-ABCD1234" } });
  const row = db.findAlert("UP-ABCD1234");
  assert.equal(row.id, "x1");
  assert.equal(row.username, null);
  assert.equal(row.batch_id, null, "pending until anchored");
  assert.equal(db.findAlert("UP-00000000"), undefined);
  anchorAll(db);
  assert.equal(db.findAlert("UP-ABCD1234").batch_id, 0);
});

test("entries logged after anchoring wait for the next batch", () => {
  const db = openDb(":memory:");
  db.logAudit({ id: "a", ts: 1, action: "login", details: {} });
  anchorAll(db, 0);
  db.logAudit({ id: "b", ts: 2, action: "logout", details: {} });
  assert.deepEqual(db.unanchoredAudit(500).map((r) => r.id), ["b"]);
  const onChain = anchorAll(db, 1);
  assert.ok(checkBatch(db.batchEntries(1), onChain).intact);
  assert.deepEqual(db.anchorBatches().map((b) => b.id), [0, 1]);
});
