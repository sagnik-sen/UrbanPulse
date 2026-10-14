// Flood risk models used for route scoring. Each model answers one question:
// "what is the probability that this point is inside a flooded (danger) zone at time t?"
//
//  snapshotRisk  - the conventional approach: whatever is flooded right now stays flooded
//  forecastRisk  - proposed: uses each zone's forecast distribution at the moment the
//                  evacuee actually reaches that point

const ZONE_RADIUS_KM = 1.5;
const WARNING_WEIGHT = 0.15; // snapshot model treats a warning zone as a soft 15% risk
const MIN_SIGMA = 1; // floor so a perfectly flat series still yields a probability, not a step function

function distanceKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Abramowitz & Stegun 7.1.26 erf approximation (max error ~1.5e-7)
function erf(x) {
  const sign = Math.sign(x);
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-ax * ax);
  return sign * y;
}

function normalCdf(x, mean, sigma) {
  return 0.5 * (1 + erf((x - mean) / (sigma * Math.SQRT2)));
}

// Zone lookup via a grid over zone centres. The grid only decides which zones get a distanceKm
// call; among those, the nearest within the radius wins and ties go to the earlier array index,
// which is what the linear scan returns. The index is cached per zones array and assumes a
// zone's lat/lng do not change after its first lookup.
const EARTH_KM = 6371;
const DEG = 180 / Math.PI;
const RADIUS_RAD = ZONE_RADIUS_KM / EARTH_KM;
const LAT_CELL_DEG = ((ZONE_RADIUS_KM / 110.574) * 1.01); // about one search radius per cell; cell size only affects speed
const PAD = 1.000001; // absorbs floating-point error in the search bounds
const gridCache = new WeakMap();

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

const clampCell = (v, n) => Math.min(n - 1, Math.max(0, Math.floor(v)));

function buildGrid(zones) {
  const inRange = [];
  const extra = []; // zones with missing or out-of-range coordinates; checked on every lookup
  let maxAbsLat = 0;
  zones.forEach((z, i) => {
    const lat = +z.lat;
    const lng = +z.lng;
    if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      inRange.push(i);
      maxAbsLat = Math.max(maxAbsLat, Math.abs(lat));
    } else {
      extra.push(i);
    }
  });
  const minCos = Math.cos((maxAbsLat * Math.PI) / 180);
  const lngCell = LAT_CELL_DEG / Math.max(minCos, 1e-3);
  const grid = { n: zones.length, minCos, latCell: LAT_CELL_DEG, lngCell, nLat: Math.ceil(180 / LAT_CELL_DEG) + 1, nLng: Math.ceil(360 / lngCell) + 1, cells: new Map(), extra };
  for (const i of inRange) {
    const key = clampCell((+zones[i].lng + 180) / lngCell, grid.nLng) * grid.nLat + clampCell((+zones[i].lat + 90) / LAT_CELL_DEG, grid.nLat);
    if (!grid.cells.has(key)) grid.cells.set(key, []);
    grid.cells.get(key).push(i);
  }
  return grid;
}

function gridFor(zones) {
  let grid = gridCache.get(zones);
  if (!grid || grid.n !== zones.length) {
    grid = buildGrid(zones);
    gridCache.set(zones, grid);
  }
  return grid;
}

