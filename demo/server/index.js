const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { forecast, stepsToBreach } = require("./forecast");
const { planEvacuation, distanceKm } = require("./evacuation");
const { forecastRisk, snapshotRisk } = require("./risk");
const { routeExposure } = require("./evacuation");
const { planGroups, planWithPriority } = require("./planner");
const { validate: validateVulnerable, summarize: summarizeVulnerable } = require("./vulnerable");
const fs = require("node:fs");
const path = require("node:path");
const { openDb } = require("./db");
const { randomUUID } = require("node:crypto");
const { createAuth, attachUser, requireRole } = require("./auth");
const { createZones, createShelters, stepZones, injectStorm } = require("./simulator");
const { createRainfallFeed } = require("./rainfall");
const { imdAlerts, withCategories } = require("./imd");
const { createAnchor } = require("./anchor");
const { buildTimelines, summarize } = require("./accountability");
const { fusedZones } = require("./fusion-live");
const { RESERVOIRS, releaseImpact } = require("./reservoirs");
const { matchOptimal, matchGreedy, validateRequest, validateBoat, validateBoatPatch, publicRequest, requestStatus, demoBoats, MATCH_METHODS } = require("./rescue");
const { EVENTS, loadEvent, createReplay, listEvents } = require("./timemachine");
const { rateLimit } = require("./ratelimit");
const { occupied, checkIn, checkOut, tokenMatches, newToken } = require("./checkin");
const relief = require("./relief");

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

// abuse limits for public routes, per client IP (see ratelimit.js for the dev-proxy caveat)
const loginLimit = rateLimit({ windowMs: 10 * 60_000, max: 20, name: "login" });
const citizenReportLimit = rateLimit({ windowMs: 10 * 60_000, max: 10, name: "citizen-report" });
const rescueRequestLimit = rateLimit({ windowMs: 10 * 60_000, max: 5, name: "rescue-request" });
const rescueCancelLimit = rateLimit({ windowMs: 10 * 60_000, max: 20, name: "rescue-cancel" });
const rescueStatusLimit = rateLimit({ windowMs: 60_000, max: 120, name: "rescue-status" });
// one limiter shared by registering and cancelling, so a flood of either counts against the same budget
const vulnerableLimit = rateLimit({ windowMs: 60 * 60_000, max: 10, name: "vulnerable" });
const smsLimit = rateLimit({ windowMs: 60_000, max: 30, name: "sms" });
const alertVerifyLimit = rateLimit({ windowMs: 60_000, max: 60, name: "alert-verify" });
const evacuationRouteLimit = rateLimit({ windowMs: 60_000, max: 30, name: "evacuation-route" });
const checkinLimit = rateLimit({ windowMs: 10 * 60_000, max: 30, name: "shelter-checkin" });

const STAFF_ROOM = "staff";

// staff sockets join a room; incident and report events (reporter names, dispatch) only go there
const ADMIN_ROOM = "admins";
const RESPONDER_ROOM = "responders";
io.on("connection", (socket) => {
  const user = auth.userFromCookieHeader(socket.handshake.headers.cookie);
  if (user) socket.join(STAFF_ROOM);
  if (user?.role === "admin") socket.join(ADMIN_ROOM);
  if (RESPONDERS.includes(user?.role)) socket.join(RESPONDER_ROOM);
});
const toStaff = (event, payload) => io.to(STAFF_ROOM).emit(event, payload);
// rescue requests carry the requester's phone number, which only responders get
const toStaffRescue = (event, r) => {
  io.to(RESPONDER_ROOM).emit(event, r);
  const { contact, ...withoutContact } = r;
  io.to(STAFF_ROOM).except(RESPONDER_ROOM).emit(event, withoutContact);
};

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
// reservoir releases are sealed by the Water Resources Department's own key; without that key GCC
// keeps anchoring them too, so they are not left pending forever
const WRD_ACTIONS = ["reservoir_release"];
const chain = createAnchor({
  db,
  rpc: process.env.SHARDEUM_RPC || deployment?.rpc,
  deployment,
  signers: [
    { key: "gcc", privateKey: process.env.SHARDEUM_PRIVATE_KEY, actions: process.env.SHARDEUM_WRD_PRIVATE_KEY ? { except: WRD_ACTIONS } : undefined },
    { key: "wrd", privateKey: process.env.SHARDEUM_WRD_PRIVATE_KEY, actions: { only: WRD_ACTIONS } },
  ],
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
const RESCUES_CAP = 500;
const BOATS_CAP = 100;
let incidents = db.load("incidents", INCIDENTS_CAP);
let citizenReports = db.load("reports", REPORTS_CAP);
let broadcasts = db.load("broadcasts", BROADCASTS_CAP);
let rescues = db.load("rescues", RESCUES_CAP);
let boats = db.load("boats", BOATS_CAP);

const saveIncident = (inc) => db.save("incidents", inc, inc.startTs);
const saveReport = (r) => db.save("reports", r, r.ts);
const saveBroadcast = (b) => db.save("broadcasts", b, b.ts);
const saveRescue = (r) => db.save("rescues", r, r.ts);
const saveBoat = (b) => db.save("boats", b, b.ts);
// demo fleet when no boats are registered: on first start, and again after clearing demo data
function seedDemoBoats() {
  if (boats.length > 0) return;
  boats = demoBoats(Date.now());
  boats.forEach(saveBoat);
}
seedDemoBoats();
let t = 0;

// zones whose water-level sensor an admin has taken offline; their level is ignored by fusion
const offlineSensors = new Set(db.getSetting("offlineSensors", []));

// flood relief ledger (relief.js). The pepper keys card numbers: a real deployment keeps it in a secrets
// manager, never next to the data, since the pepper plus this table would let card numbers be brute-forced.
// The state is one settings row rewritten on each change: fine for a demo, not for a city-wide scheme.
const reliefPepper = process.env.RELIEF_PEPPER || db.getSetting("reliefPepper", null) || (() => { const p = relief.newPepper(); db.setSetting("reliefPepper", p); return p; })();
const reliefState = db.getSetting("reliefState", relief.emptyState());
const saveRelief = () => db.setSetting("reliefState", reliefState);

function currentSnapshot() {
  const now = Date.now();
  const fused = fusedZones({ zones: LOCATIONS.map((l) => ({ id: l.id, level: Math.round(l.level) })), reports: citizenReports, offline: offlineSensors, now });
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
      fused: fused[loc.id],
      ts: now,
    };
  });
}

