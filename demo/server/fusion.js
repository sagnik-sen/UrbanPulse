// Fuses one zone's water-level sensor with trust-weighted citizen reports in log-odds space.
// Pure functions: callers supply readings, reports and trust records.

const { normalCdf } = require("./risk");

const PARAMS = {
  DANGER: 70,
  WARNING: 40,
  PRIOR: 0.05,
  SENSOR_SIGMA: 3,
  SEVERITY_LLR: { low: 0.6, medium: 1.2, high: 2.0 },
  HALF_LIFE_TICKS: 15,
  MAX_AGE_HALF_LIVES: 4,
  NEW_DEVICE_PRIOR: { a: 1, b: 3 },
  NEW_DEVICE_CAP: 1.5,
  REPORT_CAP: 4,
  DECLARE_P: 0.5,
};

const logit = (p) => Math.log(p / (1 - p));

function trustOf(record) {
  const { a, b } = record || PARAMS.NEW_DEVICE_PRIOR;
  return a / (a + b);
}

function updateTrust(record, outcome) {
  const next = { ...(record || PARAMS.NEW_DEVICE_PRIOR) };
  if (outcome === "verified") next.a += 1;
  else if (outcome === "rejected") next.b += 1;
  else throw new Error(`unknown outcome: ${outcome}`);
  return next;
}

// A device with no verified report is "new"; new devices share one capped budget.
const isNew = (record) => !record || record.a <= PARAMS.NEW_DEVICE_PRIOR.a;

function zoneProbability({ reading, reports, now, trust }) {
  const { DANGER, SENSOR_SIGMA, PRIOR, SEVERITY_LLR, HALF_LIFE_TICKS, MAX_AGE_HALF_LIVES, NEW_DEVICE_CAP, REPORT_CAP } = PARAMS;
  let L = logit(PRIOR);
  if (reading != null) {
    const ps = Math.min(0.999, Math.max(0.001, normalCdf(reading, DANGER, SENSOR_SIGMA)));
    L += logit(ps) - logit(PRIOR);
  }
  let newSum = 0;
  let establishedSum = 0;
  for (const r of reports) {
    const age = now - r.tick;
    if (age < 0 || age > MAX_AGE_HALF_LIVES * HALF_LIFE_TICKS) continue;
    const llr = SEVERITY_LLR[r.severity];
    if (llr === undefined) throw new Error(`unknown severity: ${r.severity}`);
    const record = trust.get(r.deviceId);
    const c = trustOf(record) * llr * 0.5 ** (age / HALF_LIFE_TICKS);
    if (isNew(record)) newSum += c;
    else establishedSum += c;
  }
  L += Math.min(REPORT_CAP, Math.min(NEW_DEVICE_CAP, newSum) + establishedSum);
  return 1 / (1 + Math.exp(-L));
}

module.exports = { PARAMS, logit, trustOf, updateTrust, zoneProbability };
