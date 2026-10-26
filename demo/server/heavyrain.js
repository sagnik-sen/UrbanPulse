// Heavy-rain risk: probability that the next 24 hours bring >= 64.5 mm (IMD "heavy rain"), from an
// XGBoost model trained on ERA5 reanalysis for Chennai (demo/ml/train.py, results in
// experiments/results/xgboost.md). This file rebuilds the same features and walks the exported trees,
// so no ML runtime is needed in Node. Advisory only: it does not open incidents or send alerts.
const fs = require("node:fs");
const path = require("node:path");

const MODEL_FILE = path.join(__dirname, "models", "heavy-rain-xgb.json");
const HISTORY = 72;

const num = (v) => (v == null ? NaN : Number(v));
const sumLast = (arr, k) => arr.slice(-k).reduce((s, v) => s + v, 0);

// Same order and definitions as FEATURES / features_at() in demo/ml/train.py. `hours` holds hourly
// arrays (Open-Meteo names, IST labels); index i is the last completed hour, and i - 71 .. i are used.
const INPUTS = ["time", "precipitation", "pressure_msl", "relative_humidity_2m", "cloud_cover", "wind_speed_10m", "wind_direction_10m"];

function featuresAt(hours, i) {
  if (i < HISTORY - 1 || !INPUTS.every((v) => Array.isArray(hours[v]) && hours[v].length > i)) return null;
  const p = hours.precipitation.slice(i - HISTORY + 1, i + 1).map(num);
  const pressure = num(hours.pressure_msl[i]);
  const cloud = hours.cloud_cover.slice(i - 5, i + 1).map(num);
  const speed = num(hours.wind_speed_10m[i]);
  const rad = (num(hours.wind_direction_10m[i]) * Math.PI) / 180;
  const label = hours.time[i]; // "YYYY-MM-DDTHH:MM", IST
  const [y, m, d] = label.slice(0, 10).split("-").map(Number);
  const doy = (Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 864e5 + 1;
  const hour = Number(label.slice(11, 13));
  const a = (2 * Math.PI * (doy - 1)) / 365.25;
  const b = (2 * Math.PI * hour) / 24;
  const x = [
    p[p.length - 1], sumLast(p, 3), sumLast(p, 6), sumLast(p, 12), sumLast(p, 24), sumLast(p, 48), sumLast(p, 72), Math.max(...p.slice(-24)),
    pressure, pressure - num(hours.pressure_msl[i - 3]), pressure - num(hours.pressure_msl[i - 24]),
    num(hours.relative_humidity_2m[i]), cloud[cloud.length - 1], sumLast(cloud, 6) / 6,
    -speed * Math.sin(rad), -speed * Math.cos(rad),
    Math.sin(a), Math.cos(a), Math.sin(b), Math.cos(b),
  ];
  return x.some(Number.isNaN) ? null : x;
}

// XGBoost JSON: each tree is parallel arrays; a node is a leaf when left_children is -1, and then
// split_conditions holds its value. A split goes left when float32(x) < condition; a missing value follows default_left.
function predict(model, x) {
  const learner = model.learner;
  const base = parseFloat(String(learner.learner_model_param.base_score).replace(/[[\]]/g, ""));
  let margin = Math.log(base / (1 - base));
  for (const t of learner.gradient_booster.model.trees) {
    let n = 0;
    while (t.left_children[n] !== -1) {
      const v = Math.fround(x[t.split_indices[n]]); // xgboost compares in float32, input and split alike
      const left = Number.isNaN(v) ? Boolean(t.default_left[n]) : v < Math.fround(t.split_conditions[n]);
      n = left ? t.left_children[n] : t.right_children[n];
    }
    margin += t.split_conditions[n];
  }
  return 1 / (1 + Math.exp(-margin));
}

let cached;
function loadModel(file = MODEL_FILE) {
  if (cached === undefined) {
    try {
      cached = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      cached = null; // no trained model: the app runs without the heavy-rain column
    }
  }
  return cached;
}

// risk at index i of an hourly series, or null when the model or enough history is missing
function heavyRainRisk(hours, i, model = loadModel()) {
  if (!model) return null;
  const x = featuresAt(hours, i);
  if (!x) return null;
  const probability = predict(model, x);
  const threshold = model.urbanpulse.threshold;
  return { probability: Math.round(probability * 1000) / 1000, threshold: Math.round(threshold * 1000) / 1000, alert: probability >= threshold };
}

module.exports = { HISTORY, featuresAt, predict, loadModel, heavyRainRisk };