const MESSAGE_MAX = 300;
function addBroadcast({ zoneId, severity, message, channels, source, reason }) {
  // alerts issued during a replay are labelled and marked, so a simulated alert cannot pass for a live one
  const replayed = replay !== null;
  if (replayed) {
    message = replayTag() + message;
    source = "replay";
  }
  const zone = LOCATIONS.find((l) => l.id === zoneId);
  const recipients = zone ? zone.population : LOCATIONS.reduce((s, l) => s + l.population, 0);
  const id = randomUUID();
  const code = `UP-${id.slice(0, 8).toUpperCase()}`;
  // the code travels inside the text itself, so a forwarded copy still carries it
  const suffix = ` Verify: ${code}`;
  message = message.slice(0, MESSAGE_MAX - suffix.length) + suffix;
  const b = { id, code, zoneId, zoneName: zone ? zone.name : "All zones", severity, message, channels, source, reason, recipients, ts: Date.now() };
  broadcasts.unshift(b);
  broadcasts = broadcasts.slice(0, BROADCASTS_CAP);
  saveBroadcast(b);
  io.emit("broadcast", b);
  // public record with no staff identity, so its blockchain proof can be handed to anyone
  audit(null, "alert_published", { code, zoneId, zone: b.zoneName, severity, message, channels, source, reason, ...(replayed ? { replay: true } : {}) });
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
        audit(null, "incident_opened", { incidentId: inc.id, zoneId: p.id, zone: p.name, level: p.level });
        const reason = { rule: "level", zone: p.name, level: p.level, danger: thresholds.danger };
        if (p.forecastHours != null) reason.forecastHours = p.forecastHours;
        const rain24hMm = rainfall.get().zones[p.id]?.past24hMm;
        if (rain24hMm != null) reason.rain24hMm = rain24hMm;
        addBroadcast({ zoneId: p.id, severity: "danger", message: `FLOOD WARNING: Water levels critical in ${p.name}. Move to higher ground or the nearest relief shelter.`, channels: ["sms", "push"], source: "auto", reason });
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
      audit(null, "incident_cleared", { incidentId: open.id, zoneId: open.zoneId, zone: open.zoneName, level: p.level, how: "auto" });
    }
  });
}

function updateShelters() {
  SHELTERS.forEach((s) => {
    if (shelterMode === "checkins") return (s.occupancy = occupied(checkins, s.id));
    const active = incidents.some((i) => i.zoneId === s.zoneId && i.status !== "cleared");
    const delta = active ? 5 + Math.random() * 10 : -2;
    s.occupancy = Math.round(Math.max(0, Math.min(s.capacity, s.occupancy + delta)));
  });
  io.emit("shelters-update", SHELTERS);
}

// ---- Flood time machine (timemachine.js) ----------------------------------------
// While a replay runs, the live rainfall feed is ignored and each 2-minute step applies the
// replayed hour's rain with the same storm rule as live. The replay is a real run of the system.
let replay = null; // the running replay, or null when the system follows live rainfall
let replayHour = null; // the hour whose 24 h totals were last checked against the IMD rules
const replayTag = () => `[REPLAY ${replay.status().short} ${replay.currentTime} IST] `;
const timeMachineStatus = () => (replay ? replay.status() : { active: false });

function replayStep() {
  // exactly Model A of experiments/replay.js (decay, then add rain; no daily cycle, bursts or noise), so a live replay matches replay.md
  for (const z of LOCATIONS) z.storm = z.storm * 0.97 + replay.rainAt(z.id) * RAIN_LEVEL_PER_MM;
  stepZones(LOCATIONS, t, () => 0.5, { stormDecay: 1, oscillate: false }); // rng 0.5 = no burst and no noise
  replay.advance(2);
  for (const ev of replay.dueEvents()) releaseReservoirForReplay(ev);
  if (replay.hourIndex !== replayHour) {
    replayHour = replay.hourIndex;
    runReplayRainfall();
  }
}

// the IMD 24 h rules on the replayed totals, with their own state so live alerts are not affected
function runReplayRainfall() {
  const imd = imdAlerts(db.getSetting("imdAlertStateReplay", {}), LOCATIONS, replay.rainfall(), Date.now());
  db.setSetting("imdAlertStateReplay", imd.state);
  for (const a of imd.alerts) addBroadcast({ zoneId: a.zoneId, severity: a.severity, message: a.message, channels: ["sms", "push"], source: "auto", reason: a.reason });
  io.emit("rainfall-update", rainfallView());
}

function stopReplay(actor, reason) {
  const ended = replay.status();
  replay = null;
  replayHour = null;
  for (const z of LOCATIONS) { z.storm = 0; z.surge = 0; }
  audit(actor, "timemachine_stopped", { event: ended.event, label: ended.label, currentTime: ended.currentTime, progress: Math.round(ended.progress * 1000) / 1000, reason });
  toStaff("timemachine", { active: false });
}

