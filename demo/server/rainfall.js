// Live rainfall for each zone from Open-Meteo (free, no API key). One request covers all zones.
// https://open-meteo.com/en/docs
const { heavyRainRisk, HISTORY } = require("./heavyrain");

const API = "https://api.open-meteo.com/v1/forecast";
const TIMEZONE = "Asia/Kolkata";
const HOURS_AHEAD = 24;

function buildUrl(zones) {
  const q = new URLSearchParams({
    latitude: zones.map((z) => z.lat.toFixed(4)).join(","),
    longitude: zones.map((z) => z.lng.toFixed(4)).join(","),
    current: "precipitation",
    // the other variables and three past days feed the heavy-rain model (heavyrain.js)
    hourly: "precipitation,precipitation_probability,pressure_msl,relative_humidity_2m,cloud_cover,wind_speed_10m,wind_direction_10m",
    timezone: TIMEZONE,
    forecast_days: "2",
    past_days: String(Math.ceil(HISTORY / 24)),
  });
  return `${API}?${q}`;
}

// Open-Meteo returns an array for several coordinates, a single object for one.
// Output per zone: current rate, the next 24 hourly values, their total and peak, and the 24 h before now.
function parseRainfall(zones, body) {
  const list = Array.isArray(body) ? body : [body];
  if (list.length !== zones.length) throw new Error(`expected ${zones.length} locations, got ${list.length}`);
  const out = {};
  zones.forEach((z, i) => {
    const d = list[i];
    const times = d.hourly?.time ?? [];
    const mm = d.hourly?.precipitation ?? [];
    const prob = d.hourly?.precipitation_probability ?? [];
    // next hours start at the hour containing "now" (current.time is local time in the requested zone)
    const nowHour = String(d.current?.time ?? times[0] ?? "").slice(0, 13);
    let start = times.findIndex((t) => t.slice(0, 13) === nowHour);
    if (start < 0) start = 0;
    const hourly = times.slice(start, start + HOURS_AHEAD).map((t, k) => ({
      time: t,
      mm: Number(mm[start + k]) || 0,
      prob: prob[start + k] == null ? null : Number(prob[start + k]),
    }));
    const peak = hourly.reduce((best, h) => (h.mm > best.mm ? h : best), { mm: 0, time: null });
    const past = mm.slice(Math.max(0, start - 24), start);
    out[z.id] = {
      currentMmPerHr: Number(d.current?.precipitation) || 0,
      past24hMm: Math.round(past.reduce((s, v) => s + (Number(v) || 0), 0) * 10) / 10,
      next24hMm: Math.round(hourly.reduce((s, h) => s + h.mm, 0) * 10) / 10,
      peakMmPerHr: peak.mm,
      peakAt: peak.time,
      hourly,
      // the hour labelled "now" holds the rain of the hour just ended, so it is the last completed hour
      heavyRainRisk: d.hourly ? heavyRainRisk(d.hourly, start) : null,
    };
  });
  return out;
}

// IMD-style intensity bands for hourly rain (mm/h), used for plain-language labels
function intensityLabel(mmPerHr) {
  if (mmPerHr <= 0) return "No rain";
  if (mmPerHr < 2.5) return "Light rain";
  if (mmPerHr < 7.6) return "Moderate rain";
  if (mmPerHr < 35) return "Heavy rain";
  return "Very heavy rain";
}

// keeps the last good reading; a failed refresh marks it stale instead of wiping it
function createRainfallFeed(zones, { fetchImpl = fetch, now = Date.now } = {}) {
  let state = { updatedAt: null, source: "Open-Meteo", stale: true, error: "not fetched yet", zones: {} };
  return {
    get: () => state,
    async refresh() {
      try {
        const res = await fetchImpl(buildUrl(zones), { signal: AbortSignal.timeout(20000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        state = { updatedAt: now(), source: "Open-Meteo", stale: false, error: null, zones: parseRainfall(zones, await res.json()) };
      } catch (err) {
        // Node reports network failures as "fetch failed"; the cause says why (DNS, refused, timeout)
        const cause = err.cause?.code || err.cause?.message;
        state = { ...state, stale: true, error: cause ? `${err.message} (${cause})` : err.message };
      }
      return state;
    },
  };
}

module.exports = { buildUrl, parseRainfall, intensityLabel, createRainfallFeed };
