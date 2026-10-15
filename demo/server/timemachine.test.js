const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { loadEvent, createReplay, listEvents } = require("./timemachine");

const DATA = path.join(__dirname, "experiments", "data");
const raw = (file) => JSON.parse(fs.readFileSync(path.join(DATA, file), "utf8"));

// advance a replay until its simulated clock reads the given IST label
function replayAt(event, label, options) {
  const replay = createReplay(event, options);
  const target = event.time.indexOf(label);
  assert.ok(target >= 0, `${label} is in the data`);
  while (replay.hourIndex < target) replay.advance(60);
  return replay;
}

test("24 h sums match the replay experiment's window (hours h-23..h) computed from the raw data", () => {
  const data = raw("rain-michaung-2023.json");
  const series = data.mmPerHour.pallikaranai;
  const h = data.time.indexOf("2023-12-04T15:00");
  let expected = 0;
  for (let j = h - 23; j <= h; j++) expected += series[j];
  expected = Math.round(expected * 10) / 10;

  // the experiment's window ending at hour h is the replay's "past 24 h" once the clock reads h+1
  const replay = replayAt(loadEvent("michaung-2023"), data.time[h + 1]);
  assert.equal(replay.past24hMm("pallikaranai"), expected);
  assert.equal(expected, 118.2);
  assert.equal(replay.rainAt("pallikaranai"), series[h + 1]);
});

test("the first hour Pallikaranai reaches very heavy 24 h rain is 2023-12-04 15:00, as in replay.md", () => {
  const data = raw("rain-michaung-2023.json");
  const series = data.mmPerHour.pallikaranai;
  const firstAt = data.time.find((_, h) => {
    if (h < 23) return false;
    let sum = 0;
    for (let j = h - 23; j <= h; j++) sum += series[j];
    return Math.round(sum * 10) / 10 >= 115.6;
  });
  assert.equal(firstAt, "2023-12-04T15:00");
});

test("advance() crosses hour boundaries and the clock reads IST", () => {
  const replay = createReplay(loadEvent("michaung-2023"), { minutesPerTick: 30 });
  const start = replay.hourIndex;
  assert.equal(replay.currentTime, "2023-12-02 00:00");
  replay.advance(45);
  assert.equal(replay.hourIndex, start);
  assert.equal(replay.currentTime, "2023-12-02 00:45");
  replay.advance(30);
  assert.equal(replay.hourIndex, start + 1);
  assert.equal(replay.currentTime, "2023-12-02 01:15");
});

test("the 2015 release is due once, at its documented time", () => {
  const event = loadEvent("chennai-2015");
  const replay = createReplay(event, { minutesPerTick: 120 });
  const fired = [];
  while (!replay.done) {
    replay.advance(2);
    for (const e of replay.dueEvents()) fired.push({ ...e, at: replay.currentTime });
  }
  assert.equal(fired.length, 1);
  assert.equal(fired[0].reservoir, "chembarambakkam");
  assert.equal(fired[0].cusecs, 29000);
  assert.equal(fired[0].at, "2015-12-01 20:00");
});

test("the Michaung event has no release", () => {
  const replay = createReplay(loadEvent("michaung-2023"));
  replay.advance(12960);
  assert.deepEqual(replay.dueEvents(), []);
});

test("replay ends at the end of the data and stays there", () => {
  const replay = createReplay(loadEvent("michaung-2023"), { minutesPerTick: 120 });
  assert.equal(replay.done, false);
  replay.advance(100000);
  assert.equal(replay.done, true);
  // the last hour (23:00) ends at midnight, so the clock stops at the end of the data
  assert.equal(replay.currentTime, "2023-12-11 00:00");
  assert.equal(replay.progress, 1);
  assert.equal(typeof replay.rainAt("velachery"), "number");
});

test("the replay runs for 216 hours from two days before the flood day", () => {
  const [michaung, chennai] = listEvents();
  assert.equal(michaung.startTime, "2023-12-02T00:00");
  assert.equal(michaung.hours, 216);
  assert.equal(chennai.startTime, "2015-11-30T00:00");
  assert.equal(chennai.hours, 216);
});

test("rainfall() has the shape of the live feed, with 24 hourly values from the current hour", () => {
  const replay = replayAt(loadEvent("michaung-2023"), "2023-12-04T14:00");
  const view = replay.rainfall();
  assert.equal(view.replay, true);
  assert.equal(view.stale, false);
  const velachery = view.zones.velachery;
  assert.equal(velachery.hourly.length, 24);
  assert.equal(velachery.hourly[0].time, "2023-12-04T14:00");
  assert.equal(velachery.next24hMm, Math.round(velachery.hourly.reduce((s, h) => s + h.mm, 0) * 10) / 10);
});
