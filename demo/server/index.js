const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { forecast, stepsToBreach } = require("./forecast");
const { planEvacuation, distanceKm } = require("./evacuation");
const { forecastRisk, snapshotRisk } = require("./risk");
const { routeExposure } = require("./evacuation");
const { planGroups } = require("./planner");
const fs = require("node:fs");
const path = require("node:path");
const { openDb } = require("./db");
const { randomUUID } = require("node:crypto");
const { createAuth, attachUser, requireRole } = require("./auth");
const { createZones, createShelters, stepZones, injectStorm } = require("./simulator");
const { createRainfallFeed } = require("./rainfall");
const { createAnchor } = require("./anchor");

// optional server/.env holds the signing key for blockchain anchoring; the app runs without it
try { process.loadEnvFile(path.join(__dirname, ".env")); } catch {}

// served same-origin behind the Vite dev proxy, so no CORS: cross-site pages can't use the session cookie
const app = express();
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server);

// simulator.js stands in for the real IoT feed; swap stepZones() for sensor ingestion
// and forecast.js for the trained model when hardware/data exist.
const LOCATIONS = createZones();
const SHELTERS = createShelters();

const TEAMS = ["NDRF Battalion 4", "TN SDRF Unit 2", "GCC Rapid Response", "Fire & Rescue Services", "Chennai Traffic Police"];

const db = openDb();
const auth = createAuth(db.raw);
app.use(attachUser(auth));

const STAFF = ["admin", "officer", "viewer"];
const RESPONDERS = ["admin", "officer"];
const STAFF_ROOM = "staff";

// staff sockets join a room; incident and report events (reporter names, dispatch) only go there
const ADMIN_ROOM = "admins";
io.on("connection", (socket) => {
  const user = auth.userFromCookieHeader(socket.handshake.headers.cookie);
  if (user) socket.join(STAFF_ROOM);
  if (user?.role === "admin") socket.join(ADMIN_ROOM);
});
const toStaff = (event, payload) => io.to(STAFF_ROOM).emit(event, payload);

// who did what, when; admins see it live on the Audit Log page
function audit(user, action, details = {}) {
  const entry = { id: randomUUID(), ts: Date.now(), username: user?.username ?? null, role: user?.role ?? null, action, details };
  db.logAudit(entry);
  io.to(ADMIN_ROOM).emit("audit-entry", entry);
}
// Audit entries are anchored to Shardeum in batches (anchor.js). Every 5 minutes keeps testnet
// gas low; admins can anchor immediately from the Audit Log page.
const ANCHOR_INTERVAL_MS = 5 * 60_000;
const deployment = (() => { try { return require("./chain/deployment.json"); } catch { return null; } })();
const chain = createAnchor({
  db,
  rpc: process.env.SHARDEUM_RPC || deployment?.rpc,
  privateKey: process.env.SHARDEUM_PRIVATE_KEY,
  deployment,
  // deliberately not audited: an audit entry per anchor would itself need anchoring, forever
  onAnchored: (b) => io.to(ADMIN_ROOM).emit("audit-anchored", { batchId: b.id, txHash: b.txHash, ids: b.ids }),
});
if (chain.canWrite) {
  setInterval(() => chain.anchorNow().catch((err) => console.error("anchoring failed:", err.shortMessage || err.message)), ANCHOR_INTERVAL_MS);
}
console.log(chain.enabled ? `audit anchoring: contract ${chain.address}${chain.canWrite ? "" : " (verify only, no signing key)"}` : "audit anchoring: off (no contract configured)");

const DEFAULT_THRESHOLDS = { warning: 40, danger: 70 };
let thresholds = db.getSetting("thresholds", DEFAULT_THRESHOLDS);

// Live rainfall (Open-Meteo). With the link on, each zone's current rain rate adds water every
// tick; with storm decay of 3%/tick that settles ~5 level points above normal per mm/h,
// so light rain (2 mm/h) nudges levels and heavy rain (10+ mm/h) floods.
const RAIN_LEVEL_PER_MM = 0.15;
const RAIN_REFRESH_MS = 10 * 60 * 1000;
let rainLink = db.getSetting("rainLink", true);

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
const INCIDENTS_CAP = 100;
const REPORTS_CAP = 500;
const BROADCASTS_CAP = 100;
let incidents = db.load("incidents", INCIDENTS_CAP);
let citizenReports = db.load("reports", REPORTS_CAP);
let broadcasts = db.load("broadcasts", BROADCASTS_CAP);

