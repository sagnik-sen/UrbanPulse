const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const { forecast, stepsToBreach } = require("./forecast");
const { planEvacuation, distanceKm } = require("./evacuation");

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Fixed seed locations + a bounded oscillating simulation stand in for the real IoT feed.
// Swap `tick()` for real sensor ingestion and forecast.js for the trained model when hardware/data exist.
const LOCATIONS = [
  { id: "pallikaranai", name: "Pallikaranai Marshland", lat: 12.9375, lng: 80.2119, base: 35, amplitude: 20, phase: 0, population: 185000 },
  { id: "velachery", name: "Velachery", lat: 12.9756, lng: 80.2207, base: 40, amplitude: 22, phase: 5, population: 260000 },
  { id: "omr", name: "OMR (Sholinganallur)", lat: 12.9010, lng: 80.2279, base: 30, amplitude: 18, phase: 10, population: 210000 },
  { id: "tnagar", name: "T Nagar", lat: 13.0418, lng: 80.2341, base: 25, amplitude: 15, phase: 3, population: 240000 },
  { id: "adyar", name: "Adyar", lat: 13.0012, lng: 80.2565, base: 28, amplitude: 16, phase: 8, population: 195000 },
  { id: "mylapore", name: "Mylapore", lat: 13.0339, lng: 80.2619, base: 32, amplitude: 17, phase: 14, population: 170000 },
].map((l) => ({ ...l, level: l.base, prevLevel: l.base, surge: 0, storm: 0, dangerTicks: 0 }));

const SHELTERS = [
  { id: "s1", name: "Corporation School, Velachery", zoneId: "velachery", lat: 12.9790, lng: 80.2180, capacity: 400, occupancy: 0 },
  { id: "s2", name: "Community Hall, Adyar", zoneId: "adyar", lat: 13.0067, lng: 80.2520, capacity: 300, occupancy: 0 },
  { id: "s3", name: "Govt. Hr. Sec. School, Sholinganallur", zoneId: "omr", lat: 12.9050, lng: 80.2330, capacity: 500, occupancy: 0 },
  { id: "s4", name: "Kalyana Mandapam, T Nagar", zoneId: "tnagar", lat: 13.0380, lng: 80.2290, capacity: 350, occupancy: 0 },
  { id: "s5", name: "Relief Centre, Mylapore", zoneId: "mylapore", lat: 13.0300, lng: 80.2680, capacity: 250, occupancy: 0 },
  { id: "s6", name: "Marriage Hall, Medavakkam", zoneId: "pallikaranai", lat: 12.9200, lng: 80.1920, capacity: 300, occupancy: 0 },
];

const TEAMS = ["NDRF Battalion 4", "TN SDRF Unit 2", "GCC Rapid Response", "Fire & Rescue Services", "Chennai Traffic Police"];

let thresholds = { warning: 40, danger: 70 };

function riskLevel(level) {
  if (level >= thresholds.danger) return "danger";
  if (level >= thresholds.warning) return "warning";
  return "safe";
}

// demo time scale: one 2s tick = 2 simulated minutes (1 real second = 1 simulated minute)
const SIM_MIN_PER_TICK = 2;
const FORECAST_STEPS = 60; // 2 simulated hours ahead
const FORECAST_WINDOW = 30;

function zoneForecast(loc) {
  const series = history[loc.id].slice(-(FORECAST_WINDOW - 1)).map((p) => p.level).concat(Math.round(loc.level));
  const path = forecast(series, FORECAST_STEPS);
  const steps = stepsToBreach(Math.round(loc.level), path, thresholds.danger);
  return { path, forecastHours: steps == null ? null : Math.round(((steps * SIM_MIN_PER_TICK) / 60) * 10) / 10 };
}

function nearestZone(lat, lng) {
  return LOCATIONS.reduce((best, l) => (distanceKm({ lat, lng }, l) < distanceKm({ lat, lng }, best) ? l : best));
}

const HISTORY_CAP = 200;
const history = Object.fromEntries(LOCATIONS.map((l) => [l.id, []]));
let incidents = [];
let citizenReports = [];
let broadcasts = [];
let t = 0;

function currentSnapshot() {
  return LOCATIONS.map((loc) => {
    const { path, forecastHours } = zoneForecast(loc);
    return {
      id: loc.id,
      name: loc.name,
      lat: loc.lat,
      lng: loc.lng,
      population: loc.population,
      level: Math.round(loc.level),
      risk: riskLevel(loc.level),
      forecastHours,
      forecast: path,
      ts: Date.now(),
    };
  });
}

function addBroadcast({ zoneId, severity, message, channels, source }) {
  const zone = LOCATIONS.find((l) => l.id === zoneId);
  const recipients = zone ? zone.population : LOCATIONS.reduce((s, l) => s + l.population, 0);
  const b = { id: Date.now() + Math.random(), zoneId, zoneName: zone ? zone.name : "All zones", severity, message, channels, source, recipients, ts: Date.now() };
  broadcasts.unshift(b);
  broadcasts = broadcasts.slice(0, 100);
  io.emit("broadcast", b);
  return b;
}

