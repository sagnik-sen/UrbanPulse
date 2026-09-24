// One-time download of every route the experiments need, so experiment runs are
// offline and reproducible. Respects the public OSRM server's ~1 request/second policy.
//
//   node experiments/fetch-routes.js
//
// Resumable: progress is saved to routes.partial.json after every request.
const fs = require("node:fs");
const path = require("node:path");
const { ZONE_DEFS, SHELTER_DEFS } = require("../simulator");
const { distanceKm, ZONE_RADIUS_KM } = require("../risk");
const { detourPoints } = require("../evacuation");

const OSRM_URL = "https://router.project-osrm.org/route/v1/driving";
const OUT = path.join(__dirname, "routes.json");
const PARTIAL = path.join(__dirname, "routes.partial.json");
const REQUEST_GAP_MS = 1100;
const ORIGIN_OFFSET_KM = 0.8;
const MAX_DETOUR_ZONES = 3;
const MIN_POINT_GAP_KM = 0.05; // thin the geometry; exposure is sampled every 200 m anyway

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function offset(p, km, bearingDeg) {
  const b = (bearingDeg * Math.PI) / 180;
  return {
    lat: +(p.lat + (km * Math.cos(b)) / 110.574).toFixed(5),
    lng: +(p.lng + (km * Math.sin(b)) / (111.32 * Math.cos((p.lat * Math.PI) / 180))).toFixed(5),
  };
}

// evacuees start from several points across each zone, not just its centre
const ORIGINS = ZONE_DEFS.flatMap((z) => [
  { id: `${z.id}-c`, zoneId: z.id, lat: z.lat, lng: z.lng },
  { id: `${z.id}-ne`, zoneId: z.id, ...offset(z, ORIGIN_OFFSET_KM, 45) },
  { id: `${z.id}-sw`, zoneId: z.id, ...offset(z, ORIGIN_OFFSET_KM, 225) },
]);

function thin(coords) {
  const out = [coords[0]];
  for (let i = 1; i < coords.length - 1; i++) {
    const last = out[out.length - 1];
    if (distanceKm({ lat: last[0], lng: last[1] }, { lat: coords[i][0], lng: coords[i][1] }) >= MIN_POINT_GAP_KM) out.push(coords[i]);
  }
  out.push(coords[coords.length - 1]);
  return out.map(([a, b]) => [+a.toFixed(5), +b.toFixed(5)]);
}

async function osrm(points, alternatives) {
  const coords = points.map((p) => `${p.lng.toFixed(5)},${p.lat.toFixed(5)}`).join(";");
  for (let attempt = 0; attempt < 3; attempt++) {
    await sleep(REQUEST_GAP_MS * (attempt + 1));
    try {
      const res = await fetch(`${OSRM_URL}/${coords}?overview=full&geometries=geojson&alternatives=${alternatives}`, { signal: AbortSignal.timeout(15000) });
      const data = await res.json();
      if (data.code !== "Ok") throw new Error(data.code);
      return data.routes.map((r) => ({
        coords: thin(r.geometry.coordinates.map(([lng, lat]) => [lat, lng])),
        distanceKm: +(r.distance / 1000).toFixed(3),
        durationMin: +(r.duration / 60).toFixed(2),
      }));
    } catch (err) {
      console.error(`  retry ${attempt + 1}: ${err.message}`);
    }
  }
  throw new Error(`failed after retries: ${coords}`);
}

// zones (other than start/end zones) whose flood circle the route passes through
function zonesNear(route, origin, shelter) {
  const hits = new Set();
  for (const [lat, lng] of route.coords) {
    for (const z of ZONE_DEFS) {
      if (z.id === origin.zoneId || distanceKm(shelter, z) <= ZONE_RADIUS_KM) continue;
      if (distanceKm({ lat, lng }, z) <= ZONE_RADIUS_KM) hits.add(z.id);
    }
  }
  return [...hits].slice(0, MAX_DETOUR_ZONES).map((id) => ZONE_DEFS.find((z) => z.id === id));
}

async function main() {
  const done = fs.existsSync(PARTIAL) ? JSON.parse(fs.readFileSync(PARTIAL, "utf8")) : { routes: {} };
  const pairs = ORIGINS.flatMap((o) => SHELTER_DEFS.map((s) => [o, s]));
  let i = 0;
  for (const [origin, shelter] of pairs) {
    i++;
    const key = `${origin.id}|${shelter.id}`;
    if (done.routes[key]) continue;
    const direct = await osrm([origin, shelter], true);
    const candidates = direct.map((r, k) => ({ ...r, kind: k === 0 ? "direct" : "alternative" }));
    for (const z of zonesNear(direct[0], origin, shelter)) {
      for (const via of detourPoints(origin, shelter, z)) {
        try {
          const [r] = await osrm([origin, via, shelter], false);
          candidates.push({ ...r, kind: "detour", around: z.id });
        } catch {
          // a detour point in the sea or off-network just isn't a candidate
        }
      }
    }
    done.routes[key] = candidates;
    fs.writeFileSync(PARTIAL, JSON.stringify(done));
    console.log(`[${i}/${pairs.length}] ${key}: ${candidates.length} candidates`);
  }

  const out = {
    generatedAt: new Date().toISOString(),
    source: "OSRM public demo server (router.project-osrm.org), OpenStreetMap data",
    origins: ORIGINS,
    routes: done.routes,
  };
  fs.writeFileSync(OUT, JSON.stringify(out));
  fs.rmSync(PARTIAL);
  console.log(`saved ${Object.keys(out.routes).length} origin-shelter pairs to ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
