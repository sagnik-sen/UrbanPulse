// Flood-aware evacuation planning. OSRM gives real road routes but can't "avoid this area",
// so we ask for alternatives plus detours around each zone the route is predicted to cross,
// then score every candidate under a pluggable risk model (see risk.js).
const { distanceKm, ZONE_RADIUS_KM } = require("./risk");

const DETOUR_CLEARANCE_KM = 1.2;
const MAX_SHELTERS = 3;
const MAX_DETOUR_ZONES = 2;
const SAMPLE_KM = 0.2;
const CROSSED_P = 0.5; // a zone counts as "crossed" if the route is more likely than not flooded there
const DANGER_MIN_PER_KM = 20; // one expected km through floodwater costs 20 extra minutes
const NEAR_FULL_PENALTY_MIN = 15;
const SHELTER_IN_DANGER_PENALTY_MIN = 120; // never send people deeper into a flood unless nothing else is open

const KM_PER_DEG_LAT = 110.574;
const kmPerDegLng = (lat) => 111.32 * Math.cos((lat * Math.PI) / 180);

// Walk the route; each ~200 m piece is evaluated at the time the evacuee reaches it
// (assumes constant speed along the route). Returns expected km through floodwater.
function routeExposure(route, risk) {
  const coords = route.coords;
  const segs = [];
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    const a = { lat: coords[i - 1][0], lng: coords[i - 1][1] };
    const b = { lat: coords[i][0], lng: coords[i][1] };
    const km = distanceKm(a, b);
    segs.push({ a, b, km });
    total += km;
  }

  let expectedFloodKm = 0;
  const crossed = new Set();
  let travelled = 0;
  for (const { a, b, km } of segs) {
    const pieces = Math.max(1, Math.ceil(km / SAMPLE_KM));
    for (let k = 0; k < pieces; k++) {
      const f = (k + 0.5) / pieces;
      const p = { lat: a.lat + (b.lat - a.lat) * f, lng: a.lng + (b.lng - a.lng) * f };
      const minutes = total > 0 ? (route.durationMin * (travelled + km * f)) / total : 0;
      const r = risk.at(p, minutes);
      expectedFloodKm += (km / pieces) * r.p;
      if (r.zoneId && r.p >= CROSSED_P) crossed.add(r.zoneId);
    }
    travelled += km;
  }
  return { expectedFloodKm, crossed: [...crossed] };
}

// two waypoints either side of the zone, perpendicular to the from->to direction
function detourPoints(from, to, zone) {
  const kx = kmPerDegLng(zone.lat);
  const dx = (to.lng - from.lng) * kx;
  const dy = (to.lat - from.lat) * KM_PER_DEG_LAT;
  const len = Math.hypot(dx, dy) || 1;
  const px = -dy / len;
  const py = dx / len;
  const offset = ZONE_RADIUS_KM + DETOUR_CLEARANCE_KM;
  return [1, -1].map((side) => ({
    lat: zone.lat + (side * py * offset) / KM_PER_DEG_LAT,
    lng: zone.lng + (side * px * offset) / kx,
  }));
}

const freeBeds = (shelter, reserved = {}) => shelter.capacity - shelter.occupancy - (reserved[shelter.id] || 0);

function score(route, shelter, risk, reserved) {
  const exposure = routeExposure(route, risk);
  let cost = route.durationMin + DANGER_MIN_PER_KM * exposure.expectedFloodKm;
  const expectedLoad = (shelter.occupancy + (reserved[shelter.id] || 0)) / shelter.capacity;
  if (expectedLoad >= 0.9) cost += NEAR_FULL_PENALTY_MIN;
  const shelterRisk = risk.at(shelter, route.durationMin).p;
  cost += SHELTER_IN_DANGER_PENALTY_MIN * shelterRisk;
  return { ...route, ...exposure, shelterRisk, cost };
}

function straightLine(from, shelter) {
  const km = distanceKm(from, shelter);
  return { coords: [[from.lat, from.lng], [shelter.lat, shelter.lng]], distanceKm: km, durationMin: (km / 25) * 60 };
}

// All candidate routes from `from` to each of the nearest open shelters, scored under `risk`.
// fetchRoute(points, { alternatives }) -> [{ coords, distanceKm, durationMin }]; throws when routing is unavailable.
async function candidateRoutes({ from, shelters, zones, risk, fetchRoute, reserved = {}, maxShelters = MAX_SHELTERS }) {
  const open = shelters
    .filter((s) => freeBeds(s, reserved) > 0)
    .sort((a, b) => distanceKm(from, a) - distanceKm(from, b))
    .slice(0, maxShelters);

  return Promise.all(open.map(async (shelter) => {
    const direct = (await fetchRoute([from, shelter], { alternatives: true })).map((r) => score(r, shelter, risk, reserved));
    const bestDirect = direct.reduce((a, b) => (b.cost < a.cost ? b : a));
    // detouring around the zone you start or end in is pointless; you have to be in it
    const detourZones = bestDirect.crossed
      .map((id) => zones.find((z) => z.id === id))
      .filter((z) => z && distanceKm(from, z) > ZONE_RADIUS_KM && distanceKm(shelter, z) > ZONE_RADIUS_KM)
      .slice(0, MAX_DETOUR_ZONES);
    const detours = await Promise.all(
      detourZones.flatMap((z) => detourPoints(from, shelter, z)).map((via) =>
        fetchRoute([from, via, shelter], { alternatives: false }).then((rs) => rs.map((r) => score(r, shelter, risk, reserved))).catch(() => [])
      )
    );
    return { shelter, directCrossed: bestDirect.crossed, candidates: [...direct, ...detours.flat()] };
  }));
}

async function planEvacuation({ from, shelters, zones, risk, fetchRoute, reserved = {} }) {
  const open = shelters.filter((s) => freeBeds(s, reserved) > 0);
  if (open.length === 0) return null;

  try {
    const perShelter = await candidateRoutes({ from, shelters, zones, risk, fetchRoute, reserved });
    let best = null;
    for (const { shelter, directCrossed, candidates } of perShelter) {
      for (const route of candidates) {
        if (!best || route.cost < best.route.cost) best = { shelter, route, directCrossed };
      }
    }
    const avoided = best.directCrossed.filter((id) => !best.route.crossed.includes(id));
    return { shelter: best.shelter, route: best.route, avoided, source: "osrm" };
  } catch {
    const shelter = open.sort((a, b) => distanceKm(from, a) - distanceKm(from, b))[0];
    return { shelter, route: score(straightLine(from, shelter), shelter, risk, reserved), avoided: [], source: "fallback" };
  }
}

module.exports = { planEvacuation, candidateRoutes, routeExposure, detourPoints, score, freeBeds, straightLine, distanceKm, ZONE_RADIUS_KM, DANGER_MIN_PER_KM };