const saveIncident = (inc) => db.save("incidents", inc, inc.startTs);
const saveReport = (r) => db.save("reports", r, r.ts);
const saveBroadcast = (b) => db.save("broadcasts", b, b.ts);
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

const MESSAGE_MAX = 300;
function addBroadcast({ zoneId, severity, message, channels, source }) {
  const zone = LOCATIONS.find((l) => l.id === zoneId);
  const recipients = zone ? zone.population : LOCATIONS.reduce((s, l) => s + l.population, 0);
  const id = randomUUID();
  const code = `UP-${id.slice(0, 8).toUpperCase()}`;
  // the code travels inside the text itself, so a forwarded copy still carries it
  const suffix = ` Verify: ${code}`;
  message = message.slice(0, MESSAGE_MAX - suffix.length) + suffix;
  const b = { id, code, zoneId, zoneName: zone ? zone.name : "All zones", severity, message, channels, source, recipients, ts: Date.now() };
  broadcasts.unshift(b);
  broadcasts = broadcasts.slice(0, BROADCASTS_CAP);
  saveBroadcast(b);
  io.emit("broadcast", b);
  // public record with no staff identity, so its blockchain proof can be handed to anyone
  audit(null, "alert_published", { code, zoneId, zone: b.zoneName, severity, message, channels, source });
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
        const inc = { id: randomUUID(), zoneId: p.id, zoneName: p.name, startTs: p.ts, endTs: null, peakLevel: p.level, currentLevel: p.level, status: "active", team: null, log: [{ ts: p.ts, text: `Danger threshold crossed at ${p.level}%` }] };
        incidents.unshift(inc);
        incidents = incidents.slice(0, INCIDENTS_CAP);
        saveIncident(inc);
        toStaff("incident-opened", inc);
        addBroadcast({ zoneId: p.id, severity: "danger", message: `FLOOD WARNING: Water levels critical in ${p.name}. Move to higher ground or the nearest relief shelter.`, channels: ["sms", "push"], source: "auto" });
      } else if (open) {
        open.currentLevel = p.level;
        if (p.level > open.peakLevel) open.peakLevel = p.level;
        saveIncident(open);
        toStaff("incident-updated", open);
      }
    } else if (open && p.level < thresholds.danger - CLEAR_MARGIN) {
      open.status = "cleared";
      open.endTs = p.ts;
      open.currentLevel = p.level;
      open.log.push({ ts: p.ts, text: `Level receded to ${p.level}% — incident auto-cleared` });
      saveIncident(open);
      toStaff("incident-updated", open);
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
  const rain = rainfall.get();
  if (rainLink && !rain.stale) {
    for (const z of LOCATIONS) z.storm += (rain.zones[z.id]?.currentMmPerHr || 0) * RAIN_LEVEL_PER_MM;
  }
  stepZones(LOCATIONS, t, Math.random);

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

const rainfall = createRainfallFeed(LOCATIONS);
async function refreshRainfall() {
  const state = await rainfall.refresh();
  if (state.error) console.warn(`rainfall refresh failed: ${state.error}`);
  io.emit("rainfall-update", state);
}
refreshRainfall();
setInterval(refreshRainfall, RAIN_REFRESH_MS);

app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body || {};
  const result = auth.login(username, password);
  if (result.error) {
    audit(null, result.status === 429 ? "login_locked" : "login_failed", { username: String(username ?? "").slice(0, 40), ip: req.ip });
    return res.status(result.status).json({ error: result.error });
  }
  audit(result.user, "login", { ip: req.ip });
  res.setHeader("Set-Cookie", auth.sessionCookie(result.token));
  res.json(result.user);
});

app.post("/api/auth/logout", (req, res) => {
  if (req.user) audit(req.user, "logout");
  auth.logout(req.headers.cookie);
  res.setHeader("Set-Cookie", auth.clearedCookie());
  res.json({ ok: true });
});

app.get("/api/auth/me", (req, res) => {
  if (!req.user) return res.status(401).json({ error: "Not signed in" });
  res.json(req.user);
});

// citizen app: live levels, shelters, public alerts; nothing with reporter names or dispatch details
app.get("/api/public-state", (req, res) => {
  res.json({ locations: currentSnapshot(), broadcasts, shelters: SHELTERS, thresholds, rainfall: rainfall.get(), rainLink });
});