function tick() {
  t += 1;
  if (replay) {
    for (let k = replay.minutesPerTick / 2; k > 0 && !replay.done; k--) replayStep();
    if (replay.done) stopReplay(null, "finished");
  } else {
    const rain = rainfall.get();
    if (rainLink && !rain.stale) {
      for (const z of LOCATIONS) z.storm += (rain.zones[z.id]?.currentMmPerHr || 0) * RAIN_LEVEL_PER_MM;
    }
    stepZones(LOCATIONS, t, Math.random);
  }

  const payload = currentSnapshot();
  payload.forEach((p) => {
    const arr = history[p.id];
    arr.push({ ts: p.ts, level: p.level });
    if (arr.length > HISTORY_CAP) arr.shift();
  });

  io.emit("sensor-update", payload);
  updateIncidents(payload);
  updateShelters();
  if (replay) toStaff("timemachine", replay.status());
}

setInterval(tick, 2000);

const rainfall = createRainfallFeed(LOCATIONS);
function rainfallView() {
  const state = replay ? replay.rainfall() : rainfall.get(); // during a replay the clients see the replayed rain
  return { ...state, zones: withCategories(state.zones) };
}
async function refreshRainfall() {
  const state = await rainfall.refresh();
  if (state.error) console.warn(`rainfall refresh failed: ${state.error}`);
  if (!state.stale && !replay) {
    const imd = imdAlerts(db.getSetting("imdAlertState", {}), LOCATIONS, state, Date.now());
    db.setSetting("imdAlertState", imd.state);
    for (const a of imd.alerts) addBroadcast({ zoneId: a.zoneId, severity: a.severity, message: a.message, channels: ["sms", "push"], source: "auto", reason: a.reason });
  }
  io.emit("rainfall-update", rainfallView());
}
refreshRainfall();
setInterval(refreshRainfall, RAIN_REFRESH_MS);

app.post("/api/auth/login", loginLimit, (req, res) => {
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
  res.json({ locations: currentSnapshot(), broadcasts, shelters: SHELTERS, shelterMode, thresholds, rainfall: rainfallView(), rainLink, timemachine: timeMachineStatus() });
});

