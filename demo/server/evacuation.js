// Flood-aware evacuation planning. OSRM gives real road routes but has no way
// to "avoid this area", so we ask it for alternatives plus detours around each
// flooded zone the direct route crosses, then score every candidate.
const ZONE_RADIUS_KM = 1.5;
const DETOUR_CLEARANCE_KM = 1.2;
const MAX_SHELTERS = 3;
const MAX_DETOUR_ZONES = 2;
const DANGER_MIN_PER_KM = 20; // a km through floodwater "costs" 20 extra minutes
const WARNING_MIN_PER_KM = 3;
const NEAR_FULL_PENALTY_MIN = 15;
const SHELTER_IN_DANGER_PENALTY_MIN = 120; // never send people deeper into a flood unless nothing else is open

const KM_PER_DEG_LAT = 110.574;
const kmPerDegLng = (lat) => 111.32 * Math.cos((lat * Math.PI) / 180);

function distanceKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const SAMPLE_KM = 0.2;

// km of the route inside danger / warning zone circles. Long segments are sampled
// every SAMPLE_KM so a straight line through a zone centre isn't missed.
function routeExposure(coords, zones) {
  let dangerKm = 0;
  let warningKm = 0;
  const crossed = new Set();
  const risky = zones.filter((z) => z.risk !== "safe");
  for (let i = 1; i < coords.length; i++) {
    const a = { lat: coords[i - 1][0], lng: coords[i - 1][1] };
    const b = { lat: coords[i][0], lng: coords[i][1] };
    const seg = distanceKm(a, b);
    const pieces = Math.max(1, Math.ceil(seg / SAMPLE_KM));
    for (let k = 0; k < pieces; k++) {
      const f = (k + 0.5) / pieces;
      const p = { lat: a.lat + (b.lat - a.lat) * f, lng: a.lng + (b.lng - a.lng) * f };
      const inDanger = risky.find((z) => z.risk === "danger" && distanceKm(p, z) <= ZONE_RADIUS_KM);
      if (inDanger) {
        dangerKm += seg / pieces;
        crossed.add(inDanger.id);
      } else if (risky.some((z) => distanceKm(p, z) <= ZONE_RADIUS_KM)) {
        warningKm += seg / pieces;
      }
    }
  }
  return { dangerKm, warningKm, crossed: [...crossed] };
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

function score(route, shelter, zones) {
  const exposure = routeExposure(route.coords, zones);
  let cost = route.durationMin + DANGER_MIN_PER_KM * exposure.dangerKm + WARNING_MIN_PER_KM * exposure.warningKm;
  if (shelter.occupancy / shelter.capacity >= 0.9) cost += NEAR_FULL_PENALTY_MIN;
  if (zones.some((z) => z.risk === "danger" && distanceKm(shelter, z) <= ZONE_RADIUS_KM)) cost += SHELTER_IN_DANGER_PENALTY_MIN;
  return { ...route, ...exposure, cost };
}

function straightLine(from, shelter) {
  const km = distanceKm(from, shelter);
  return { coords: [[from.lat, from.lng], [shelter.lat, shelter.lng]], distanceKm: km, durationMin: (km / 25) * 60 };
}

// fetchRoute(points, { alternatives }) -> [{ coords: [[lat,lng]], distanceKm, durationMin }]; throws when routing is unavailable
async function planEvacuation({ from, shelters, zones, fetchRoute }) {
  const open = shelters
    .filter((s) => s.occupancy < s.capacity)
    .sort((a, b) => distanceKm(from, a) - distanceKm(from, b))
    .slice(0, MAX_SHELTERS);
  if (open.length === 0) return null;

  try {
    const perShelter = await Promise.all(open.map(async (shelter) => {
      const direct = (await fetchRoute([from, shelter], { alternatives: true })).map((r) => score(r, shelter, zones));
      const bestDirect = direct.reduce((a, b) => (b.cost < a.cost ? b : a));
      // detouring around the zone you start or end in is pointless; you have to be in it
      const detourZones = bestDirect.crossed
        .map((id) => zones.find((z) => z.id === id))
        .filter((z) => distanceKm(from, z) > ZONE_RADIUS_KM && distanceKm(shelter, z) > ZONE_RADIUS_KM)
        .slice(0, MAX_DETOUR_ZONES);
      const detours = await Promise.all(
        detourZones.flatMap((z) => detourPoints(from, shelter, z)).map((via) =>
          fetchRoute([from, via, shelter], { alternatives: false }).then((rs) => rs.map((r) => score(r, shelter, zones))).catch(() => [])
        )
      );
      return { shelter, directCrossed: bestDirect.crossed, candidates: [...direct, ...detours.flat()] };
    }));

    let best = null;
    for (const { shelter, directCrossed, candidates } of perShelter) {
      for (const route of candidates) {
        if (!best || route.cost < best.route.cost) best = { shelter, route, directCrossed };
      }
    }
    const avoided = best.directCrossed.filter((id) => !best.route.crossed.includes(id));
    return { shelter: best.shelter, route: best.route, avoided, source: "osrm" };
  } catch {
    const shelter = open[0];
    return { shelter, route: score(straightLine(from, shelter), shelter, zones), avoided: [], source: "fallback" };
  }
}

module.exports = { planEvacuation, routeExposure, detourPoints, distanceKm, ZONE_RADIUS_KM };
