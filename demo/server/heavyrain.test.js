// Parity with the Python training code: the fixture holds raw hourly history, the feature vector and the
// probability xgboost computed for the same hours (written by demo/ml/train.py).
const test = require("node:test");
const assert = require("node:assert");
const path = require("node:path");
const fs = require("node:fs");
const { featuresAt, predict, loadModel, heavyRainRisk, HISTORY } = require("./heavyrain");

const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, "models", "heavy-rain-fixture.json"), "utf8"));
const model = loadModel();

test("features match the Python features for every fixture case", () => {
  for (const c of fixture.cases) {
    const x = featuresAt(c.hours, HISTORY - 1);
    assert.strictEqual(x.length, c.features.length);
    x.forEach((v, k) => assert.ok(Math.abs(v - c.features[k]) < 1e-9, `feature ${model.urbanpulse.features[k]}: ${v} vs ${c.features[k]}`));
  }
});

test("tree walk gives the xgboost probability for every fixture case", () => {
  assert.ok(fixture.cases.length >= 5);
  for (const c of fixture.cases) assert.ok(Math.abs(predict(model, c.features) - c.probability) < 1e-5, `${predict(model, c.features)} vs ${c.probability}`);
});

test("too little history or a missing value gives no risk instead of a guess", () => {
  const c = fixture.cases[0];
  assert.strictEqual(heavyRainRisk(c.hours, HISTORY - 2, model), null);
  const gap = { ...c.hours, pressure_msl: [...c.hours.pressure_msl] };
  gap.pressure_msl[HISTORY - 1] = null;
  assert.strictEqual(heavyRainRisk(gap, HISTORY - 1, model), null);
  const ok = heavyRainRisk(c.hours, HISTORY - 1, model);
  assert.strictEqual(ok.alert, ok.probability >= model.urbanpulse.threshold);
});
