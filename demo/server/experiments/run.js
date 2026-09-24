// Evacuation policy experiment.
//
//   node experiments/run.js [seedsPerScenarioType]
//
// For every seeded scenario: simulate up to a planning time t0, let each policy plan using
// only what is known at t0 (current levels + forecast), then keep simulating and score the
// plans against what the water ACTUALLY did while evacuees were on the road.
// Storms that start after t0 are invisible to every planner.
const fs = require("node:fs");
const path = require("node:path");
const { createZones, createShelters, stepZones, injectStorm, seededRng } = require("../simulator");
const { forecast } = require("../forecast");
const { snapshotRisk, forecastRisk, oracleRisk, distanceKm } = require("../risk");
const { routeExposure, score } = require("../evacuation");
const { assignEvacuees } = require("../assignment");

const SIM_MIN_PER_TICK = 2;
const WARNING = 40;
const DANGER = 70;
const FORECAST_WINDOW = 30;
const FORECAST_STEPS = 60;
const FUTURE_TICKS = 60; // simulate 2 simulated hours past t0; longest route is well under that
const TRIGGER_STEPS = 15; // evacuate zones in danger now or forecast to breach within 30 min
const EXPOSED_KM = 0.2; // an evacuee counts as exposed if their route crossed >= 200 m of actual floodwater
const SCENARIO_TYPES = ["rising", "receding", "surprise", "calm"];

const routeSet = JSON.parse(fs.readFileSync(path.join(__dirname, "routes.json"), "utf8"));
const ORIGINS = routeSet.origins;

const riskLabel = (level) => (level >= DANGER ? "danger" : level >= WARNING ? "warning" : "safe");
const pick = (rng, arr, n) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
};
const between = (rng, lo, hi) => lo + rng() * (hi - lo);

function buildScenario(seed, type) {
  const rng = seededRng(seed * 7919 + SCENARIO_TYPES.indexOf(type));
  const zones = createZones();
  const shelters = createShelters();
  const t0 = 80 + Math.floor(rng() * 120);

  const storms = [];
  const targets = pick(rng, zones.map((z) => z.id), 1 + Math.floor(rng() * 2));
  for (const zoneId of targets) {
    if (type === "rising") storms.push({ zoneId, start: t0 - 2 - Math.floor(rng() * 5), duration: 12 + Math.floor(rng() * 13), total: between(rng, 45, 75) });
    if (type === "receding") storms.push({ zoneId, start: t0 - 25 - Math.floor(rng() * 16), duration: 6 + Math.floor(rng() * 5), total: between(rng, 55, 80) });
    if (type === "surprise") storms.push({ zoneId, start: t0 + 2 + Math.floor(rng() * 9), duration: 8 + Math.floor(rng() * 8), total: between(rng, 45, 75) });
  }

  const history = Object.fromEntries(zones.map((z) => [z.id, []]));
  const future = Object.fromEntries(zones.map((z) => [z.id, []]));
  let planningView = null;

  for (let t = 1; t <= t0 + FUTURE_TICKS; t++) {
    for (const s of storms) if (t >= s.start && t < s.start + s.duration) injectStorm(zones, s.zoneId, s.total / s.duration);
    stepZones(zones, t, rng);
    for (const z of zones) (t <= t0 ? history : future)[z.id].push(z.level);

    if (t === t0) {
      planningView = zones.map((z) => ({
        id: z.id, lat: z.lat, lng: z.lng, level: z.level, risk: riskLabel(z.level),
        forecast: forecast(history[z.id].slice(-FORECAST_WINDOW), FORECAST_STEPS),
      }));
    }
  }

  // actual level by forecast step: index 0 = t0, index k = t0 + k ticks
  const actual = Object.fromEntries(zones.map((z) => [z.id, [history[z.id][t0 - 1], ...future[z.id]]]));

  for (const s of shelters) s.occupancy = Math.floor(rng() * 0.6 * s.capacity);

  let evacZones = planningView
    .filter((z) => z.risk === "danger" || z.forecast.slice(0, TRIGGER_STEPS).some((p) => p.mean >= DANGER))
    .map((z) => z.id);
  if (evacZones.length === 0) evacZones = pick(rng, planningView.map((z) => z.id), 1 + Math.floor(rng() * 2)); // precautionary evacuation

  const groups = [];
  for (const zoneId of evacZones) {
    const people = 200 + Math.floor(rng() * 301);
    const origins = ORIGINS.filter((o) => o.zoneId === zoneId);
    origins.forEach((o, i) => groups.push({ origin: o, people: Math.floor(people / origins.length) + (i < people % origins.length ? 1 : 0) }));
  }

  return { seed, type, t0, storms, planningView, actual, shelters, groups };
}