app.get("/api/state", requireRole(...STAFF), (req, res) => {
  res.json({ locations: currentSnapshot(), history, incidents, reports: citizenReports, broadcasts, shelters: SHELTERS, teams: TEAMS, thresholds, rainfall: rainfall.get(), rainLink });
});

app.put("/api/thresholds", requireRole("admin"), (req, res) => {
  const { warning, danger } = req.body;
  if (typeof warning === "number" && typeof danger === "number" && warning < danger) {
    if (warning !== thresholds.warning || danger !== thresholds.danger) audit(req.user, "thresholds_changed", { from: thresholds, to: { warning, danger } });
    thresholds = { warning, danger };
    db.setSetting("thresholds", thresholds);
    io.emit("thresholds-updated", thresholds);
  }
  res.json(thresholds);
});

app.put("/api/settings/rain-link", requireRole("admin"), (req, res) => {
  if (typeof req.body?.enabled !== "boolean") return res.status(400).json({ error: "enabled must be true or false" });
  rainLink = req.body.enabled;
  db.setSetting("rainLink", rainLink);
  audit(req.user, "rain_link", { enabled: rainLink });
  io.emit("rain-link-updated", { rainLink });
  res.json({ rainLink });
});

app.post("/api/simulate/storm", requireRole("admin"), (req, res) => {
  const { zoneId, intensity } = req.body;
  const amount = Math.max(5, Math.min(60, Number(intensity) || 30));
  injectStorm(LOCATIONS, zoneId, amount);
  audit(req.user, "storm_simulated", { zoneId, intensity: amount });
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
    id: randomUUID(),
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
  citizenReports = citizenReports.slice(0, REPORTS_CAP);
  saveReport(report);
  toStaff("citizen-report", report);
  res.json(report);
});

app.patch("/api/citizen-report/:id", requireRole(...RESPONDERS), (req, res) => {
  const report = citizenReports.find((r) => r.id === req.params.id);
  if (!report) return res.status(404).json({ error: "not found" });
  if (["open", "in_progress", "resolved"].includes(req.body.status) && req.body.status !== report.status) {
    audit(req.user, "report_status", { reportId: report.id, zone: report.zoneName, from: report.status, to: req.body.status });
    report.status = req.body.status;
  }
  saveReport(report);
  toStaff("report-updated", report);
  res.json(report);
});

app.patch("/api/incidents/:id", requireRole(...RESPONDERS), (req, res) => {
  const inc = incidents.find((i) => i.id === req.params.id);
  if (!inc) return res.status(404).json({ error: "not found" });
  const { team, note } = req.body;
  if (team && TEAMS.includes(team)) {
    inc.team = team;
    if (inc.status === "active") inc.status = "responding";
    inc.log.push({ ts: Date.now(), text: `${team} dispatched by ${req.user.name}` });
    audit(req.user, "team_dispatched", { incidentId: inc.id, zone: inc.zoneName, team });
  }
  if (note && String(note).trim()) {
    inc.log.push({ ts: Date.now(), text: `${req.user.name}: ${String(note).slice(0, 200)}` });
    audit(req.user, "incident_note", { incidentId: inc.id, zone: inc.zoneName, note: String(note).slice(0, 200) });
  }
  saveIncident(inc);
  toStaff("incident-updated", inc);
  res.json(inc);
});

app.post("/api/broadcasts", requireRole("admin"), (req, res) => {
  const { zoneId, severity, message, channels } = req.body;
  if (!message || !String(message).trim()) return res.status(400).json({ error: "message required" });
  const valid = ["sms", "push", "siren"].filter((c) => Array.isArray(channels) && channels.includes(c));
  if (valid.length === 0) return res.status(400).json({ error: "pick at least one channel" });
  const b = addBroadcast({ zoneId: zoneId || "all", severity: severity || "info", message: String(message).slice(0, 300), channels: valid, source: "manual" });
  audit(req.user, "broadcast_sent", { zone: b.zoneName, severity: b.severity, channels: b.channels, recipients: b.recipients, message: b.message });
  res.json(b);
});

