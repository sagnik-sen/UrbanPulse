const test = require("node:test");
const assert = require("node:assert");
const { cost, matchOptimal, matchGreedy, validateRequest, validateBoat, validateBoatPatch, publicRequest, requestStatus, demoBoats, PRIORITY_MINUTES, BOAT_KMH } = require("./rescue");
const { seededRng } = require("./simulator");
const { distanceKm } = require("./risk");

const NOW = 1_700_000_000_000;
const HERE = { lat: 13.0, lng: 80.25 };
// a point due east of HERE at a given distance in km (small-angle, fine at city scale)
const eastOf = (p, km) => ({ lat: p.lat, lng: p.lng + km / (111.32 * Math.cos((p.lat * Math.PI) / 180)) });

const request = (over = {}) => ({ id: "r1", lat: HERE.lat, lng: HERE.lng, people: 2, needs: [], status: "open", ts: NOW, ...over });
const boat = (over = {}) => ({ id: "b1", lat: HERE.lat, lng: HERE.lng, capacity: 6, status: "available", ...over });

test("cost: a boat too small for the group is infeasible", () => {
  assert.strictEqual(cost(request({ people: 7 }), boat({ capacity: 6 }), NOW), Infinity);
  assert.ok(Number.isFinite(cost(request({ people: 6 }), boat({ capacity: 6 }), NOW)));
});

test("cost: a busy or offline boat is infeasible", () => {
  assert.strictEqual(cost(request(), boat({ status: "busy" }), NOW), Infinity);
  assert.strictEqual(cost(request(), boat({ status: "offline" }), NOW), Infinity);
});

test("cost: travel time at BOAT_KMH, no bonus and no waiting", () => {
  const far = eastOf(HERE, 4);
  const minutes = cost(request(), boat({ ...far }), NOW);
  assert.ok(Math.abs(minutes - (distanceKm(HERE, far) / BOAT_KMH) * 60) < 1e-9);
});

test("cost: a medical need is worth its priority minutes, and the largest need counts", () => {
  const plain = cost(request(), boat(), NOW);
  assert.strictEqual(cost(request({ needs: ["medical"] }), boat(), NOW), plain - PRIORITY_MINUTES.medical);
  assert.strictEqual(cost(request({ needs: ["child", "disabled"] }), boat(), NOW), plain - PRIORITY_MINUTES.disabled);
});

test("cost: waiting lowers the cost (aging), so an older request outranks a newer one", () => {
  const older = cost(request({ ts: NOW - 20 * 60000 }), boat(), NOW);
  const newer = cost(request({ ts: NOW }), boat(), NOW);
  assert.ok(Math.abs(newer - older - 10) < 1e-9);
});

test("matchOptimal: never double-assigns a boat or a request", () => {
  const rng = seededRng(3);
  for (let trial = 0; trial < 100; trial++) {
    const requests = Array.from({ length: 6 }, (_, i) => request({ id: `r${i}`, people: 1 + Math.floor(rng() * 8), ts: NOW - Math.floor(rng() * 30) * 60000 }));
    const boats = Array.from({ length: 4 }, (_, i) => boat({ id: `b${i}`, capacity: 2 + Math.floor(rng() * 10), ...eastOf(HERE, rng() * 5) }));
    const out = matchOptimal(requests, boats, NOW);
    assert.strictEqual(new Set(out.map((m) => m.requestId)).size, out.length);
    assert.strictEqual(new Set(out.map((m) => m.boatId)).size, out.length);
    for (const m of out) assert.ok(Number.isFinite(cost(requests.find((r) => r.id === m.requestId), boats.find((b) => b.id === m.boatId), NOW)));
  }
});

