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

function zoneAt(point, zones) {
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
