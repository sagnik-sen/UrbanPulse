// City-scale benchmark: how the live server's per-tick, fusion, planning and audit-anchoring work
// grows as the city goes from the 6 demo zones to all 200 Greater Chennai Corporation wards.
//
//   node experiments/scale.js [--out scale]
//
// Offline and deterministic: seeded water and reports, straight-line routes (no OSRM), in-memory
// SQLite and an in-memory chain stand-in. Each step is the server's own module code; index.js is
// not loaded. Writes results/<out>.md and results/<out>.csv.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const v8 = require("node:v8");
const vm = require("node:vm");
const { performance } = require("node:perf_hooks");
const wardFile = require("./data/chennai-wards.json");
const { createZones, createShelters, stepZones, seededRng, ZONE_DEFS } = require("../simulator");
const { forecast, stepsToBreach } = require("../forecast");
const { forecastRisk } = require("../risk");
const { straightLine } = require("../evacuation");
const { planGroups } = require("../planner");
const { fusedZones } = require("../fusion-live");
const { openDb } = require("../db");
const { leafHash, merkleRoot, verifyLog } = require("../anchor");

const SEED = 7;
const CITY_SIZES = [6, 50, 100, 200];
const CITY_POPULATION = 4646732; // Census 2011, Greater Chennai Corporation (ASSUMPTION: split by ward area)
const TOTAL_KM2 = wardFile.wards.reduce((s, w) => s + w.km2, 0);
const TICK_BUDGET_MS = 2000;
const DANGER = 70;
const WARNING = 40;
const SIM_MIN_PER_TICK = 2;
const FORECAST_WINDOW = 30;
const FORECAST_STEPS = 60;
const HISTORY_CAP = 200;
const SHELTER_CAPACITY = 300;
const SHELTER_OFFSET_LAT = 0.003;
const REPORT_COUNT = 500;
const DEVICE_POOL = 300;
const NOW = 1_760_000_000_000;
const GROUP_SHARE = 0.2;
const PEOPLE_DIVISOR = 100;
const ENTRIES_BASE = 50;
const ENTRIES_PER_ZONE = 5;
const BATCH = 500;
const WARMUP_RUNS = 2;
const TIMED_RUNS = 7;

const ACTIONS = ["login", "logout", "thresholds_changed", "team_dispatched", "broadcast_sent", "evacuation_order", "alert_published", "report_status"];
const USERS = [["admin", "admin"], ["officer", "officer"], ["viewer", "viewer"], [null, null]];
const AGENCY = "0xGCC";