// wipes reports, incidents and broadcasts (they persist across restarts now, so test runs pile up)
app.post("/api/admin/clear-data", requireRole("admin"), (req, res) => {
  db.clearRecords();
  incidents = [];
  citizenReports = [];
  broadcasts = [];
  thresholds = { ...DEFAULT_THRESHOLDS };
  db.setSetting("thresholds", thresholds);
  io.emit("data-cleared", { thresholds });
  audit(req.user, "demo_data_cleared");
  res.json({ ok: true });
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

// Seats held for people already travelling to a shelter, so parallel requests spread out
// instead of all being sent to the same "free" shelter. Held for the drive plus a margin.
const HOUSEHOLD_SIZE = 4;
const HOLD_MARGIN_MS = 60 * 1000;
let reservations = [];
function reservedByShelter() {
  const now = Date.now();
  reservations = reservations.filter((r) => r.expiresAt > now);
  const out = {};
  for (const r of reservations) out[r.shelterId] = (out[r.shelterId] || 0) + r.people;
  return out;
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
  const risk = forecastRisk(zones, thresholds.danger, SIM_MIN_PER_TICK);
  const reserved = reservedByShelter();
  const plan = await planEvacuation({ from, shelters: SHELTERS, zones, risk, fetchRoute: fetchOsrm, reserved });
  if (!plan) return res.status(503).json({ error: "All shelters are at capacity" });
  // one real second = one simulated minute, so a D-minute drive holds seats for D seconds (+ margin)
  reservations.push({ shelterId: plan.shelter.id, people: HOUSEHOLD_SIZE, expiresAt: Date.now() + plan.route.durationMin * 1000 + HOLD_MARGIN_MS });

  const originZone = zones.reduce((best, z) => (distanceKm(from, z) < distanceKm(from, best) ? z : best));
  const body = {
    from,
    originZone: { id: originZone.id, name: originZone.name, risk: originZone.risk },
    shelter: plan.shelter,
    route: {
      coords: plan.route.coords,
      distanceKm: Math.round(plan.route.distanceKm * 10) / 10,
      durationMin: Math.round(plan.route.durationMin),
      // expected km of road that will be flooded at the moment the evacuee passes it
      expectedFloodKm: Math.round(plan.route.expectedFloodKm * 10) / 10,
    },
    avoided: plan.avoided.map((id) => zones.find((z) => z.id === id).name),
    source: plan.source,
  };
  routeCache.set(key, { at: Date.now(), plan: body });
  for (const [k, v] of routeCache) if (Date.now() - v.at > ROUTE_CACHE_MS) routeCache.delete(k);
  res.json(body);
});

// ---- Group evacuation planner -------------------------------------------------
// Uses the precomputed road-route set (3 start points per zone to every shelter), so planning
// a whole zone costs no live routing calls. Proposed = forecast-aware costs + optimal assignment;
// conventional = current-conditions costs + one-group-at-a-time (greedy) assignment.
const ROUTE_SET = JSON.parse(fs.readFileSync(path.join(__dirname, "experiments", "routes.json"), "utf8"));
const EVAC_ORDER_HOLD_MS = 10 * 60 * 1000;
const SUGGEST_WITHIN_HOURS = 0.5;

function suggestedZones(zones) {
  return zones
    .filter((z) => z.risk === "danger" || (z.forecastHours != null && z.forecastHours <= SUGGEST_WITHIN_HOURS))
    .map((z) => z.id);
}

function parsePlanRequest(body, zones) {
  const known = new Set(zones.map((z) => z.id));
  const requested = Array.isArray(body?.zoneIds) ? body.zoneIds.filter((id) => known.has(id)) : [];
  const zoneIds = requested.length ? [...new Set(requested)] : suggestedZones(zones);
  const people = Math.round(Number(body?.peoplePerZone));
  const peoplePerZone = Number.isFinite(people) ? Math.max(50, Math.min(2000, people)) : 300;
  return { zoneIds, peoplePerZone };
}

function summarizePlan(result, zones, groups, evalRisk) {
  const total = groups.reduce((s, g) => s + g.people, 0);
  const assigned = total - result.unassigned;
  let travel = 0;
  let worst = 0;
  let floodKm = 0;
  let atRiskShelter = 0;
  const loads = {};
  const assignments = result.assignments.map((a) => {
    const expectedFloodKm = routeExposure(a.route, evalRisk).expectedFloodKm;
    const shelterAtRisk = evalRisk.at(a.shelter, a.route.durationMin).p >= 0.5;
    travel += a.route.durationMin * a.people;
    worst = Math.max(worst, a.route.durationMin);
    floodKm += expectedFloodKm * a.people;
    if (shelterAtRisk) atRiskShelter += a.people;
    loads[a.shelter.id] = (loads[a.shelter.id] || 0) + a.people;
    const zone = zones.find((z) => z.id === a.group.origin.zoneId);
    return {
      zoneId: zone.id,
      zoneName: zone.name,
      originId: a.group.origin.id,
      from: { lat: a.group.origin.lat, lng: a.group.origin.lng },
      shelterId: a.shelter.id,
      shelterName: a.shelter.name,
      people: a.people,
      durationMin: Math.round(a.route.durationMin * 10) / 10,
      distanceKm: Math.round(a.route.distanceKm * 10) / 10,
      expectedFloodKm: Math.round(expectedFloodKm * 100) / 100,
      shelterAtRisk,
      coords: a.route.coords,
    };
  });
  return {
    metrics: {
      evacuees: total,
      assigned,
      unassigned: result.unassigned,
      meanTravelMin: assigned ? Math.round((travel / assigned) * 10) / 10 : 0,
      worstTravelMin: Math.round(worst * 10) / 10,
      floodKmPerEvacuee: total ? Math.round((floodKm / total) * 1000) / 1000 : 0,
      pctToAtRiskShelter: total ? Math.round((1000 * atRiskShelter) / total) / 10 : 0,
    },
    shelterLoads: SHELTERS.filter((s) => loads[s.id]).map((s) => ({ id: s.id, name: s.name, arriving: loads[s.id] })),
    assignments,
  };
}

function buildEvacuationPlans({ zoneIds, peoplePerZone }) {
  const zones = currentSnapshot();
  const reserved = reservedByShelter();
  const groups = [];
  for (const zoneId of zoneIds) {
    const origins = ROUTE_SET.origins.filter((o) => o.zoneId === zoneId);
    origins.forEach((o, i) => groups.push({ origin: o, people: Math.floor(peoplePerZone / origins.length) + (i < peoplePerZone % origins.length ? 1 : 0) }));
  }
  const candidatesFor = (o, sh) => ROUTE_SET.routes[`${o}|${sh}`];
  const fc = forecastRisk(zones, thresholds.danger, SIM_MIN_PER_TICK);
  const common = { groups, shelters: SHELTERS, candidatesFor, reserved };
  const proposed = planGroups({ ...common, risk: fc, method: "optimal" });
  const conventional = planGroups({ ...common, risk: snapshotRisk(zones), method: "greedy", order: groups.map((_, i) => i) });

  return {
    generatedAt: Date.now(),
    zoneIds,
    peoplePerZone,
    suggestedZoneIds: suggestedZones(zones),
    freeBeds: SHELTERS.map((s) => ({ id: s.id, name: s.name, free: Math.max(0, s.capacity - s.occupancy - (reserved[s.id] || 0)), capacity: s.capacity })),
    // both plans are judged by the same live forecast, so the comparison is like-for-like
    proposed: summarizePlan(proposed, zones, groups, fc),
    conventional: summarizePlan(conventional, zones, groups, fc),
  };
}

app.post("/api/evacuation-plan", requireRole(...STAFF), (req, res) => {
  const request = parsePlanRequest(req.body, currentSnapshot());
  res.json(buildEvacuationPlans(request));
});

app.post("/api/evacuation-plan/execute", requireRole(...RESPONDERS), (req, res) => {
  const request = parsePlanRequest(req.body, currentSnapshot());
  if (request.zoneIds.length === 0) return res.status(400).json({ error: "No zones to evacuate" });
  const plan = buildEvacuationPlans(request).proposed;
  if (plan.assignments.length === 0) return res.status(409).json({ error: "No shelter capacity available" });

  const expiresAt = Date.now() + EVAC_ORDER_HOLD_MS;
  for (const load of plan.shelterLoads) reservations.push({ shelterId: load.id, people: load.arriving, expiresAt });

  for (const zoneId of request.zoneIds) {
    const rows = plan.assignments.filter((a) => a.zoneId === zoneId);
    if (rows.length === 0) continue;
    const byShelter = {};
    for (const r of rows) byShelter[r.shelterName] = (byShelter[r.shelterName] || 0) + r.people;
    const zoneName = rows[0].zoneName;
    const targets = Object.keys(byShelter).join(" or ");
    addBroadcast({
      zoneId,
      severity: "danger",
      message: `EVACUATION ORDER for ${zoneName}: proceed now to ${targets}. Follow the route in the UrbanPulse app and avoid flooded roads.`.slice(0, 300),
      channels: ["sms", "push", "siren"],
      source: "manual",
    });
    const inc = incidents.find((i) => i.zoneId === zoneId && i.status !== "cleared");
    if (inc) {
      const summary = Object.entries(byShelter).map(([name, n]) => `${n} → ${name}`).join(", ");
      inc.log.push({ ts: Date.now(), text: `Evacuation order issued by ${req.user.name}: ${summary}` });
      saveIncident(inc);
      toStaff("incident-updated", inc);
    }
  }

  const unassigned = plan.metrics.unassigned;
  audit(req.user, "evacuation_order", {
    zones: request.zoneIds,
    peoplePerZone: request.peoplePerZone,
    heldSeats: plan.metrics.assigned,
    unassigned,
    shelters: plan.shelterLoads.map((l) => `${l.arriving} → ${l.name}`),
  });
  res.json({ ok: true, heldSeats: plan.metrics.assigned, unassigned, zones: request.zoneIds.length });
});

const AUDIT_ACTIONS = new Set(["login", "login_failed", "login_locked", "logout", "thresholds_changed", "storm_simulated", "report_status", "team_dispatched", "incident_note", "broadcast_sent", "evacuation_order", "demo_data_cleared", "rain_link", "alert_published"]);

app.get("/api/audit", requireRole("admin"), (req, res) => {
  const action = AUDIT_ACTIONS.has(req.query.action) ? req.query.action : undefined;
  const limit = Math.max(1, Math.min(1000, Number(req.query.limit) || 500));
  res.json(db.listAudit({ action, limit }));
});

app.get("/api/audit/chain", requireRole("admin"), (req, res) => {
  res.json({ enabled: chain.enabled, canWrite: chain.canWrite, contract: chain.address ?? null, chainId: chain.chainId ?? null, network: deployment?.network ?? null, explorer: deployment?.explorer ?? null });
});

// Public: is this forwarded flood alert real? Answers from the anchored audit record, not the
// broadcasts table, so it reflects exactly what was sealed (and survives clearing demo data).
const ALERT_CODE = /^UP-[0-9A-F]{8}$/;
app.get("/api/alerts/verify/:code", async (req, res) => {
  const code = String(req.params.code).trim().toUpperCase();
  if (!ALERT_CODE.test(code)) return res.status(400).json({ error: "Alert codes look like UP-1A2B3C4D" });
  const row = db.findAlert(code);
  if (!row) return res.status(404).json({ found: false });
  const d = JSON.parse(row.details);
  const out = {
    found: true,
    alert: { code, zone: d.zone, severity: d.severity, message: d.message, source: d.source, issuedAt: row.ts },
    explorer: deployment?.explorer ?? null,
    txHash: row.tx_hash ?? null,
  };
  if (!chain.enabled) return res.json({ ...out, status: "unavailable" });
  if (row.batch_id == null) return res.json({ ...out, status: "pending" });
  try {
    res.json({ ...out, ...(await chain.verifyEntry(row.id, row.batch_id)) });
  } catch {
    res.json({ ...out, status: "unreachable" });
  }
});

const chainError = (res, err) => res.status(502).json({ error: `Blockchain unreachable: ${err.shortMessage || err.message}` });

app.post("/api/audit/anchor", requireRole("admin"), async (req, res) => {
  if (!chain.canWrite) return res.status(503).json({ error: "Anchoring is not configured on this server" });
  try {
    const batch = await chain.anchorNow();
    res.json(batch ? { anchored: batch.count, batchId: batch.id, txHash: batch.txHash } : { anchored: 0 });
  } catch (err) {
    chainError(res, err);
  }
});

app.get("/api/audit/verify", requireRole("admin"), async (req, res) => {
  if (!chain.enabled) return res.status(503).json({ error: "No blockchain contract configured" });
  try {
    res.json(await chain.verify());
  } catch (err) {
    chainError(res, err);
  }
});

const PORT = 4000;
server.listen(PORT, () => console.log(`UrbanPulse demo server on :${PORT}`));