app.get("/api/state", requireRole(...STAFF), (req, res) => {
  res.json({ locations: currentSnapshot(), history, incidents, reports: citizenReports, broadcasts, shelters: SHELTERS, shelterMode, shelterCheckins: checkinSummary(), teams: TEAMS, thresholds, rainfall: rainfallView(), rainLink, offlineSensors: [...offlineSensors], timemachine: timeMachineStatus() });
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

// ---- Flood time machine routes ----------------------------------------------------
// Staff can watch; only admins start or stop a replay. Replay alerts go through addBroadcast and are labelled.
app.get("/api/timemachine", requireRole(...STAFF), (req, res) => {
  res.json({ status: timeMachineStatus(), events: listEvents() });
});

app.post("/api/timemachine/start", requireRole("admin"), (req, res) => {
  const { event, minutesPerTick = 30 } = req.body || {};
  if (!Object.hasOwn(EVENTS, event)) return res.status(400).json({ error: "Pick a known event" });
  if (!Number.isInteger(minutesPerTick) || minutesPerTick < 10 || minutesPerTick > 120 || minutesPerTick % 2) {
    return res.status(400).json({ error: "Speed must be an even number of simulated minutes from 10 to 120" });
  }
  if (replay) return res.status(409).json({ error: "A replay is already running" });
  replay = createReplay(loadEvent(event), { minutesPerTick });
  for (const z of LOCATIONS) { z.storm = 0; z.surge = 0; }
  db.setSetting("imdAlertStateReplay", {});
  audit(req.user, "timemachine_started", { event, label: replay.status().label, minutesPerTick, startTime: replay.currentTime });
  replayHour = replay.hourIndex;
  runReplayRainfall();
  toStaff("timemachine", replay.status());
  res.json(timeMachineStatus());
});

app.post("/api/timemachine/stop", requireRole("admin"), (req, res) => {
  if (replay) stopReplay(req.user, "stopped by admin");
  res.json(timeMachineStatus());
});

app.post("/api/simulate/storm", requireRole("admin"), (req, res) => {
  const { zoneId, intensity } = req.body;
  const amount = Math.max(5, Math.min(60, Number(intensity) || 30));
  injectStorm(LOCATIONS, zoneId, amount);
  audit(req.user, "storm_simulated", { zoneId, intensity: amount });
  res.json({ ok: true });
});

app.put("/api/sensors/:zoneId", requireRole("admin"), (req, res) => {
  const zone = LOCATIONS.find((l) => l.id === req.params.zoneId);
  if (!zone) return res.status(404).json({ error: "unknown zone" });
  if (typeof req.body?.online !== "boolean") return res.status(400).json({ error: "online must be true or false" });
  const online = req.body.online;
  if (online) offlineSensors.delete(zone.id);
  else offlineSensors.add(zone.id);
  db.setSetting("offlineSensors", [...offlineSensors]);
  audit(req.user, "sensor_status", { zoneId: zone.id, zone: zone.name, online });
  io.emit("sensors-offline", [...offlineSensors]);
  res.json({ zoneId: zone.id, online, offline: [...offlineSensors] });
});

const CATEGORIES = new Set(["waterlogging", "drain_blocked", "road_closed", "power_hazard", "rescue_needed", "other"]);
const SEVERITIES = new Set(["low", "medium", "high"]);
// random per-browser id from the citizen app; it keys reporter trust, so it is never shown publicly
const DEVICE_ID = /^[0-9a-f-]{36}$/i;

app.post("/api/citizen-report", citizenReportLimit, (req, res) => {
  const { lat, lng, category, severity, description, reporter, deviceId } = req.body;
  if (typeof lat !== "number" || typeof lng !== "number" || !description || !String(description).trim()) {
    return res.status(400).json({ error: "lat, lng and description are required" });
  }
  const zone = nearestZone(lat, lng);
  // the same text pasted again in one area within 10 minutes is a repeat, not a new report
  const text = String(description).slice(0, 500).trim().toLowerCase();
  const now = Date.now();
  if (citizenReports.some((r) => r.zoneId === zone.id && now - r.ts < 10 * 60_000 && r.description.trim().toLowerCase() === text)) {
    return res.status(409).json({ error: "This report was already filed" });
  }
  const report = {
    id: randomUUID(),
    lat,
    lng,
    category: CATEGORIES.has(category) ? category : "other",
    severity: SEVERITIES.has(severity) ? severity : "medium",
    description: String(description).slice(0, 500),
    reporter: reporter ? String(reporter).slice(0, 60) : "Anonymous",
    deviceId: typeof deviceId === "string" && DEVICE_ID.test(deviceId) ? deviceId : null,
    zoneId: zone.id,
    zoneName: zone.name,
    ts: now,
    status: "open",
  };
  citizenReports.unshift(report);
  citizenReports = citizenReports.slice(0, REPORTS_CAP);
  saveReport(report);
  toStaff("citizen-report", report);
  const { deviceId: _ownDevice, ...receipt } = report;
  res.json(receipt);
});

app.patch("/api/citizen-report/:id", requireRole(...RESPONDERS), (req, res) => {
  const report = citizenReports.find((r) => r.id === req.params.id);
  if (!report) return res.status(404).json({ error: "not found" });
  if (["open", "in_progress", "resolved", "rejected"].includes(req.body.status) && req.body.status !== report.status) {
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

// ---- Volunteer boat rescue -----------------------------------------------------
// Citizens post requests (public, using the id they keep); volunteer boats register; the control room
// matches them. Phone numbers are staff-only: public responses drop them and events go to staff only.
app.post("/api/rescue", rescueRequestLimit, (req, res) => {
  const parsed = validateRequest(req.body);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  if (rescues.filter((x) => x.status === "open").length >= 500) return res.status(409).json({ error: "Too many open rescue requests right now. Try again shortly or call emergency services." });
  const zone = nearestZone(parsed.value.lat, parsed.value.lng);
  const r = { id: randomUUID(), ...parsed.value, zoneId: zone.id, zoneName: zone.name, status: "open", boatId: null, ts: Date.now(), assignedAt: null, rescuedAt: null };
  rescues.unshift(r);
  rescues = rescues.slice(0, RESCUES_CAP);
  saveRescue(r);
  toStaffRescue("rescue-requested", r);
  audit(null, "rescue_requested", { requestId: r.id, zone: zone.name, people: r.people, needs: r.needs });
  res.json(publicRequest(r));
});

app.post("/api/rescue/:id/cancel", rescueCancelLimit, (req, res) => {
  const r = rescues.find((x) => x.id === req.params.id);
  if (!r) return res.status(404).json({ error: "not found" });
  if (r.status !== "open" && r.status !== "assigned") return res.status(409).json({ error: "This request is already closed" });
  // a boat already on its way turns back and is free again (its position is unchanged)
  const boat = boats.find((b) => b.id === r.boatId);
  if (boat) {
    Object.assign(boat, { status: "available", ts: Date.now() });
    saveBoat(boat);
    toStaff("boat-updated", boat);
  }
  Object.assign(r, { status: "cancelled" });
  saveRescue(r);
  toStaffRescue("rescue-updated", r);
  audit(null, "rescue_cancelled", { requestId: r.id, zone: r.zoneName, people: r.people, boat: boat?.name ?? null });
  res.json(requestStatus(r, boats));
});

app.get("/api/rescue/:id", rescueStatusLimit, (req, res) => {
  const r = rescues.find((x) => x.id === req.params.id);
  if (!r) return res.status(404).json({ error: "not found" });
  res.json(requestStatus(r, boats));
});

app.get("/api/rescue", requireRole(...STAFF), (req, res) => {
  // requesters' phone numbers are for responders only, not observers
  const canCall = RESPONDERS.includes(req.user.role);
  res.json({ rescues: canCall ? rescues : rescues.map(({ contact, ...r }) => r), boats });
});

app.post("/api/boats", requireRole(...RESPONDERS), (req, res) => {
  const parsed = validateBoat(req.body);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const boat = { id: randomUUID(), ...parsed.value, ts: Date.now() };
  boats.push(boat);
  saveBoat(boat);
  toStaff("boat-updated", boat);
  audit(req.user, "boat_registered", { boatId: boat.id, boat: boat.name, owner: boat.owner, capacity: boat.capacity });
  res.json(boat);
});

app.patch("/api/boats/:id", requireRole(...RESPONDERS), (req, res) => {
  const boat = boats.find((b) => b.id === req.params.id);
  if (!boat) return res.status(404).json({ error: "not found" });
  const parsed = validateBoatPatch(req.body);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  if (boat.status === "busy" && parsed.value.status && parsed.value.status !== "busy") {
    return res.status(409).json({ error: "This boat is on a rescue: mark its request rescued or cancel it first" });
  }
  const from = boat.status;
  Object.assign(boat, parsed.value, { ts: Date.now() });
  saveBoat(boat);
  toStaff("boat-updated", boat);
  audit(req.user, "boat_updated", { boatId: boat.id, boat: boat.name, from, to: boat.status });
  res.json(boat);
});

// pairs open requests with free boats; "optimal" is the min-cost assignment, "greedy" the first-come baseline
app.post("/api/rescue/match", requireRole(...RESPONDERS), (req, res) => {
  const method = req.body?.method;
  if (!MATCH_METHODS.includes(method)) return res.status(400).json({ error: "method must be optimal or greedy" });
  const now = Date.now();
  const pairs = (method === "optimal" ? matchOptimal : matchGreedy)(rescues, boats, now);
  for (const m of pairs) {
    const r = rescues.find((x) => x.id === m.requestId);
    const boat = boats.find((x) => x.id === m.boatId);
    Object.assign(r, { status: "assigned", boatId: boat.id, assignedAt: now });
    Object.assign(boat, { status: "busy", ts: now });
    saveRescue(r);
    saveBoat(boat);
    toStaffRescue("rescue-updated", r);
    toStaff("boat-updated", boat);
    audit(req.user, "rescue_assigned", { requestId: r.id, boatId: boat.id, boat: boat.name, minutes: Math.round(m.minutes * 10) / 10, method });
  }
  res.json({ method, assigned: pairs.length });
});

app.post("/api/rescue/:id/rescued", requireRole(...RESPONDERS), (req, res) => {
  const r = rescues.find((x) => x.id === req.params.id);
  if (!r) return res.status(404).json({ error: "not found" });
  if (r.status !== "assigned") return res.status(409).json({ error: "Only an assigned request can be marked rescued" });
  const now = Date.now();
  Object.assign(r, { status: "rescued", rescuedAt: now });
  // the boat is free again where it dropped its passengers
  const boat = boats.find((b) => b.id === r.boatId);
  Object.assign(boat, { status: "available", lat: r.lat, lng: r.lng, ts: now });
  saveRescue(r);
  saveBoat(boat);
  toStaffRescue("rescue-updated", r);
  toStaff("boat-updated", boat);
  audit(req.user, "rescue_completed", { requestId: r.id, boatId: boat.id, boat: boat.name, zone: r.zoneName, people: r.people });
  res.json(r);
});

// ---- Flood relief ledger -------------------------------------------------------
// Citizens get a collection slot for their ration card (public). Shop staff mark the cash paid. Every
// token and payment is an audit entry without card numbers or keys, so the public totals can be checked
// against the sealed log. Card numbers are never stored: relief.js keys each card by HMAC.
const reliefTokenLimit = rateLimit({ windowMs: 10 * 60_000, max: 10, name: "relief-token" });
const reliefLookupLimit = rateLimit({ windowMs: 10 * 60_000, max: 20, name: "relief-lookup" });
const reliefZoneName = (id) => LOCATIONS.find((l) => l.id === id)?.name ?? id;
const reliefTokenResponse = (token) => ({ code: token.code, shop: { name: token.shopName, zone: reliefZoneName(token.zoneId) }, day: token.day, hour: token.hour, amountRs: relief.AMOUNT_RS });

app.post("/api/relief/token", reliefTokenLimit, (req, res) => {
  const key = relief.cardKey(reliefPepper, req.body?.cardNumber);
  if (!key) return res.status(400).json({ error: "Enter the 10 to 16 character ration card number" });
  const zoneId = req.body?.zoneId;
  if (!LOCATIONS.some((l) => l.id === zoneId)) return res.status(400).json({ error: "Choose an area" });
  const result = relief.issueToken(reliefState, { cardKey: key, zoneId, now: Date.now() });
  if (result.error) return res.status(409).json({ error: result.error });
  // only a new token is sealed; asking again returns the same token and adds no entry
  if (result.issued) {
    saveRelief();
    audit(null, "relief_token_issued", { shopId: result.token.shopId, zone: reliefZoneName(result.token.zoneId), day: result.token.day, hour: result.token.hour });
  }
  res.json(reliefTokenResponse(result.token));
});

app.post("/api/relief/token/lookup", reliefLookupLimit, (req, res) => {
  const key = relief.cardKey(reliefPepper, req.body?.cardNumber);
  if (!key) return res.status(400).json({ error: "Enter the 10 to 16 character ration card number" });
  const token = relief.lookupToken(reliefState, key);
  if (!token) return res.status(404).json({ error: "No flood relief token for this card number" });
  res.json(reliefTokenResponse(token));
});

// public totals; they equal the relief_paid entries in the sealed audit log
app.get("/api/relief/ledger", (req, res) => {
  const s = relief.summary(reliefState);
  res.json({
    amountRs: s.amountRs,
    totals: s.totals,
    shops: s.shops.map((x) => ({ id: x.id, name: x.name, zone: reliefZoneName(x.zoneId), issued: x.issued, paid: x.paid, amountRs: x.amountRs })),
  });
});

app.post("/api/relief/pay", requireRole(...RESPONDERS), (req, res) => {
  const key = relief.cardKey(reliefPepper, req.body?.cardNumber);
  if (!key) return res.status(400).json({ error: "Enter the 10 to 16 character ration card number" });
  const shop = relief.SHOPS.find((s) => s.id === req.body?.shopId);
  if (!shop) return res.status(400).json({ error: "Choose a shop" });
  const result = relief.pay(reliefState, { tokenCode: req.body?.code, cardKey: key, shopId: shop.id, now: Date.now() });
  if (result.error) return res.status(result.status).json({ error: result.error });
  saveRelief();
  audit(req.user, "relief_paid", { shopId: shop.id, shop: shop.name, zone: reliefZoneName(shop.zoneId), amountRs: result.amountRs });
  res.json({ code: result.token.code, shop: { name: shop.name, zone: reliefZoneName(shop.zoneId) }, amountRs: result.amountRs });
});

// staff view: totals and slot loads per shop
app.get("/api/relief", requireRole(...RESPONDERS), (req, res) => {
  const s = relief.summary(reliefState);
  res.json({ ...s, shops: s.shops.map((x) => ({ ...x, zone: reliefZoneName(x.zoneId) })) });
});

app.post("/api/broadcasts", requireRole("admin"), (req, res) => {
  const { zoneId, severity, message, channels } = req.body;
  if (!message || !String(message).trim()) return res.status(400).json({ error: "message required" });
  const valid = ["sms", "push", "siren"].filter((c) => Array.isArray(channels) && channels.includes(c));
  if (valid.length === 0) return res.status(400).json({ error: "pick at least one channel" });
  const b = addBroadcast({ zoneId: zoneId || "all", severity: severity || "info", message: String(message).slice(0, 300), channels: valid, source: "manual", reason: { rule: "manual", role: req.user.role } });
  audit(req.user, "broadcast_sent", { zone: b.zoneName, severity: b.severity, channels: b.channels, recipients: b.recipients, message: b.message });
  res.json(b);
});

// wipes reports, incidents and broadcasts (they persist across restarts now, so test runs pile up)
app.post("/api/admin/clear-data", requireRole("admin"), (req, res) => {
  // close open incidents in the audit trail too, or their timelines stay open forever
  for (const inc of incidents.filter((i) => i.status !== "cleared")) {
    audit(req.user, "incident_cleared", { incidentId: inc.id, zoneId: inc.zoneId, zone: inc.zoneName, level: inc.currentLevel, how: "demo data cleared" });
  }
  db.clearRecords();
  incidents = [];
  citizenReports = [];
  broadcasts = [];
  rescues = [];
  boats = [];
  seedDemoBoats();
  thresholds = { ...DEFAULT_THRESHOLDS };
  db.setSetting("thresholds", thresholds);
  io.emit("data-cleared", { thresholds });
  toStaff("rescue-reset", { boats });
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

// ---- Shelter check-in ---------------------------------------------------------
// Occupancy is simulated or live from check-ins. Each shelter has a secret token on its QR poster,
// so only someone at the shelter can register. Households are counts only: no names or contacts.
const SHELTER_MODES = ["simulated", "checkins"];
let shelterMode = db.getSetting("shelterMode", "simulated");
let checkins = db.getSetting("shelterCheckins", {});
const shelterTokens = db.getSetting("shelterTokens", {});
for (const s of SHELTERS) shelterTokens[s.id] ??= newToken();
db.setSetting("shelterTokens", shelterTokens);

const findShelter = (id) => SHELTERS.find((s) => s.id === id);
function checkinSummary() {
  return Object.fromEntries(SHELTERS.map((s) => [s.id, { households: (checkins[s.id] || []).length, people: occupied(checkins, s.id) }]));
}
// save, and show live occupancy at once rather than on the next tick
function publishCheckins() {
  db.setSetting("shelterCheckins", checkins);
  if (shelterMode === "checkins") SHELTERS.forEach((s) => (s.occupancy = occupied(checkins, s.id)));
  io.emit("shelters-update", SHELTERS);
}

app.get("/api/shelters/tokens", requireRole(...RESPONDERS), (req, res) => {
  res.json(shelterTokens);
});

app.put("/api/shelters/mode", requireRole("admin"), (req, res) => {
  const { mode } = req.body ?? {};
  if (!SHELTER_MODES.includes(mode)) return res.status(400).json({ error: "Mode must be simulated or checkins" });
  if (mode !== shelterMode) {
    audit(req.user, "shelter_mode", { from: shelterMode, to: mode });
    shelterMode = mode;
    db.setSetting("shelterMode", shelterMode);
  }
  res.json({ mode: shelterMode });
});

app.post("/api/shelters/:id/token", requireRole("admin"), (req, res) => {
  const shelter = findShelter(req.params.id);
  if (!shelter) return res.status(404).json({ error: "Unknown shelter" });
  shelterTokens[shelter.id] = newToken();
  db.setSetting("shelterTokens", shelterTokens);
  audit(req.user, "shelter_token_rotated", { shelterId: shelter.id, shelter: shelter.name });
  res.json({ ok: true });
});

// public: the token printed on the shelter's poster is the only proof of presence
app.post("/api/shelters/:id/checkin", checkinLimit, (req, res) => {
  const shelter = findShelter(req.params.id);
  if (!shelter) return res.status(404).json({ error: "Unknown shelter" });
  const { token, people } = req.body ?? {};
  if (typeof token !== "string" || !Number.isInteger(people)) return res.status(400).json({ error: "token and people are required" });
  if (!tokenMatches(shelterTokens[shelter.id], token)) return res.status(403).json({ error: "This code is not valid for this shelter. Scan the code on the poster at the shelter." });
  const r = checkIn(checkins, shelter, people, Date.now());
  if (r.error) return res.status(400).json({ error: r.error });
  if (r.full) return res.status(409).json({ error: "This shelter does not have room for your group", free: r.free });
  checkins = r.state;
  publishCheckins();
  audit(null, "shelter_checkin", { shelterId: shelter.id, shelter: shelter.name, people });
  res.json({ householdId: r.household.id, free: r.free });
});

app.post("/api/shelters/:id/checkout", checkinLimit, (req, res) => {
  const shelter = findShelter(req.params.id);
  if (!shelter) return res.status(404).json({ error: "Unknown shelter" });
  const { token, householdId } = req.body ?? {};
  if (typeof token !== "string" || typeof householdId !== "string") return res.status(400).json({ error: "token and householdId are required" });
  if (!tokenMatches(shelterTokens[shelter.id], token)) return res.status(403).json({ error: "This code is not valid for this shelter. Scan the code on the poster at the shelter." });
  const r = checkOut(checkins, shelter.id, householdId);
  if (!r) return res.status(404).json({ error: "No check-in found for this household" });
  checkins = r.state;
  publishCheckins();
  audit(null, "shelter_checkout", { shelterId: shelter.id, shelter: shelter.name, people: r.household.people });
  res.json({ ok: true });
});

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

app.get("/api/evacuation-route", evacuationRouteLimit, async (req, res) => {
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
  // registered vulnerable residents in the selected zones go first; without any, the plan is unchanged
  const vulnerableByZone = summarizeVulnerable(getVulnerable());
  const priorityPlan = zoneIds.some((id) => vulnerableByZone[id]?.total > 0) ? planWithPriority({ ...common, risk: fc, vulnerableByZone }) : null;
  const proposed = priorityPlan ?? planGroups({ ...common, risk: fc, method: "optimal" });
  const conventional = planGroups({ ...common, risk: snapshotRisk(zones), method: "greedy", order: groups.map((_, i) => i) });
  const proposedSummary = summarizePlan(proposed, zones, groups, fc);
  proposedSummary.assignments.forEach((a, i) => { a.tier = proposed.assignments[i].tier ?? "general"; });

  return {
    generatedAt: Date.now(),
    zoneIds,
    peoplePerZone,
    suggestedZoneIds: suggestedZones(zones),
    freeBeds: SHELTERS.map((s) => ({ id: s.id, name: s.name, free: Math.max(0, s.capacity - s.occupancy - (reserved[s.id] || 0)), capacity: s.capacity })),
    // both plans are judged by the same live forecast, so the comparison is like-for-like
    proposed: proposedSummary,
    priority: priorityPlan ? { byTier: priorityPlan.tiers } : null,
    conventional: summarizePlan(conventional, zones, groups, fc),
  };
}

// ---- Vulnerable residents -------------------------------------------------------
// A resident registers that someone at home needs help to evacuate. Only zone, kind of help and a
// head count are stored, under a random id the resident keeps to cancel later. Staff see per-zone
// totals only. The whole list lives in one settings row and is rewritten on each change: fine for
// a demo, not for a city-scale registry.
const getVulnerable = () => db.getSetting("vulnerableRegistrations", []);

app.post("/api/vulnerable", vulnerableLimit, (req, res) => {
  const checked = validateVulnerable(req.body);
  if (checked.error) return res.status(400).json({ error: checked.error });
  const { zoneId, category, count } = checked.value;
  if (!LOCATIONS.some((l) => l.id === zoneId)) return res.status(400).json({ error: "Choose an area" });
  // per-area cap stops one area being flooded with fake registrations; the total cap keeps the settings row bounded
  const all = getVulnerable();
  if (all.length >= 20_000 || all.filter((r) => r.zoneId === zoneId).length >= 2_000) {
    return res.status(409).json({ error: "Registration limit reached for this area" });
  }
  const id = randomUUID();
  db.setSetting("vulnerableRegistrations", [...all, { id, zoneId, category, count, ts: Date.now() }]);
  audit(null, "vulnerable_registered", { zoneId, category, count });
  res.json({ id });
});

app.delete("/api/vulnerable/:id", vulnerableLimit, (req, res) => {
  const all = getVulnerable();
  const gone = all.find((r) => r.id === req.params.id);
  if (gone) {
    db.setSetting("vulnerableRegistrations", all.filter((r) => r.id !== gone.id));
    audit(null, "vulnerable_cancelled", { zoneId: gone.zoneId, category: gone.category, count: gone.count });
  }
  res.status(204).end();
});

app.get("/api/vulnerable", requireRole(...STAFF), (req, res) => {
  res.json(summarizeVulnerable(getVulnerable()));
});

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
      reason: { rule: "evacuation-order", shelters: Object.keys(byShelter), people: rows.reduce((n, r) => n + r.people, 0) },
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

// ---- Reservoir desk -------------------------------------------------------------
// A release floods the downstream zones with a simulated rise and sends a warning to their residents.
const RELEASE_CUSECS = { min: 100, max: 60000 };
const RELEASE_HOURS = { min: 0.5, max: 72 };

app.get("/api/reservoirs", requireRole(...STAFF), (req, res) => {
  res.json({ reservoirs: RESERVOIRS, releases: db.listAudit({ action: "reservoir_release", limit: 20 }) });
});

app.post("/api/reservoirs/release", requireRole(...RESPONDERS), (req, res) => {
  const { reservoirId, cusecs, durationHours, reason } = req.body || {};
  const reservoir = RESERVOIRS.find((r) => r.id === reservoirId);
  if (!reservoir) return res.status(400).json({ error: "Pick a known reservoir" });
  if (!Number.isInteger(cusecs) || cusecs < RELEASE_CUSECS.min || cusecs > RELEASE_CUSECS.max) {
    return res.status(400).json({ error: `Release must be a whole number of cusecs from ${RELEASE_CUSECS.min} to ${RELEASE_CUSECS.max}` });
  }
  if (typeof durationHours !== "number" || !(durationHours >= RELEASE_HOURS.min && durationHours <= RELEASE_HOURS.max)) {
    return res.status(400).json({ error: `Duration must be ${RELEASE_HOURS.min} to ${RELEASE_HOURS.max} hours` });
  }
  const note = typeof reason === "string" ? reason.trim() : "";
  if (note.length < 3 || note.length > 200) return res.status(400).json({ error: "Give a reason of 3 to 200 characters" });

  releaseReservoir(reservoir, { cusecs, durationHours, reason: note }, req.user);
  res.json({ ok: true, alerts: reservoir.downstream.length });
});

// the release's effect, shared by the desk and the time machine; durationHours null means not documented
function releaseReservoir(reservoir, { cusecs, durationHours, reason }, actor, extra = {}) {
  const zoneNames = reservoir.downstream.map((id) => LOCATIONS.find((l) => l.id === id).name);
  audit(actor, "reservoir_release", { reservoirId: reservoir.id, reservoir: reservoir.name, cusecs, durationHours, reason, downstream: zoneNames, ...extra });
  const impact = releaseImpact(cusecs);
  for (const zoneId of reservoir.downstream) {
    injectStorm(LOCATIONS, zoneId, impact);
    addBroadcast({
      zoneId,
      severity: "warning",
      message: `RESERVOIR RELEASE: ${cusecs} cusecs from ${reservoir.name}${durationHours == null ? "" : ` for ${durationHours} h`}. ${reservoir.river} river will rise. Stay away from riverbanks and low bridges.`,
      channels: ["sms", "push"],
      source: "manual",
      reason: { rule: "reservoir-release", reservoir: reservoir.name, river: reservoir.river, cusecs, durationHours },
    });
  }
}

function releaseReservoirForReplay(ev) {
  const reservoir = RESERVOIRS.find((r) => r.id === ev.reservoir);
  releaseReservoir(reservoir, { cusecs: ev.cusecs, durationHours: null, reason: "Documented release, replayed from the official timeline" }, null, { replay: true });
}

const AUDIT_ACTIONS = new Set(["login", "login_failed", "login_locked", "logout", "thresholds_changed", "storm_simulated", "report_status", "team_dispatched", "incident_note", "broadcast_sent", "evacuation_order", "demo_data_cleared", "rain_link", "alert_published", "incident_opened", "incident_cleared", "sensor_status", "reservoir_release", "rescue_requested", "rescue_assigned", "rescue_completed", "rescue_cancelled", "boat_registered", "boat_updated", "vulnerable_registered", "vulnerable_cancelled", "shelter_mode", "shelter_token_rotated", "shelter_checkin", "shelter_checkout", "timemachine_started", "timemachine_stopped", "relief_token_issued", "relief_paid"]);

app.get("/api/audit", requireRole("admin"), (req, res) => {
  const action = AUDIT_ACTIONS.has(req.query.action) ? req.query.action : undefined;
  const limit = Math.max(1, Math.min(1000, Number(req.query.limit) || 500));
  res.json(db.listAudit({ action, limit }));
});

app.get("/api/audit/chain", requireRole("admin"), async (req, res) => {
  res.json({
    enabled: chain.enabled,
    canWrite: chain.canWrite,
    contract: chain.address ?? null,
    chainId: chain.chainId ?? null,
    network: deployment?.network ?? null,
    explorer: deployment?.explorer ?? null,
    agencies: chain.enabled ? await chain.agencies() : [],
  });
});

// Public: is this forwarded flood alert real? Answers from the anchored audit record, not the
// broadcasts table, so it reflects exactly what was sealed (and survives clearing demo data).
const ALERT_CODE = /^UP-[0-9A-F]{8}$/;
app.get("/api/alerts/verify/:code", alertVerifyLimit, async (req, res) => {
  const code = String(req.params.code).trim().toUpperCase();
  if (!ALERT_CODE.test(code)) return res.status(400).json({ error: "Alert codes look like UP-1A2B3C4D" });
  const row = db.findAlert(code);
  if (!row) return res.status(404).json({ found: false });
  const d = JSON.parse(row.details);
  const out = {
    found: true,
    alert: { code, zone: d.zone, severity: d.severity, message: d.message, source: d.source, reason: d.reason ?? null, issuedAt: row.ts },
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

const { handleSms } = require("./sms");
// Simulated SMS gateway: a telecom gateway would post { from, text } here and send back { reply }.
// The sender number is only validated; it is never stored or logged.
app.post("/api/sms/inbound", smsLimit, async (req, res) => {
  const { from, text } = req.body || {};
  if (typeof text !== "string" || text.length > 500) return res.status(400).json({ error: "text must be a string of up to 500 characters" });
  if (from !== undefined && !(typeof from === "string" && from.length <= 20 && /^[0-9+]*$/.test(from))) return res.status(400).json({ error: "from must be a phone number" });
  // same lookup and chain check as /api/alerts/verify/:code, reduced to the verification status
  const findAlert = async (code) => {
    const row = db.findAlert(code);
    if (!row) return { status: "notfound" };
    const d = JSON.parse(row.details);
    const alert = { code, zone: d.zone, severity: d.severity, message: d.message, source: d.source, issuedAt: row.ts };
    if (!chain.enabled) return { status: "unavailable", alert };
    if (row.batch_id == null) return { status: "pending", alert };
    try {
      return { status: (await chain.verifyEntry(row.id, row.batch_id)).status, alert };
    } catch {
      return { status: "unreachable", alert };
    }
  };
  const reply = await handleSms(text, { zones: currentSnapshot(), shelters: SHELTERS, rain: rainfallView().zones, findAlert });
  res.json({ reply });
});

const chainError = (res, err) => res.status(502).json({ error: `Blockchain unreachable: ${err.shortMessage || err.message}` });

app.post("/api/audit/anchor", requireRole("admin"), async (req, res) => {
  if (!chain.canWrite) return res.status(503).json({ error: "Anchoring is not configured on this server" });
  try {
    const batches = await chain.anchorNow();
    res.json({ anchored: batches.reduce((n, b) => n + b.count, 0), batches: batches.map((b) => ({ batchId: b.id, txHash: b.txHash, agency: b.agency })) });
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

// response times per incident, timed from the audit log (accountability.js)
const ACCOUNTABILITY_ACTIONS = ["incident_opened", "incident_cleared", "alert_published", "team_dispatched", "evacuation_order"];
app.get("/api/accountability", requireRole(...STAFF), (req, res) => {
  const timelines = buildTimelines(db.auditByActions(ACCOUNTABILITY_ACTIONS));
  res.json({ timelines, summary: summarize(timelines) });
});

const PORT = 4000;
server.listen(PORT, () => console.log(`UrbanPulse demo server on :${PORT}`));