const shuffle = (rng, arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const riskLevel = (level) => (level >= DANGER ? "danger" : level >= WARNING ? "warning" : "safe");
const groupCountFor = (n) => Math.max(1, Math.floor(n * GROUP_SHARE));
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

// same shape as simulator.createZones() output
const zoneFrom = (def) => ({ ...def, level: def.base, prevLevel: def.base, surge: 0, storm: 0, dangerTicks: 0 });

// N = 6 is the real demo (zones and shelters). Larger N: seeded sample of wards, area-based population,
// synthetic shelters (one per two zones, at every other ward's centroid, offset north).
function buildCity(n, seed = SEED) {
  if (n === ZONE_DEFS.length) return { zones: createZones(), shelters: createShelters(), wards: null };
  const rng = seededRng(seed);
  const wards = shuffle(rng, wardFile.wards).slice(0, n);
  const zones = wards.map((w) => zoneFrom({
    id: `w${w.ward}`,
    name: `Ward ${w.ward}`,
    lat: w.lat,
    lng: w.lng,
    base: 30,
    amplitude: 15,
    phase: Math.floor(rng() * 21),
    population: Math.round((CITY_POPULATION * w.km2) / TOTAL_KM2),
  }));
  const shelters = [];
  for (let i = 0; i < wards.length; i += 2) {
    const w = wards[i];
    shelters.push({ id: `sh${w.ward}`, name: `Synthetic shelter, Ward ${w.ward}`, zoneId: `w${w.ward}`, lat: w.lat + SHELTER_OFFSET_LAT, lng: w.lng, capacity: SHELTER_CAPACITY, occupancy: 0 });
  }
  return { zones, shelters, wards };
}

// synthetic citizen reports: random zone, severity and status; devices from a pool of 300; within the last two minutes
function buildReports(zones, seed = SEED) {
  const rng = seededRng(seed + 1);
  const severities = ["low", "medium", "high"];
  const statuses = ["open", "in_progress", "resolved", "rejected"];
  return Array.from({ length: REPORT_COUNT }, (_, i) => ({
    id: `r${i}`,
    deviceId: `device-${Math.floor(rng() * DEVICE_POOL)}`,
    zoneId: zones[Math.floor(rng() * zones.length)].id,
    severity: severities[Math.floor(rng() * severities.length)],
    status: statuses[Math.floor(rng() * statuses.length)],
    ts: NOW - Math.floor(rng() * 120_000),
  }));
}

// index.js currentSnapshot() minus fusion: per-zone Holt forecast and breach time from the last 29 readings
function snapshot(state, now = NOW) {
  return state.zones.map((loc) => {
    const series = state.history[loc.id].slice(-(FORECAST_WINDOW - 1)).map((p) => p.level).concat(Math.round(loc.level));
    const path = forecast(series, FORECAST_STEPS);
    const steps = stepsToBreach(Math.round(loc.level), path, DANGER);
    return {
      id: loc.id,
      lat: loc.lat,
      lng: loc.lng,
      population: loc.population,
      level: Math.round(loc.level),
      risk: riskLevel(loc.level),
      forecastHours: steps == null ? null : Math.round(((steps * SIM_MIN_PER_TICK) / 60) * 10) / 10,
      forecast: path,
      ts: now,
    };
  });
}

// index.js tick(): step the water, take the snapshot, append history (rain feed and sockets left out)
function tick(state, now = NOW) {
  state.t += 1;
  stepZones(state.zones, state.t, state.rng);
  const payload = snapshot(state, now);
  for (const p of payload) {
    const arr = state.history[p.id];
    arr.push({ ts: p.ts, level: p.level });
    if (arr.length > HISTORY_CAP) arr.shift();
  }
  return payload;
}

function createState(city, seed = SEED) {
  const state = {
    zones: city.zones,
    shelters: city.shelters,
    history: Object.fromEntries(city.zones.map((z) => [z.id, []])),
    t: 0,
    rng: seededRng(seed + 2),
  };
  for (let i = 0; i < FORECAST_WINDOW; i++) tick(state); // fill history as a running server would
  return state;
}

// index.js currentSnapshot() fusion step, with no offline sensors
function fuse(state, reports, now = NOW) {
  return fusedZones({ zones: state.zones.map((z) => ({ id: z.id, level: Math.round(z.level) })), reports, offline: new Set(), now });
}

// one evacuation plan: snapshot, forecast risk, then the proposed optimal assignment over a fifth of the zones
function planCity(state, now = NOW) {
  const zones = snapshot(state, now);
  const risk = forecastRisk(zones, DANGER, SIM_MIN_PER_TICK);
  const groups = zones.slice(0, groupCountFor(zones.length)).map((z) => ({
    origin: { id: z.id, zoneId: z.id, lat: z.lat, lng: z.lng },
    people: Math.round(z.population / PEOPLE_DIVISOR),
  }));
  const originById = new Map(groups.map((g) => [g.origin.id, g.origin]));
  const shelterById = new Map(state.shelters.map((s) => [s.id, s]));
  const candidatesFor = (originId, shelterId) => [straightLine(originById.get(originId), shelterById.get(shelterId))];
  const result = planGroups({ groups, shelters: state.shelters, candidatesFor, risk, method: "optimal", reserved: {} });
  return { groups, shelters: state.shelters, result, pairs: groups.length * state.shelters.length };
}

function fillLog(db, rng, n, startTs = 1_760_000_000_000) {
  for (let i = 0; i < n; i++) {
    const [username, role] = USERS[Math.floor(rng() * USERS.length)];
    const action = ACTIONS[Math.floor(rng() * ACTIONS.length)];
    db.logAudit({ id: `e${i}`, ts: startTs + i * 1000 + Math.floor(rng() * 900), username, role, action, details: { zone: "Velachery", n: i, note: rng().toString(36).slice(2) } });
  }
}

// anchor.js sendBatch() minus the transaction: hash, Merkle root, store; the chain is an in-memory stand-in
function anchorAll(db, size) {
  const chain = [];
  for (;;) {
    const rows = db.unanchoredAudit(size).map((r) => ({ ...r, leaf: leafHash(r) }));
    if (rows.length === 0) return chain;
    const id = chain.length;
    chain.push({ root: merkleRoot(rows.map((r) => r.leaf)), count: rows.length, agency: AGENCY });
    db.saveAnchorBatch({ id, root: chain[id].root, count: rows.length, txHash: `0xtx${id}`, anchoredAt: 0, agency: AGENCY }, rows);
  }
}

// one simulated day of entries: anchor in batches, then verify the whole log against the chain
async function anchorDay(entries, seed = SEED) {
  const db = openDb(":memory:");
  fillLog(db, seededRng(seed), entries);
  const t0 = performance.now();
  const chain = anchorAll(db, BATCH);
  const anchorMs = performance.now() - t0;
  const t1 = performance.now();
  const result = await verifyLog(db, { total: chain.length, getBatch: async (id) => chain[id] });
  const verifyMs = performance.now() - t1;
  if (!result.ok) throw new Error("clean log failed verification");
  return { entries, batches: chain.length, anchorMs, verifyMs };
}

const clock = (fn) => {
  const t0 = performance.now();
  fn();
  return { ms: performance.now() - t0 };
};

async function measure(step) {
  for (let i = 0; i < WARMUP_RUNS; i++) await step();
  const runs = [];
  for (let i = 0; i < TIMED_RUNS; i++) runs.push(await step());
  return Object.fromEntries(Object.keys(runs[0]).map((k) => [k, median(runs.map((r) => r[k]))]));
}

async function benchCity(n, gc) {
  const city = buildCity(n);
  const reports = buildReports(city.zones);
  const state = createState(city);
  const entries = ENTRIES_BASE + ENTRIES_PER_ZONE * n;

  const tickT = await measure(() => clock(() => tick(state)));
  const fusionT = await measure(() => clock(() => fuse(state, reports)));
  const planT = await measure(() => clock(() => planCity(state)));
  const anchorT = await measure(async () => {
    const r = await anchorDay(entries);
    return { anchor: r.anchorMs, verify: r.verifyMs };
  });
  const planned = planCity(state);
  const batches = (await anchorDay(entries)).batches;

  gc();
  const heapBefore = process.memoryUsage().heapUsed;
  tick(state);
  fuse(state, reports);
  planCity(state);
  await anchorDay(entries);
  const heapMb = (process.memoryUsage().heapUsed - heapBefore) / 2 ** 20;

  return {
    zones: n,
    groups: planned.groups.length,
    shelters: state.shelters.length,
    pairs: planned.pairs,
    tickMs: tickT.ms,
    fusionMs: fusionT.ms,
    planMs: planT.ms,
    anchorMs: anchorT.anchor,
    verifyMs: anchorT.verify,
    entries,
    batches,
    heapMb,
  };
}

const fmtMs = (x) => (x < 10 ? x.toFixed(2) : x.toFixed(1));
const fmtPct = (ms) => `${((100 * ms) / TICK_BUDGET_MS).toFixed(2)}%`;

function renderMd(rows, info) {
  const label = (r) => (r.zones === ZONE_DEFS.length ? `${r.zones} (demo)` : `${r.zones}`);
  const table = [
    "| Zones (N) | Groups | Shelters | Tick ms (% of 2,000 ms) | Fusion ms (% of 2,000 ms) | Plan ms per request (pairs) | Anchor ms + verify ms (entries) | Heap MB (one pass) |",
    "|---:|---:|---:|---:|---:|---:|---:|---:|",
    ...rows.map((r) => `| ${label(r)} | ${r.groups} | ${r.shelters} | ${fmtMs(r.tickMs)} (${fmtPct(r.tickMs)}) | ${fmtMs(r.fusionMs)} (${fmtPct(r.fusionMs)}) | ${fmtMs(r.planMs)} (${r.pairs.toLocaleString("en-US")}) | ${fmtMs(r.anchorMs)} + ${fmtMs(r.verifyMs)} (${r.entries.toLocaleString("en-US")}) | ${r.heapMb.toFixed(1)} |`),
  ];

  // growth between the two ends of the ward series (both are ward-built cities with synthetic shelters)
  const lo = rows.find((r) => r.zones === 50);
  const hi = rows.find((r) => r.zones === 200);
  const steps = [
    ["tick", (r) => r.tickMs],
    ["fusion", (r) => r.fusionMs],
    ["plan", (r) => r.planMs],
    ["anchor+verify", (r) => r.anchorMs + r.verifyMs],
  ].map(([name, get]) => ({ name, ratio: get(hi) / get(lo) }));
  const fastest = steps.reduce((a, b) => (b.ratio > a.ratio ? b : a));
  const growth = `Fastest growth from N=50 to N=200 (zones x${(hi.zones / lo.zones).toFixed(0)}): ${fastest.name}, x${fastest.ratio.toFixed(1)}. Others: ${steps.filter((s) => s !== fastest).map((s) => `${s.name} x${s.ratio.toFixed(1)}`).join(", ")}.`;

  return [
    "# City-scale benchmark (scale)",
    "",
    `Machine: ${os.cpus()[0].model}, ${os.cpus().length} CPU cores, Node ${process.version}, ${os.platform()} ${os.arch()}.`,
    `Benchmark runtime: ${info.runtimeS.toFixed(1)} s. Median of ${TIMED_RUNS} runs after ${WARMUP_RUNS} warm-up runs (performance.now); heap is the heapUsed change over one pass of all four steps, with a forced GC before the first reading and none after. Heap is a single sample, so it is noisy across N and is not a trend.`,
    "",
    `Data: \`experiments/data/chennai-wards.json\`, ${wardFile.wards.length} Greater Chennai Corporation wards. Source: ${wardFile.source}. Licence: ${wardFile.license}. Ward centroids and areas come from that file.`,
    "",
    "## Assumptions",
    "",
    `- Population: Census 2011 Greater Chennai Corporation population (${CITY_POPULATION.toLocaleString("en-US")}) is split across wards in proportion to ward area. ASSUMPTION: actual ward populations differ; this is an area proxy only.`,
    "- Shelters are SYNTHETIC: one per two zones (ceil(N/2)), at every other selected ward's centroid, offset +0.003 deg latitude, capacity 300, occupancy 0. Locations and capacities are not real. Exception: N=6 uses the six real demo shelters.",
    "- Zones for N=6 are the real demo zones (ZONE_DEFS). Larger N sample wards with a fixed seed (7).",
    `- Citizen reports are SYNTHETIC: ${REPORT_COUNT} reports, random zone, severity (low/medium/high) and status (open/in_progress/resolved/rejected), ${DEVICE_POOL} devices, timestamps within two minutes of a fixed clock. No offline sensors.`,
    "- Tick: one simulator step plus the forecast for every zone, as index.js computes the snapshot. Rain feed, incidents and socket emits are left out. Fusion is a separate column; a live tick also runs it, so the full cost is roughly tick + fusion.",
    `- Plan: one request = snapshot + forecastRisk + planGroups (optimal). Groups are the first max(1, floor(0.2 x N)) zones of the snapshot, each with round(population / 100) people. Pairs = groups x shelters. The endpoint also runs a conventional greedy plan and two summaries; those are not timed.`,
    "- Routes: one straight-line route per (zone, shelter) pair at 25 km/h, from evacuation.js straightLine(). No OSRM, so travel times and road exposure are not road-realistic.",
    `- Audit entries per simulated day = ${ENTRIES_BASE} + ${ENTRIES_PER_ZONE} x N. ASSUMPTION: the true rate is unknown. Batches of ${BATCH}; the chain is an in-memory stand-in, so network and gas time are excluded.`,
    "",
    "## Results",
    "",
    ...table,
    "",
    "Tick and fusion are compared with the 2,000 ms budget of one live tick (the server ticks every 2 s). Plan is per request.",
    "",
    growth,
    "",
  ].join("\n");
}

function renderCsv(rows) {
  const header = ["zones", "groups", "shelters", "pairs", "tick_ms", "tick_pct_budget", "fusion_ms", "fusion_pct_budget", "plan_ms", "anchor_ms", "verify_ms", "entries", "batches", "heap_mb"];
  const body = rows.map((r) => [
    r.zones, r.groups, r.shelters, r.pairs,
    r.tickMs.toFixed(3), ((100 * r.tickMs) / TICK_BUDGET_MS).toFixed(3),
    r.fusionMs.toFixed(3), ((100 * r.fusionMs) / TICK_BUDGET_MS).toFixed(3),
    r.planMs.toFixed(3), r.anchorMs.toFixed(3), r.verifyMs.toFixed(3),
    r.entries, r.batches, r.heapMb.toFixed(2),
  ].join(","));
  return [header.join(","), ...body].join("\n") + "\n";
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]]] : acc), []));
  const outName = args.out || "scale";
  v8.setFlagsFromString("--expose-gc");
  const gc = vm.runInNewContext("gc");

  const started = performance.now();
  const rows = [];
  for (const n of CITY_SIZES) {
    rows.push(await benchCity(n, gc));
    process.stdout.write(`N=${n} done\n`);
  }
  const runtimeS = (performance.now() - started) / 1000;

  const outDir = path.join(__dirname, "results");
  fs.mkdirSync(outDir, { recursive: true });
  const md = renderMd(rows, { runtimeS });
  fs.writeFileSync(path.join(outDir, `${outName}.csv`), renderCsv(rows));
  fs.writeFileSync(path.join(outDir, `${outName}.md`), md);
  console.log(md);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { buildCity, buildReports, createState, tick, snapshot, fuse, planCity, anchorDay, groupCountFor, CITY_POPULATION, TOTAL_KM2 };