// exhaustive reference: the largest number of pairs, and among those the lowest total cost
function bestByBruteForce(requests, boats) {
  let best = { count: 0, total: 0 };
  const used = new Set();
  const walk = (i, count, total) => {
    if (i === requests.length) {
      if (count > best.count || (count === best.count && total < best.total)) best = { count, total };
      return;
    }
    walk(i + 1, count, total);
    for (const b of boats) {
      const c = cost(requests[i], b, NOW);
      if (used.has(b.id) || !Number.isFinite(c)) continue;
      used.add(b.id);
      walk(i + 1, count + 1, total + c);
      used.delete(b.id);
    }
  };
  walk(0, 0, 0);
  return best;
}

test("matchOptimal matches the exhaustive optimum on small cases, with negative costs", () => {
  const rng = seededRng(11);
  let negative = 0;
  for (let trial = 0; trial < 150; trial++) {
    const requests = Array.from({ length: 4 }, (_, i) => request({ id: `r${i}`, people: 1 + Math.floor(rng() * 7), needs: rng() < 0.5 ? ["medical"] : [], ts: NOW - Math.floor(rng() * 40) * 60000 }));
    const boats = Array.from({ length: 3 }, (_, i) => boat({ id: `b${i}`, capacity: 3 + Math.floor(rng() * 10), ...eastOf(HERE, rng() * 6) }));
    const out = matchOptimal(requests, boats, NOW);
    const total = out.reduce((s, m) => s + cost(requests.find((r) => r.id === m.requestId), boats.find((b) => b.id === m.boatId), NOW), 0);
    const ref = bestByBruteForce(requests, boats);
    if (total < 0) negative++;
    assert.strictEqual(out.length, ref.count);
    assert.ok(Math.abs(total - ref.total) < 1e-6, `trial ${trial}: ${total} vs ${ref.total}`);
  }
  assert.ok(negative > 0, "some trials should have negative total cost");
});

test("matchOptimal beats or ties greedy: more pairs, or equal pairs at no higher cost", () => {
  const rng = seededRng(5);
  let ties = 0;
  for (let trial = 0; trial < 200; trial++) {
    const requests = Array.from({ length: 5 }, (_, i) => request({ id: `r${i}`, people: 1 + Math.floor(rng() * 8), needs: rng() < 0.3 ? ["elderly"] : [], ts: NOW - Math.floor(rng() * 40) * 60000 }));
    const boats = Array.from({ length: 4 }, (_, i) => boat({ id: `b${i}`, capacity: 3 + Math.floor(rng() * 10), ...eastOf(HERE, rng() * 6) }));
    const price = (out) => out.reduce((s, m) => s + cost(requests.find((r) => r.id === m.requestId), boats.find((b) => b.id === m.boatId), NOW), 0);
    const opt = matchOptimal(requests, boats, NOW);
    const greedy = matchGreedy(requests, boats, NOW);
    assert.ok(opt.length >= greedy.length, "optimal must match at least as many requests");
    if (opt.length === greedy.length) {
      ties++;
      assert.ok(price(opt) <= price(greedy) + 1e-9);
    }
  }
  assert.ok(ties > 20, "enough equal-count cases to compare costs");
});

test("matchGreedy: arrival order decides who gets the boat", () => {
  const early = request({ id: "early", ts: NOW - 10 * 60000, ...eastOf(HERE, 5) });
  const late = request({ id: "late", ts: NOW - 1 * 60000 });
  const out = matchGreedy([late, early], [boat({ id: "only", capacity: 6 })], NOW);
  assert.deepStrictEqual(out.map((m) => m.requestId), ["early"]);
});

test("matchGreedy: each request takes the nearest boat that can carry it", () => {
  const near = boat({ id: "near", capacity: 2, ...eastOf(HERE, 1) });
  const far = boat({ id: "far", capacity: 8, ...eastOf(HERE, 4) });
  const out = matchGreedy([request({ id: "big", people: 5 })], [near, far], NOW);
  assert.deepStrictEqual(out.map((m) => m.boatId), ["far"]);
});