// incident = one continuous danger episode per zone, not one alert per tick.
// hysteresis: only clear once level drops CLEAR_MARGIN below danger, so noise near the line doesn't flap
const CLEAR_MARGIN = 10;
const OPEN_AFTER_TICKS = 2; // debounce: danger must persist ~4s before an incident (and its auto-SMS) fires
function updateIncidents(payload) {
  payload.forEach((p) => {
    const loc = LOCATIONS.find((l) => l.id === p.id);
    loc.dangerTicks = p.risk === "danger" ? loc.dangerTicks + 1 : 0;
    const open = incidents.find((i) => i.zoneId === p.id && i.status !== "cleared");
    if (p.risk === "danger") {
      if (!open && loc.dangerTicks >= OPEN_AFTER_TICKS) {
        const inc = { id: Date.now() + Math.random(), zoneId: p.id, zoneName: p.name, startTs: p.ts, endTs: null, peakLevel: p.level, currentLevel: p.level, status: "active", team: null, log: [{ ts: p.ts, text: `Danger threshold crossed at ${p.level}%` }] };
        incidents.unshift(inc);
        incidents = incidents.slice(0, 100);
        io.emit("incident-opened", inc);
        addBroadcast({ zoneId: p.id, severity: "danger", message: `FLOOD WARNING: Water levels critical in ${p.name}. Move to higher ground or the nearest relief shelter.`, channels: ["sms", "push"], source: "auto" });
      } else if (open) {
        open.currentLevel = p.level;
        if (p.level > open.peakLevel) open.peakLevel = p.level;
        io.emit("incident-updated", open);
      }
    } else if (open && p.level < thresholds.danger - CLEAR_MARGIN) {
      open.status = "cleared";
      open.endTs = p.ts;
      open.currentLevel = p.level;
      open.log.push({ ts: p.ts, text: `Level receded to ${p.level}% — incident auto-cleared` });
      io.emit("incident-updated", open);
    }
  });
}

function updateShelters() {
  SHELTERS.forEach((s) => {
    const active = incidents.some((i) => i.zoneId === s.zoneId && i.status !== "cleared");
    const delta = active ? 5 + Math.random() * 10 : -2;
    s.occupancy = Math.round(Math.max(0, Math.min(s.capacity, s.occupancy + delta)));
  });
  io.emit("shelters-update", SHELTERS);
}

function tick() {
  t += 1;
  LOCATIONS.forEach((loc) => {
    loc.prevLevel = loc.level;
    // rare rain-burst event pushes level up; decays back down over following ticks
    if (Math.random() < 0.008) loc.surge += 20 + Math.random() * 15;
    loc.surge *= 0.9;
    loc.storm *= 0.97; // injected storms linger ~1-2 min so there's time to respond in a demo
    const oscillation = loc.base + loc.amplitude * Math.sin((t + loc.phase) / 12);
    const noise = (Math.random() - 0.5) * 4;
    loc.level = Math.max(0, Math.min(100, oscillation + noise + loc.surge + loc.storm));
  });

  const payload = currentSnapshot();
  payload.forEach((p) => {
    const arr = history[p.id];
    arr.push({ ts: p.ts, level: p.level });
    if (arr.length > HISTORY_CAP) arr.shift();
  });

  io.emit("sensor-update", payload);
  updateIncidents(payload);
  updateShelters();
}

setInterval(tick, 2000);

app.get("/api/state", (req, res) => {
  res.json({ locations: currentSnapshot(), history, incidents, reports: citizenReports, broadcasts, shelters: SHELTERS, teams: TEAMS, thresholds });
});

app.put("/api/thresholds", (req, res) => {
  const { warning, danger } = req.body;
  if (typeof warning === "number" && typeof danger === "number" && warning < danger) {
    thresholds = { warning, danger };
    io.emit("thresholds-updated", thresholds);
  }
  res.json(thresholds);
});

app.post("/api/simulate/storm", (req, res) => {
  const { zoneId, intensity } = req.body;
  const amount = Math.max(5, Math.min(60, Number(intensity) || 30));
  LOCATIONS.filter((l) => zoneId === "all" || l.id === zoneId).forEach((l) => { l.storm += amount; });
  res.json({ ok: true });
});

const CATEGORIES = new Set(["waterlogging", "drain_blocked", "road_closed", "power_hazard", "rescue_needed", "other"]);
const SEVERITIES = new Set(["low", "medium", "high"]);

