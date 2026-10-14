// Applies fusion.js to the live app: maps wall-clock time to fusion ticks, derives each
// reporter's trust from their past outcomes, and scores every zone. No I/O.
const { PARAMS, updateTrust, zoneProbability } = require("./fusion");

// demo clock: one tick is two simulated minutes, and one real second is one simulated minute
const TICK_MS = 2000;
const tickOf = (ms) => Math.floor(ms / TICK_MS);

// trust record for one device, replayed from its other reports; null when it has no outcome yet
function trustFromReports(reports, deviceId, excludeId) {
  if (!deviceId) return null;
  let record = null;
  for (const r of reports) {
    if (r.deviceId !== deviceId || r.id === excludeId) continue;
    if (r.status === "resolved" || r.status === "in_progress") record = updateTrust(record, "verified");
    else if (r.status === "rejected") record = updateTrust(record, "rejected");
  }
  return record;
}

function fusedZones({ zones, reports, offline, now }) {
  const nowTick = tickOf(now);
  const live = reports.filter((r) => r.status !== "rejected");
  const trust = new Map();
  for (const r of reports) {
    if (r.deviceId && !trust.has(r.deviceId)) trust.set(r.deviceId, trustFromReports(reports, r.deviceId));
  }

  const out = {};
  for (const z of zones) {
    const reading = offline.has(z.id) ? null : z.level;
    const zoneReports = live
      .filter((r) => r.zoneId === z.id)
      .map((r) => ({ deviceId: r.deviceId || "anon-" + z.id, severity: r.severity, tick: tickOf(r.ts) }));
    const maxAge = PARAMS.MAX_AGE_HALF_LIVES * PARAMS.HALF_LIFE_TICKS;
    const p = zoneProbability({ reading, reports: zoneReports, now: nowTick, trust });
    out[z.id] = {
      p: Math.round(p * 100) / 100,
      sensorOnline: !offline.has(z.id),
      recentReports: zoneReports.filter((r) => nowTick - r.tick >= 0 && nowTick - r.tick <= maxAge).length,
    };
  }
  return out;
}

module.exports = { trustFromReports, fusedZones, tickOf };