test("validateRequest: accepts a normal request and normalises it", () => {
  const r = validateRequest({ lat: HERE.lat, lng: HERE.lng, people: 3, needs: ["medical", "medical"], note: "  roof  ", contact: "+91 98400-12345" });
  assert.strictEqual(r.error, undefined);
  assert.deepStrictEqual(r.value, { lat: HERE.lat, lng: HERE.lng, people: 3, needs: ["medical"], note: "roof", contact: "+919840012345" });
  assert.strictEqual(validateRequest({ lat: HERE.lat, lng: HERE.lng, people: 1, needs: [] }).value.contact, null);
});

test("validateRequest: rejects bad people, needs, note, contact and location", () => {
  const base = { lat: HERE.lat, lng: HERE.lng, people: 2, needs: [] };
  assert.ok(validateRequest({ ...base, people: 0 }).error);
  assert.ok(validateRequest({ ...base, people: 31 }).error);
  assert.ok(validateRequest({ ...base, people: 2.5 }).error);
  assert.ok(validateRequest({ ...base, people: "2" }).error);
  assert.ok(validateRequest({ ...base, needs: ["pets"] }).error);
  assert.ok(validateRequest({ ...base, needs: "medical" }).error);
  assert.ok(validateRequest({ ...base, note: "x".repeat(201) }).error);
  assert.ok(validateRequest({ ...base, contact: "call me" }).error);
  assert.ok(validateRequest({ ...base, contact: "9".repeat(20) }).error);
  assert.ok(validateRequest({ ...base, lat: 28.6, lng: 77.2 }).error);
  assert.ok(validateRequest(undefined).error);
});

test("validateBoat: accepts a registration and rejects bad fields", () => {
  const ok = { name: "Kasimedu 1", owner: "Kasimedu fishermen's association", capacity: 8, lat: HERE.lat, lng: HERE.lng };
  assert.strictEqual(validateBoat(ok).value.status, "available");
  assert.ok(validateBoat({ ...ok, name: "" }).error);
  assert.ok(validateBoat({ ...ok, name: "x".repeat(41) }).error);
  assert.ok(validateBoat({ ...ok, owner: "" }).error);
  assert.ok(validateBoat({ ...ok, capacity: 1 }).error);
  assert.ok(validateBoat({ ...ok, capacity: 21 }).error);
  assert.ok(validateBoat({ ...ok, status: "sailing" }).error);
  assert.ok(validateBoat({ ...ok, lat: 0 }).error);
  assert.ok(validateBoat(undefined).error);
});

test("validateBoatPatch: needs a status or a location, and checks each", () => {
  assert.deepStrictEqual(validateBoatPatch({ status: "busy" }).value, { status: "busy" });
  assert.ok(validateBoatPatch({}).error);
  assert.ok(validateBoatPatch({ status: "flying" }).error);
  assert.ok(validateBoatPatch({ lat: 0, lng: 0 }).error);
});

test("public shapes never carry the contact number", () => {
  const stored = { id: "r1", lat: HERE.lat, lng: HERE.lng, people: 2, needs: ["medical"], note: "", contact: "+919840012345", status: "assigned", boatId: "b1", ts: NOW, assignedAt: NOW + 1000, rescuedAt: null };
  const pub = publicRequest(stored);
  assert.strictEqual("contact" in pub, false);
  assert.strictEqual(JSON.stringify(pub).includes("919840012345"), false);
  assert.strictEqual(pub.id, "r1");
  const status = requestStatus(stored, [{ id: "b1", name: "Akkarai Boat 1" }]);
  assert.deepStrictEqual(status, { status: "assigned", boatName: "Akkarai Boat 1", assignedAt: NOW + 1000, rescuedAt: null });
  assert.strictEqual(requestStatus({ ...stored, boatId: null }, []).boatName, null);
});

test("demoBoats: one boat per demo zone, all available", () => {
  const fleet = demoBoats(NOW);
  assert.strictEqual(fleet.length, 6);
  assert.ok(fleet.every((b) => b.status === "available" && b.capacity >= 4 && b.capacity <= 12));
  assert.strictEqual(new Set(fleet.map((b) => b.id)).size, 6);
});