app.post("/api/citizen-report", (req, res) => {
  const { lat, lng, category, severity, description, reporter } = req.body;
  if (typeof lat !== "number" || typeof lng !== "number" || !description || !String(description).trim()) {
    return res.status(400).json({ error: "lat, lng and description are required" });
  }
  const zone = nearestZone(lat, lng);
  const report = {
    id: Date.now(),
    lat,
    lng,
    category: CATEGORIES.has(category) ? category : "other",
    severity: SEVERITIES.has(severity) ? severity : "medium",
    description: String(description).slice(0, 500),
    reporter: reporter ? String(reporter).slice(0, 60) : "Anonymous",
    zoneId: zone.id,
    zoneName: zone.name,
    ts: Date.now(),
    status: "open",
  };
  citizenReports.unshift(report);
  io.emit("citizen-report", report);
  res.json(report);
});

app.patch("/api/citizen-report/:id", (req, res) => {
  const report = citizenReports.find((r) => r.id === Number(req.params.id));
  if (!report) return res.status(404).json({ error: "not found" });
  if (["open", "in_progress", "resolved"].includes(req.body.status)) report.status = req.body.status;
  io.emit("report-updated", report);
  res.json(report);
});

app.patch("/api/incidents/:id", (req, res) => {
  const inc = incidents.find((i) => String(i.id) === req.params.id);
  if (!inc) return res.status(404).json({ error: "not found" });
  const { team, note } = req.body;
  if (team && TEAMS.includes(team)) {
    inc.team = team;
    if (inc.status === "active") inc.status = "responding";
    inc.log.push({ ts: Date.now(), text: `${team} dispatched` });
  }
  if (note && String(note).trim()) inc.log.push({ ts: Date.now(), text: String(note).slice(0, 200) });
  io.emit("incident-updated", inc);
  res.json(inc);
});

app.post("/api/broadcasts", (req, res) => {
  const { zoneId, severity, message, channels } = req.body;
  if (!message || !String(message).trim()) return res.status(400).json({ error: "message required" });
  const valid = ["sms", "push", "siren"].filter((c) => Array.isArray(channels) && channels.includes(c));
  if (valid.length === 0) return res.status(400).json({ error: "pick at least one channel" });
  res.json(addBroadcast({ zoneId: zoneId || "all", severity: severity || "info", message: String(message).slice(0, 300), channels: valid, source: "manual" }));
});

const OSRM_URL = "https://router.project-osrm.org/route/v1/driving";
const CHENNAI_BOUNDS = { minLat: 12.6, maxLat: 13.4, minLng: 79.9, maxLng: 80.5 };

async function fetchOsrm(points, { alternatives }) {
  const path = points.map((p) => `${p.lng.toFixed(5)},${p.lat.toFixed(5)}`).join(";");
  const res = await fetch(`${OSRM_URL}/${path}?overview=full&geometries=geojson&alternatives=${alternatives}`, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`OSRM ${res.status}`);
  const data = await res.json();
  if (data.code !== "Ok") throw new Error(`OSRM ${data.code}`);
  return data.routes.map((r) => ({
    coords: r.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
    distanceKm: r.distance / 1000,
    durationMin: r.duration / 60,
  }));
}

// public OSRM demo server is shared and rate-limited; reuse a plan while the flood picture is unchanged
const routeCache = new Map();
const ROUTE_CACHE_MS = 30000;

app.get("/api/evacuation-route", async (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  const b = CHENNAI_BOUNDS;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < b.minLat || lat > b.maxLat || lng < b.minLng || lng > b.maxLng) {
    return res.status(400).json({ error: "Location must be within the Chennai metro area" });
  }

  const zones = currentSnapshot();
  const floodKey = zones.map((z) => z.risk[0]).join("") + SHELTERS.map((s) => (s.occupancy >= s.capacity ? 1 : 0)).join("");
  const key = `${lat.toFixed(3)},${lng.toFixed(3)}|${floodKey}`;
  const cached = routeCache.get(key);
  if (cached && Date.now() - cached.at < ROUTE_CACHE_MS) return res.json(cached.plan);

  const from = { lat, lng };
  const plan = await planEvacuation({ from, shelters: SHELTERS, zones, fetchRoute: fetchOsrm });
  if (!plan) return res.status(503).json({ error: "All shelters are at capacity" });

  const originZone = zones.reduce((best, z) => (distanceKm(from, z) < distanceKm(from, best) ? z : best));
  const body = {
    from,
    originZone: { id: originZone.id, name: originZone.name, risk: originZone.risk },
    shelter: plan.shelter,
    route: {
      coords: plan.route.coords,
      distanceKm: Math.round(plan.route.distanceKm * 10) / 10,
      durationMin: Math.round(plan.route.durationMin),
      dangerKm: Math.round(plan.route.dangerKm * 10) / 10,
      warningKm: Math.round(plan.route.warningKm * 10) / 10,
    },
    avoided: plan.avoided.map((id) => zones.find((z) => z.id === id).name),
    source: plan.source,
  };
  routeCache.set(key, { at: Date.now(), plan: body });
  for (const [k, v] of routeCache) if (Date.now() - v.at > ROUTE_CACHE_MS) routeCache.delete(k);
  res.json(body);
});

const PORT = 4000;
server.listen(PORT, () => console.log(`UrbanPulse demo server on :${PORT}`));
