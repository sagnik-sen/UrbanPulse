const test = require("node:test");
const assert = require("node:assert/strict");
const { modelALevels, rollingSum, classify, risingEdges, withReleaseAlert, leadHours, beforeDayEnd, zeroNulls, IMD_HEAVY_MM, IMD_VERY_HEAVY_MM } = require("./experiments/replay");

test("model A settles at base + 5 x rate under constant rain", () => {
  const levels = modelALevels(Array(200).fill(10), 35);
  assert.ok(Math.abs(levels.at(-1) - (35 + 5 * 10)) < 1e-6);
  assert.ok(levels[0] < levels.at(-1), "level should still be rising in the first hour");
});

test("model A release impact enters storm at the start of its hour and decays", () => {
  const levels = modelALevels([0, 0], 30, { 0: 10 });
  assert.ok(Math.abs(levels[0] - (30 + 10 * 0.97 ** 30)) < 1e-9);
});

test("model B thresholds are inclusive at exactly 64.5 and 115.6", () => {
  assert.equal(classify(IMD_HEAVY_MM, IMD_HEAVY_MM, IMD_VERY_HEAVY_MM), "warning");
  assert.equal(classify(64.4, IMD_HEAVY_MM, IMD_VERY_HEAVY_MM), "safe");
  assert.equal(classify(IMD_VERY_HEAVY_MM, IMD_HEAVY_MM, IMD_VERY_HEAVY_MM), "danger");
  assert.equal(classify(115.5, IMD_HEAVY_MM, IMD_VERY_HEAVY_MM), "warning");
});

test("model B threshold holds for sums that are 64.5 only up to float rounding", () => {
  const series = zeroNulls(Array(10).fill(6.45));
  assert.equal(classify(rollingSum(series, 9), IMD_HEAVY_MM, IMD_VERY_HEAVY_MM), "warning");
});

test("rolling 24 h sum is correct across nulls and at the start of a series", () => {
  const series = zeroNulls(Array.from({ length: 30 }, (_, i) => (i % 3 === 0 ? null : 2)));
  assert.equal(rollingSum(series, 0), 0);
  assert.equal(rollingSum(series, 1), 2);
  assert.equal(rollingSum(series, 29), 32);
});

test("lead time is positive before the flood day and negative after, from IST labels", () => {
  assert.equal(leadHours("2023-12-03T12:00", "2023-12-04"), 12);
  assert.equal(leadHours("2023-12-04T06:00", "2023-12-04"), -6);
  assert.equal(beforeDayEnd("2023-12-04T23:00", "2023-12-04"), true);
  assert.equal(beforeDayEnd("2023-12-05T00:00", "2023-12-04"), false);
});

test("rising edges count transitions from safe, starting from safe", () => {
  assert.equal(risingEdges([false, true, true, false, true]), 2);
  assert.equal(risingEdges([true, true]), 1);
  assert.equal(risingEdges([false, false]), 0);
});

test("release alert forces the release hour only", () => {
  const forced = withReleaseAlert({ warn: [false, false, false], danger: [false, false, false] }, 1);
  assert.deepEqual(forced.danger, [false, true, false]);
  assert.deepEqual(forced.warn, [false, true, false]);
});
