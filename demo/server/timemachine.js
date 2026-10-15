// Flood time machine: replays the committed hourly rainfall of a past event (Open-Meteo ERA5
// reanalysis, IST) through the live model. Pure: no timers, no sockets; index.js does the effects.
// Times are IST wall-clock labels ("YYYY-MM-DDTHH:MM"), parsed as UTC so no local zone enters.
const fs = require("node:fs");
const path = require("node:path");

const DATA_DIR = path.join(__dirname, "experiments", "data");
const EVENTS = {
  "michaung-2023": { name: "Cyclone Michaung", label: "Cyclone Michaung, Chennai (December 2023)", short: "Michaung 2023", rainFile: "rain-michaung-2023.json" },
  "chennai-2015": { name: "Chennai floods 2015", label: "Chennai floods (November-December 2015)", short: "Chennai 2015", rainFile: "rain-chennai-2015.json" },
};
const MIN_MS = 60_000;
const HOUR_MS = 60 * MIN_MS;
const DAY_MS = 24 * HOUR_MS;
const START_DAYS_BEFORE_FLOOD = 2;

const istMs = (label) => Date.parse(`${label}Z`);
const istLabel = (ms) => new Date(ms).toISOString().slice(0, 16).replace("T", " ");
const readJson = (name) => JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), "utf8"));
// rainfall is rounded to 0.1 mm like the live feed, so IMD cut-offs (115.6 etc.) compare cleanly
const round1 = (x) => Math.round(x * 10) / 10;

function loadEvent(name) {
  const def = EVENTS[name];
  if (!def) throw new Error(`unknown event: ${name}`);
  const rain = readJson(def.rainFile);
  const timeline = readJson("flood-timeline.json").events[name];
  return {
    id: name,
    name: def.name,
    label: def.label,
    short: def.short,
    floodDay: timeline.floodDay,
    zones: timeline.zones,
    facts: timeline.facts,
    release: timeline.release ?? null,
    time: rain.time,
    rain: Object.fromEntries(Object.entries(rain.mmPerHour).map(([zone, series]) => [zone, series.map((x) => x ?? 0)])),
  };
}

// the replay starts at 00:00 IST two days before the flood day
function startIndexOf(event) {
  const day = new Date(istMs(`${event.floodDay}T00:00`) - START_DAYS_BEFORE_FLOOD * DAY_MS).toISOString().slice(0, 10);
  const i = event.time.indexOf(`${day}T00:00`);
  if (i < 0) throw new Error(`${event.id}: no data at ${day} 00:00`);
  return i;
}

function sumHours(series, from, to) {
  let sum = 0;
  for (let i = Math.max(0, from); i <= Math.min(series.length - 1, to); i++) sum += series[i];
  return round1(sum);
}

// speed is simulated minutes per 2-second tick; an even value keeps the 2-minute steps whole
function createReplay(event, { minutesPerTick = 30 } = {}) {
  const start = startIndexOf(event);
  const startMs = istMs(event.time[start]);
  const endMinute = (event.time.length - start) * 60;
  const releaseMinute = event.release ? (istMs(event.release.time) - startMs) / MIN_MS : null;
  let simMinute = 0;
  let released = false;

  const hourIndex = () => Math.min(start + Math.floor(simMinute / 60), event.time.length - 1);
  const past24hMm = (zoneId) => {
    const h = hourIndex();
    return sumHours(event.rain[zoneId], h - 24, h - 1);
  };
  const next24hMm = (zoneId) => {
    const h = hourIndex();
    return sumHours(event.rain[zoneId], h, h + 23);
  };

  return {
    minutesPerTick,
    get hourIndex() { return hourIndex(); },
    get done() { return simMinute >= endMinute; },
    get currentTime() { return istLabel(startMs + simMinute * MIN_MS); },
    get progress() { return Math.min(1, simMinute / endMinute); },
    advance(minutes = minutesPerTick) {
      simMinute = Math.min(endMinute, simMinute + minutes);
    },
    rainAt(zoneId) {
      return event.rain[zoneId][hourIndex()] ?? 0;
    },
    past24hMm,
    next24hMm,
    // events whose documented time has been reached since the last call; each fires once
    dueEvents() {
      if (released || releaseMinute === null || simMinute < releaseMinute) return [];
      released = true;
      const { reservoir, cusecs, time } = event.release;
      return [{ type: "release", reservoir, cusecs, time }];
    },
    // same shape as the live rainfall feed (rainfall.js), so the panels and IMD rules read it unchanged
    rainfall() {
      const h = hourIndex();
      const zones = {};
      for (const zoneId of Object.keys(event.rain)) {
        const series = event.rain[zoneId];
        const hourly = [];
        for (let i = h; i < Math.min(h + 24, series.length); i++) hourly.push({ time: event.time[i], mm: series[i], prob: null });
        const peak = hourly.reduce((best, x) => (x.mm > best.mm ? x : best), { mm: 0, time: null });
        zones[zoneId] = { currentMmPerHr: series[h], past24hMm: past24hMm(zoneId), next24hMm: next24hMm(zoneId), peakMmPerHr: peak.mm, peakAt: peak.time, hourly };
      }
      return { updatedAt: Date.now(), source: `Replay: ${event.short} (ERA5 reanalysis)`, stale: false, error: null, replay: true, zones };
    },
    status() {
      return { active: true, event: event.id, name: event.name, label: event.label, short: event.short, currentTime: istLabel(startMs + simMinute * MIN_MS), progress: Math.min(1, simMinute / endMinute), minutesPerTick };
    },
  };
}

// what the staff page needs to list an event: documented facts and its real length
function listEvents() {
  return Object.keys(EVENTS).map((id) => {
    const event = loadEvent(id);
    const start = startIndexOf(event);
    return {
      id,
      label: event.label,
      short: event.short,
      floodDay: event.floodDay,
      zones: event.zones,
      facts: event.facts,
      release: event.release,
      startTime: event.time[start],
      hours: event.time.length - start,
    };
  });
}

module.exports = { EVENTS, loadEvent, createReplay, listEvents, startIndexOf };