function zoneAt(point, zones) {
  const lat = +point.lat;
  const lng = +point.lng;
  if (!(Math.abs(lat) <= 90 && Math.abs(lng) <= 180)) return linearZoneAt(point, zones);
  const grid = gridFor(zones);

  // Haversine gives d >= R * |dLat| and cos(lat1) * cos(lat2) * sin^2(dLng / 2) <= sin^2(d / 2R),
  // so a zone within the radius lies inside this lat/lng window. Near the poles or the
  // antimeridian the window is not usable, so fall back to the scan.
  const sinOverCos = Math.sin(RADIUS_RAD / 2) / Math.sqrt(Math.cos((lat * Math.PI) / 180) * grid.minCos);
  if (!(sinOverCos < 1)) return linearZoneAt(point, zones);
  const lngHalf = 2 * Math.asin(sinOverCos) * DEG * PAD;
  const latHalf = RADIUS_RAD * DEG * PAD;
  if (lng - lngHalf < -180 || lng + lngHalf > 180) return linearZoneAt(point, zones);

  const x0 = clampCell((lng - lngHalf + 180) / grid.lngCell, grid.nLng);
  const x1 = clampCell((lng + lngHalf + 180) / grid.lngCell, grid.nLng);
  const y0 = clampCell((lat - latHalf + 90) / grid.latCell, grid.nLat);
  const y1 = clampCell((lat + latHalf + 90) / grid.latCell, grid.nLat);
  const found = grid.extra.slice();
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      const cell = grid.cells.get(x * grid.nLat + y);
      if (cell) found.push(...cell);
    }
  }

  // the scan's answer is the smallest distance within the radius, ties going to the earlier index
  let best = null;
  let bestD = Infinity;
  let bestI = Infinity;
  for (const i of found) {
    const d = distanceKm(point, zones[i]);
    if (d <= ZONE_RADIUS_KM && (d < bestD || (d === bestD && i < bestI))) {
      best = zones[i];
      bestD = d;
      bestI = i;
    }
  }
  return best;
}

function snapshotRisk(zones, { warningWeight = WARNING_WEIGHT } = {}) {
  return {
    name: "snapshot",
    at(point) {
      const z = zoneAt(point, zones);
      if (!z) return { p: 0, zoneId: null };
      return { p: z.risk === "danger" ? 1 : z.risk === "warning" ? warningWeight : 0, zoneId: z.id };
    },
  };
}

// minutes from now -> the zone's level distribution at that time.
// Forecast steps are simMinPerStep apart; we interpolate between steps.
// Before the first step we blend from the current reading; beyond the horizon
// we hold the last step's distribution (an explicit, conservative assumption).
function levelDistribution(zone, minutes, simMinPerStep) {
  const path = zone.forecast || [];
  if (path.length === 0) return { mean: zone.level, sigma: MIN_SIGMA };
  const s = Math.max(0, minutes / simMinPerStep);
  if (s >= path.length) {
    const last = path[path.length - 1];
    return { mean: last.rawMean, sigma: Math.max(MIN_SIGMA, last.sigma) };
  }
  const lower = s < 1 ? { rawMean: zone.level, sigma: MIN_SIGMA } : path[Math.floor(s) - 1];
  const upper = path[Math.min(path.length - 1, Math.floor(s))];
  const f = s < 1 ? s : s - Math.floor(s);
  return {
    mean: lower.rawMean + (upper.rawMean - lower.rawMean) * f,
    sigma: Math.max(MIN_SIGMA, lower.sigma + (upper.sigma - lower.sigma) * f),
  };
}

function forecastRisk(zones, dangerThreshold, simMinPerStep) {
  return {
    name: "forecast",
    at(point, minutes) {
      const z = zoneAt(point, zones);
      if (!z) return { p: 0, zoneId: null };
      const { mean, sigma } = levelDistribution(z, minutes, simMinPerStep);
      return { p: 1 - normalCdf(dangerThreshold, mean, sigma), zoneId: z.id };
    },
  };
}

// ground truth for experiments: actual future levels from the simulator, known only after the fact
function oracleRisk(zones, levelsByMinute, dangerThreshold, simMinPerStep) {
  return {
    name: "oracle",
    at(point, minutes) {
      const z = zoneAt(point, zones);
      if (!z) return { p: 0, zoneId: null };
      const series = levelsByMinute[z.id];
      const i = Math.min(series.length - 1, Math.max(0, Math.round(minutes / simMinPerStep)));
      return { p: series[i] >= dangerThreshold ? 1 : 0, zoneId: z.id };
    },
  };
}

module.exports = { snapshotRisk, forecastRisk, oracleRisk, levelDistribution, normalCdf, zoneAt, distanceKm, ZONE_RADIUS_KM };