// best candidate route origin -> shelter under a risk model
function bestRoute(origin, shelter, risk) {
  const candidates = routeSet.routes[`${origin.id}|${shelter.id}`] || [];
  let best = null;
  for (const r of candidates) {
    const s = score(r, shelter, risk, {});
    if (!best || s.cost < best.cost) best = s;
  }
  return best;
}

function plan(policy, sc) {
  const snap = snapshotRisk(sc.planningView);
  const fc = forecastRisk(sc.planningView, DANGER, SIM_MIN_PER_TICK);
  const open = sc.shelters.filter((s) => s.capacity - s.occupancy > 0);
  const out = [];

  if (policy === "nearest") {
    for (const g of sc.groups) {
      const shelter = [...open].sort((a, b) => distanceKm(g.origin, a) - distanceKm(g.origin, b))[0];
      const candidates = routeSet.routes[`${g.origin.id}|${shelter.id}`];
      const route = candidates.reduce((a, b) => (b.durationMin < a.durationMin ? b : a));
      out.push({ group: g, shelter, route, people: g.people });
    }
    return { assignments: out, unassigned: 0 };
  }

  const risk = policy === "snapshot" || policy === "capacity" ? snap : fc;

  if (policy === "snapshot" || policy === "forecast") {
    // each group decides independently (what a per-request routing app does)
    for (const g of sc.groups) {
      let best = null;
      for (const shelter of open) {
        const r = bestRoute(g.origin, shelter, risk);
        if (r && (!best || r.cost < best.route.cost)) best = { shelter, route: r };
      }
      out.push({ group: g, shelter: best.shelter, route: best.route, people: g.people });
    }
    return { assignments: out, unassigned: 0 };
  }

  // capacity / combined: one joint min-cost assignment of all groups to shelters
  const routes = {};
  for (const g of sc.groups) for (const s of open) routes[`${g.origin.id}|${s.id}`] = bestRoute(g.origin, s, risk);
  const result = assignEvacuees({
    sources: sc.groups.map((g) => ({ id: g.origin.id, people: g.people })),
    sinks: open.map((s) => ({ id: s.id, beds: s.capacity - s.occupancy })),
    cost: (o, s) => routes[`${o}|${s}`]?.cost ?? Infinity,
  });
  for (const f of result.flows) {
    const g = sc.groups.find((x) => x.origin.id === f.source);
    out.push({ group: g, shelter: open.find((s) => s.id === f.sink), route: routes[`${f.source}|${f.sink}`], people: f.people });
  }
  return { assignments: out, unassigned: result.unassigned.reduce((s, u) => s + u.people, 0) };
}

function evaluate(sc, { assignments, unassigned }) {
  const oracle = oracleRisk(sc.planningView, sc.actual, DANGER, SIM_MIN_PER_TICK);
  const total = sc.groups.reduce((s, g) => s + g.people, 0);
  let floodKmPeople = 0;
  let enRouteKmPeople = 0;
  let exposed = 0;
  let exposedEnRoute = 0;
  let floodedShelter = 0;
  let travelPeople = 0;
  let worstTravel = 0;
  const arrivals = {};
  for (const a of assignments) {
    const actualKm = routeExposure(a.route, oracle).expectedFloodKm;
    // en route = outside the zone you're evacuating from; that part is what routing can change
    const ownZone = a.group.origin.zoneId;
    const enRoute = routeExposure(a.route, { at: (pt, min) => { const r = oracle.at(pt, min); return r.zoneId === ownZone ? { p: 0, zoneId: r.zoneId } : r; } }).expectedFloodKm;
    floodKmPeople += actualKm * a.people;
    enRouteKmPeople += enRoute * a.people;
    if (actualKm >= EXPOSED_KM) exposed += a.people;
    if (enRoute >= EXPOSED_KM) exposedEnRoute += a.people;
    if (oracle.at(a.shelter, a.route.durationMin).p === 1) floodedShelter += a.people;
    travelPeople += a.route.durationMin * a.people;
    worstTravel = Math.max(worstTravel, a.route.durationMin);
    arrivals[a.shelter.id] = (arrivals[a.shelter.id] || 0) + a.people;
  }
  const overflow = sc.shelters.reduce((s, sh) => s + Math.max(0, (arrivals[sh.id] || 0) - (sh.capacity - sh.occupancy)), 0);
  return {
    floodKmPerEvacuee: floodKmPeople / total,
    enRouteKmPerEvacuee: enRouteKmPeople / total,
    pctExposed: (100 * exposed) / total,
    pctExposedEnRoute: (100 * exposedEnRoute) / total,
    pctWithoutBed: (100 * (overflow + unassigned)) / total,
    pctFloodedShelter: (100 * floodedShelter) / total,
    meanTravelMin: travelPeople / Math.max(1, total - unassigned),
    worstTravelMin: worstTravel,
  };
}

