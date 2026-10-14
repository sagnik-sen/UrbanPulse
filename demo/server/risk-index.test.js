const test = require("node:test");
const assert = require("node:assert/strict");
const { zoneAt, distanceKm, ZONE_RADIUS_KM } = require("./risk");
const { ZONE_DEFS, seededRng } = require("./simulator");
const wardFile = require("./experiments/data/chennai-wards.json");

// the original linear scan, kept as the reference
function linearZoneAt(point, zones) {
  let best = null;
  let bestD = Infinity;
  for (const z of zones) {
    const d = distanceKm(point, z);
    if (d <= ZONE_RADIUS_KM && d < bestD) {
      best = z;
      bestD = d;
    }
  }
  return best;
}

const shuffled = (rng, arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const wardZones = (n, seed) => shuffled(seededRng(seed), wardFile.wards)
  .slice(0, n)
  .map((w) => ({ id: `w${w.ward}`, name: w.zone, lat: w.lat, lng: w.lng }));

// the first zones again, same coordinates, new ids: every lookup near them is a tie
const withColocated = (zones, count) => [...zones, ...zones.slice(0, count).map((z) => ({ ...z, id: `${z.id}-copy` }))];

// point at distance `offset` degrees from the zone along one axis, both directions
const along = (z, axis, dir, offset) => (axis === "lat" ? { lat: z.lat + dir * offset, lng: z.lng } : { lat: z.lat, lng: z.lng + dir * offset });

// bisect to the offset where the distance crosses the radius, and keep both sides of it
function radiusEdgePoints(z) {
  const out = [];
  for (const axis of ["lat", "lng"]) {
    for (const dir of [1, -1]) {
      let lo = 0;
      let hi = 0.05;
      for (let i = 0; i < 200; i++) {
        const mid = (lo + hi) / 2;
        if (distanceKm(along(z, axis, dir, mid), z) <= ZONE_RADIUS_KM) lo = mid;
        else hi = mid;
      }
      out.push(along(z, axis, dir, lo), along(z, axis, dir, hi));
    }
  }
  return out;
}

function assertSame(zones, points) {
  for (const p of points) {
    assert.strictEqual(zoneAt(p, zones), linearZoneAt(p, zones), `point ${p.lat},${p.lng}`);
  }
}

function randomPoints(rng, zones, count) {
  const pts = [];
  for (let i = 0; i < count; i++) {
    if (i % 2 === 0 || zones.length === 0) {
      pts.push({ lat: 12.8 + rng() * 0.5, lng: 80.1 + rng() * 0.25 });
    } else {
      const z = zones[Math.floor(rng() * zones.length)];
      const r = rng() * 2 * ZONE_RADIUS_KM;
      const theta = rng() * 2 * Math.PI;
      pts.push({ lat: z.lat + (r * Math.cos(theta)) / 110.574, lng: z.lng + (r * Math.sin(theta)) / (111.32 * Math.cos((z.lat * Math.PI) / 180)) });
    }
  }
  return pts;
}

const SETS = [
  ["demo zones", ZONE_DEFS],
  ["6 wards", wardZones(6, 1)],
  ["50 wards", wardZones(50, 2)],
  ["200 wards", wardZones(200, 3)],
  ["50 wards with co-located copies", withColocated(wardZones(50, 4), 15)],
];

for (const [name, zones] of SETS) {
  test(`zoneAt matches the linear scan on 50,000 random points (${name})`, () => {
    assertSame(zones, randomPoints(seededRng(11), zones, 50_000));
  });

  test(`zoneAt matches the linear scan on the radius edge of every zone (${name})`, () => {
    assertSame(zones, zones.flatMap(radiusEdgePoints));
  });
}

test("zoneAt returns the first co-located zone in array order", () => {
  const base = wardZones(20, 5);
  const zones = withColocated(base, 20);
  const p = { lat: base[3].lat, lng: base[3].lng };
  assert.equal(zoneAt(p, zones), base[3]);
  const reversed = [...zones].reverse();
  assert.equal(zoneAt(p, reversed).id, `${base[3].id}-copy`);
  assertSame(reversed, randomPoints(seededRng(12), reversed, 2_000));
});

test("zoneAt rebuilds its index when the zones array grows", () => {
  const zones = wardZones(30, 6);
  const far = { lat: 12.9, lng: 80.2, id: "far" };
  const p = { lat: far.lat, lng: far.lng };
  assertSame(zones, [p]);
  zones.push(far);
  assert.equal(zoneAt(p, zones), far);
});

test("zoneAt handles points and zones outside the usual range the same way as the scan", () => {
  const zones = [
    { id: "pole", lat: 90, lng: 0 },
    { id: "anti-east", lat: 0, lng: 179.9995 },
    { id: "anti-west", lat: 0, lng: -179.9995 },
    { id: "missing", lat: undefined, lng: 80 },
    { id: "odd", lat: 200, lng: 80 },
    ...wardZones(20, 7),
  ];
  const points = [
    { lat: 89.9999, lng: 0 },
    { lat: 0, lng: 179.9999 },
    { lat: 0, lng: -179.9999 },
    { lat: 0.0001, lng: 180 },
    { lat: 12.9, lng: 80.2 },
    { lat: NaN, lng: 80 },
    { lat: 12.9, lng: Infinity },
    { lat: 95, lng: 80 },
  ];
  assertSame(zones, points);
});
