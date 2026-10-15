const test = require("node:test");
const assert = require("node:assert");
const { category, rank, imdAlerts, withCategories } = require("./imd");
const { parseRainfall } = require("./rainfall");

const ZONES = [{ id: "velachery", name: "Velachery" }, { id: "adyar", name: "Adyar" }];

// one 72-hour Open-Meteo body (one day before, the day of, the day after), now at nowIndex
function meteo(values, nowIndex) {
  const time = values.map((_, i) => `2026-09-${27 + Math.floor(i / 24)}T${String(i % 24).padStart(2, "0")}:00`);
  return { current: { time: time[nowIndex].replace(":00", ":15"), precipitation: 0 }, hourly: { time, precipitation: values, precipitation_probability: values.map(() => 0) } };
}

test("IMD 24 h categories switch exactly at the published cut-offs", () => {
  assert.equal(category(64.4), "none");
  assert.equal(category(64.5), "heavy");
  assert.equal(category(115.5), "heavy");
  assert.equal(category(115.6), "veryHeavy");
  assert.equal(category(204.4), "veryHeavy");
  assert.equal(category(204.5), "extremelyHeavy");
  assert.deepEqual([category(0), rank(category(0)), rank("extremelyHeavy")], ["none", 0, 3]);
});

test("past 24 h totals cover the hours before now only, and short histories sum what exists", () => {
  const values = Array(72).fill(0);
  values[2] = 500; // 25 hours before now: outside the window
  values[3] = 10; // exactly 24 hours before now: inside
  values[26] = 5; // the hour just before now
  values[27] = 300; // the now hour belongs to next 24 h, not past
  values[40] = 2;
  const r = parseRainfall([{ id: "z", lat: 13, lng: 80.2 }], meteo(values, 27));
  assert.equal(r.z.past24hMm, 15);
  assert.equal(r.z.next24hMm, 302);
  assert.equal(r.z.hourly[0].time, "2026-09-28T03:00");

  const short = Array(72).fill(0);
  short[0] = 2;
  short[1] = 2;
  short[2] = 2;
  const s = parseRainfall([{ id: "z", lat: 13, lng: 80.2 }], meteo(short, 3));
  assert.equal(s.z.past24hMm, 6);
});

const feed = (velachery, adyar = { past24hMm: 0, next24hMm: 0 }) => ({ zones: { velachery, adyar } });
const run = (prev, past, next = 0) => imdAlerts(prev, ZONES, feed({ past24hMm: past, next24hMm: next }), 1000);

test("observed alert fires on the first rise, not while the rank persists, and re-arms after a drop", () => {
  let s = {};
  let out = run(s, 70);
  assert.equal(out.alerts.length, 1);
  assert.equal(out.alerts[0].severity, "warning");
  assert.equal(out.alerts[0].zoneId, "velachery");
  assert.match(out.alerts[0].message, /^IMD HEAVY RAIN: 70 mm in the last 24 h in Velachery\./);
  assert.deepEqual(out.alerts[0].reason, { rule: "imd-observed", mm: 70, threshold: 64.5, category: "heavy" });
  s = out.state;

  out = run(s, 80);
  assert.deepEqual(out.alerts, [], "still heavy, no repeat");
  s = out.state;

  out = run(s, 130);
  assert.equal(out.alerts.length, 1);
  assert.equal(out.alerts[0].severity, "danger");
  assert.match(out.alerts[0].message, /^IMD VERY HEAVY RAIN: 130 mm/);
  assert.deepEqual(out.alerts[0].reason, { rule: "imd-observed", mm: 130, threshold: 115.6, category: "veryHeavy" });
  s = out.state;

  out = run(s, 130);
  assert.deepEqual(out.alerts, [], "very heavy persists, no repeat");
  s = out.state;

  out = run(s, 100);
  assert.deepEqual(out.alerts, [], "dropping to heavy alerts nothing");
  assert.deepEqual(out.state.velachery, { observed: 1, forecast: 0 }, "drop re-arms to the current rank");
  s = out.state;

  out = run(s, 130);
  assert.equal(out.alerts.length, 1, "rising again after a drop alerts again");
  assert.equal(out.alerts[0].severity, "danger");
});

test("extremely heavy observed rain is a danger alert", () => {
  const out = run({}, 210);
  assert.equal(out.alerts.length, 1);
  assert.equal(out.alerts[0].severity, "danger");
  assert.match(out.alerts[0].message, /^IMD EXTREMELY HEAVY RAIN: 210 mm/);
  assert.deepEqual(out.alerts[0].reason, { rule: "imd-observed", mm: 210, threshold: 204.5, category: "extremelyHeavy" });
});

test("forecast alert only at very heavy or more, once per rise, warning severity", () => {
  let s = {};
  let out = run(s, 0, 70);
  assert.deepEqual(out.alerts, [], "heavy forecast alone does not alert");
  s = out.state;

  out = run(s, 0, 128);
  assert.equal(out.alerts.length, 1);
  assert.equal(out.alerts[0].severity, "warning");
  assert.equal(out.alerts[0].message, "IMD FORECAST: very heavy rain (128 mm) expected in Velachery in the next 24 h. Prepare to move to higher ground.");
  assert.deepEqual(out.alerts[0].reason, { rule: "imd-forecast", mm: 128, threshold: 115.6, category: "veryHeavy" });
  s = out.state;

  out = run(s, 0, 130);
  assert.deepEqual(out.alerts, [], "still very heavy, no repeat");
  s = out.state;

  out = run(s, 0, 100);
  assert.deepEqual(out.alerts, [], "drop re-arms silently");
  s = out.state;

  out = run(s, 0, 130);
  assert.equal(out.alerts.length, 1, "next rise alerts again");
});

test("a zone without a reading keeps its previous state, and state stays plain JSON", () => {
  const prev = { velachery: { observed: 2, forecast: 2 } };
  const out = imdAlerts(prev, ZONES, { zones: { adyar: { past24hMm: 0, next24hMm: 0 } } }, 1000);
  assert.deepEqual(out.state.velachery, { observed: 2, forecast: 2 });
  assert.deepEqual(out.state.adyar, { observed: 0, forecast: 0 });
  assert.deepEqual(JSON.parse(JSON.stringify(out.state)), out.state);
});

test("withCategories adds the observed and forecast categories without changing the reading", () => {
  const z = withCategories({ velachery: { past24hMm: 120, next24hMm: 10, currentMmPerHr: 1 } }).velachery;
  assert.deepEqual(z, { past24hMm: 120, next24hMm: 10, currentMmPerHr: 1, imdObserved: "veryHeavy", imdForecast: "none" });
});
