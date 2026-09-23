// Damped-trend (Holt) exponential smoothing with a drainage term: a lightweight
// stand-in for the LSTM described in the deck. Same interface: recent readings
// in, a projected path with an uncertainty band out.
const ALPHA = 0.5; // level smoothing
const BETA = 0.3; // trend smoothing
const PHI = 0.9; // trend damping; projections flatten instead of running off to infinity
const DRAIN = 0.99; // per step, the gap to the recent baseline shrinks by 1% (water drains away)
const MIN_SIGMA = 2;
const BAND_GROWTH_CAP = 25; // uncertainty stops widening after this many steps

const clamp = (v) => Math.max(0, Math.min(100, v));

function median(values) {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function forecast(series, horizon) {
  if (series.length < 5) return [];

  let level = series[0];
  let trend = series[1] - series[0];
  const errors = [];

  for (let i = 1; i < series.length; i++) {
    const predicted = level + PHI * trend;
    errors.push(series[i] - predicted);
    const nextLevel = ALPHA * series[i] + (1 - ALPHA) * predicted;
    trend = BETA * (nextLevel - level) + (1 - BETA) * PHI * trend;
    level = nextLevel;
  }

  // MAD-based sigma: a single storm jump shouldn't make the band cover 0-100
  const recent = errors.slice(-20);
  const sigma = Math.max(MIN_SIGMA, 1.4826 * median(recent.map((e) => Math.abs(e - median(recent)))));
  const baseline = series.reduce((s, v) => s + v, 0) / series.length;

  const out = [];
  let dampSum = 0;
  for (let h = 1; h <= horizon; h++) {
    dampSum += PHI ** h;
    const holt = level + dampSum * trend;
    const mean = baseline + (holt - baseline) * DRAIN ** h;
    const spread = 1.96 * sigma * Math.sqrt(Math.min(h, BAND_GROWTH_CAP));
    out.push({ h, mean: Math.round(clamp(mean)), lo: Math.round(clamp(mean - spread)), hi: Math.round(clamp(mean + spread)) });
  }
  return out;
}

// steps until the projected mean first reaches the threshold; 0 if already there, null if never within horizon
function stepsToBreach(current, path, threshold) {
  if (current >= threshold) return 0;
  const hit = path.find((p) => p.mean >= threshold);
  return hit ? hit.h : null;
}

module.exports = { forecast, stepsToBreach };