const POLICIES = ["nearest", "snapshot", "forecast", "capacity", "combined"];
const POLICY_LABEL = {
  nearest: "Nearest shelter",
  snapshot: "Avoid current floods",
  forecast: "Forecast-aware",
  capacity: "Capacity-aware",
  combined: "Forecast + capacity (proposed)",
};
const METRICS = [
  ["enRouteKmPerEvacuee", "Avoidable flooded km / evacuee", 3],
  ["pctExposedEnRoute", "% exposed en route", 1],
  ["floodKmPerEvacuee", "Total flooded km / evacuee", 3],
  ["pctWithoutBed", "% without bed", 1],
  ["pctFloodedShelter", "% to flooded shelter", 1],
  ["meanTravelMin", "Mean travel (min)", 1],
  ["worstTravelMin", "Worst travel (min)", 1],
];

const meanCi = (xs) => {
  const n = xs.length;
  const m = xs.reduce((s, x) => s + x, 0) / n;
  const sd = Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, n - 1));
  return { m, ci: (1.96 * sd) / Math.sqrt(n) };
};

function main() {
  const seeds = Number(process.argv[2]) || 100;
  const rows = [];
  for (const type of SCENARIO_TYPES) {
    for (let seed = 1; seed <= seeds; seed++) {
      const sc = buildScenario(seed, type);
      for (const policy of POLICIES) rows.push({ type, seed, policy, evacuees: sc.groups.reduce((s, g) => s + g.people, 0), ...evaluate(sc, plan(policy, sc)) });
    }
  }

  const outDir = path.join(__dirname, "results");
  fs.mkdirSync(outDir, { recursive: true });
  const header = ["type", "seed", "policy", "evacuees", ...METRICS.map((m) => m[0])];
  fs.writeFileSync(path.join(outDir, "results.csv"), [header.join(","), ...rows.map((r) => header.map((h) => (typeof r[h] === "number" ? +r[h].toFixed(4) : r[h])).join(","))].join("\n") + "\n");

  const lines = [
    "# Evacuation policy experiment",
    "",
    `${seeds} seeded scenarios per type, ${seeds * SCENARIO_TYPES.length} total. Values are means with 95% confidence intervals.`,
    "Routes: real OSRM road routes (offline set). Water: shared simulator. Plans use only information available at t0;",
    "scores use the levels that actually occurred when evacuees passed each point.",
    "",
  ];
  for (const type of ["all", ...SCENARIO_TYPES]) {
    const subset = rows.filter((r) => type === "all" || r.type === type);
    lines.push(`## ${type === "all" ? "All scenarios" : `Scenario: ${type}`}`, "", `| Policy | ${METRICS.map((m) => m[1]).join(" | ")} |`, `|---|${METRICS.map(() => "---:").join("|")}|`);
    for (const p of POLICIES) {
      const pr = subset.filter((r) => r.policy === p);
      const cells = METRICS.map(([k, , d]) => {
        const { m, ci } = meanCi(pr.map((r) => r[k]));
        return `${m.toFixed(d)} ± ${ci.toFixed(d)}`;
      });
      lines.push(`| ${POLICY_LABEL[p]} | ${cells.join(" | ")} |`);
    }

    // paired comparison: proposed vs the conventional "avoid current floods" router, same scenarios
    const key = (r) => `${r.type}|${r.seed}`;
    const base = Object.fromEntries(subset.filter((r) => r.policy === "snapshot").map((r) => [key(r), r]));
    const prop = subset.filter((r) => r.policy === "combined");
    const diff = prop.map((r) => r.enRouteKmPerEvacuee - base[key(r)].enRouteKmPerEvacuee);
    const wins = diff.filter((d) => d < -1e-6).length;
    const losses = diff.filter((d) => d > 1e-6).length;
    const { m, ci } = meanCi(diff);
    lines.push("", `Proposed vs "avoid current floods", avoidable flooded km per evacuee: mean difference ${m.toFixed(3)} ± ${ci.toFixed(3)} (negative = proposed better); better in ${wins}, worse in ${losses}, tied in ${diff.length - wins - losses} of ${diff.length} scenarios.`, "");
  }
  fs.writeFileSync(path.join(outDir, "summary.md"), lines.join("\n"));
  console.log(lines.join("\n"));
}

main();
