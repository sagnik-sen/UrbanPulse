// Evacuation policy experiment.
//
//   node experiments/run.js [--seeds 200] [--storm-decay 0.97] [--out results]
//
// Each seeded scenario: simulate to a planning time t0; every policy plans using only what is
// known at t0 (current levels + forecast); then the simulation continues and plans are scored
// against the water levels that ACTUALLY occurred when evacuees passed each point.
// Storms starting after t0 are invisible to every planner except the perfect-foresight bound.
//
// Pre-declared primary metrics (fixed before the revised run; not retuned after):
//   % without a bed, total flooded km per evacuee, mean travel, worst travel, % sent to a flooded shelter.
// Secondary: avoidable (en-route, outside own zone) flooded km per evacuee.
const fs = require("node:fs");
const path = require("node:path");
const { createZones, createShelters, stepZones, injectStorm, seededRng } = require("../simulator");
const { forecast } = require("../forecast");
const { snapshotRisk, forecastRisk, oracleRisk, distanceKm } = require("../risk");
const { routeExposure } = require("../evacuation");
const { planGroups, shifted } = require("../planner");

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]]] : acc), []));
const SEEDS = Number(args.seeds) || 200;
const STORM_DECAY = Number(args["storm-decay"]) || 0.97;
const OUT_NAME = args.out || "results";

const SIM_MIN_PER_TICK = 2;
const WARNING = 40;
const DANGER = 70;
const FORECAST_WINDOW = 30;
const FORECAST_STEPS = 60;
const FUTURE_TICKS = 60; // 2 simulated hours past t0; covers the latest departure (40 min) + longest trip
const TRIGGER_STEPS = 15; // evacuate zones in danger now or forecast to breach within 30 min
const EXPOSED_KM = 0.2;
const MAX_STAGGER_MIN = 40;
const SCENARIO_TYPES = ["rising", "receding", "surprise", "calm"];
const DEPARTURES = ["immediate", "staggered"];

const routeSet = JSON.parse(fs.readFileSync(path.join(__dirname, "routes.json"), "utf8"));
const ORIGINS = routeSet.origins;

const riskLabel = (level) => (level >= DANGER ? "danger" : level >= WARNING ? "warning" : "safe");
const shuffle = (rng, arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const between = (rng, lo, hi) => lo + rng() * (hi - lo);

function buildScenario(seed, type) {
  const rng = seededRng(seed * 7919 + SCENARIO_TYPES.indexOf(type));
  const zones = createZones();
  const shelters = createShelters();
  const t0 = 80 + Math.floor(rng() * 120);

  const storms = [];
  for (const zoneId of shuffle(rng, zones.map((z) => z.id)).slice(0, 1 + Math.floor(rng() * 2))) {
    if (type === "rising") storms.push({ zoneId, start: t0 - 2 - Math.floor(rng() * 5), duration: 12 + Math.floor(rng() * 13), total: between(rng, 45, 75) });
    if (type === "receding") storms.push({ zoneId, start: t0 - 25 - Math.floor(rng() * 16), duration: 6 + Math.floor(rng() * 5), total: between(rng, 55, 80) });
    if (type === "surprise") storms.push({ zoneId, start: t0 + 2 + Math.floor(rng() * 9), duration: 8 + Math.floor(rng() * 8), total: between(rng, 45, 75) });
  }

  const history = Object.fromEntries(zones.map((z) => [z.id, []]));
  const future = Object.fromEntries(zones.map((z) => [z.id, []]));
  let planningView = null;
  for (let t = 1; t <= t0 + FUTURE_TICKS; t++) {
    for (const s of storms) if (t >= s.start && t < s.start + s.duration) injectStorm(zones, s.zoneId, s.total / s.duration);
    stepZones(zones, t, rng, { stormDecay: STORM_DECAY });
    for (const z of zones) (t <= t0 ? history : future)[z.id].push(z.level);
    if (t === t0) {
      planningView = zones.map((z) => ({
        id: z.id, lat: z.lat, lng: z.lng, level: z.level, risk: riskLabel(z.level),
        forecast: forecast(history[z.id].slice(-FORECAST_WINDOW), FORECAST_STEPS),
      }));
    }
  }
  const actual = Object.fromEntries(zones.map((z) => [z.id, [history[z.id][t0 - 1], ...future[z.id]]]));

  for (const s of shelters) s.occupancy = Math.floor(rng() * 0.6 * s.capacity);

  let evacZones = planningView
    .filter((z) => z.risk === "danger" || z.forecast.slice(0, TRIGGER_STEPS).some((p) => p.mean >= DANGER))
    .map((z) => z.id);
  if (evacZones.length === 0) evacZones = shuffle(rng, planningView.map((z) => z.id)).slice(0, 1 + Math.floor(rng() * 2)); // precautionary

  const groups = [];
  for (const zoneId of evacZones) {
    const people = 200 + Math.floor(rng() * 301);
    const origins = ORIGINS.filter((o) => o.zoneId === zoneId);
    origins.forEach((o, i) => groups.push({ origin: o, people: Math.floor(people / origins.length) + (i < people % origins.length ? 1 : 0) }));
  }

  // departure schedule and greedy processing order come from their own streams, so the water is identical across modes
  const delayRng = seededRng(seed * 104729 + 17);
  const staggered = groups.map(() => SIM_MIN_PER_TICK * Math.round((delayRng() * MAX_STAGGER_MIN) / SIM_MIN_PER_TICK));
  const order = shuffle(seededRng(seed * 15485863 + 3), groups.map((_, i) => i));

  return { seed, type, planningView, actual, shelters, groups, staggered, order };
}

function withDepartures(sc, mode) {
  return { ...sc, mode, groups: sc.groups.map((g, i) => ({ ...g, delay: mode === "staggered" ? sc.staggered[i] : 0 })) };
}

const POLICIES = {
  nearest: { label: "Nearest shelter", assign: "none" },
  snapshot: { label: "Avoid current floods", risk: "snapshot", assign: "independent" },
  snapshot0: { label: "Avoid current floods, no warning caution [ablation]", risk: "snapshot0", assign: "independent" },
  forecast: { label: "Forecast-aware", risk: "forecast", assign: "independent" },
  snapshotGreedy: { label: "Avoid current floods + greedy capacity", risk: "snapshot", assign: "greedy" },
  forecastGreedy: { label: "Forecast-aware + greedy capacity", risk: "forecast", assign: "greedy" },
  capacity: { label: "Avoid current floods + optimal capacity", risk: "snapshot", assign: "optimal" },
  combined: { label: "**Forecast-aware + optimal capacity (proposed)**", risk: "forecast", assign: "optimal" },
  oracle: { label: "Perfect foresight + optimal capacity [upper bound]", risk: "oracle", assign: "optimal" },
};

function plan(policyKey, sc) {
  const policy = POLICIES[policyKey];
  if (policy.assign === "none") {
    const open = sc.shelters.filter((s) => s.capacity - s.occupancy > 0);
    const out = [];
    for (const g of sc.groups) {
      const shelter = [...open].sort((a, b) => distanceKm(g.origin, a) - distanceKm(g.origin, b))[0];
      const route = routeSet.routes[`${g.origin.id}|${shelter.id}`].reduce((a, b) => (b.durationMin < a.durationMin ? b : a));
      out.push({ group: g, shelter, route, people: g.people });
    }
    return { assignments: out, unassigned: 0 };
  }

  const risk = {
    snapshot: () => snapshotRisk(sc.planningView),
    snapshot0: () => snapshotRisk(sc.planningView, { warningWeight: 0 }),
    forecast: () => forecastRisk(sc.planningView, DANGER, SIM_MIN_PER_TICK),
    oracle: () => oracleRisk(sc.planningView, sc.actual, DANGER, SIM_MIN_PER_TICK),
  }[policy.risk]();

  return planGroups({
    groups: sc.groups,
    shelters: sc.shelters,
    candidatesFor: (o, sh) => routeSet.routes[`${o}|${sh}`],
    risk,
    method: policy.assign,
    order: sc.order,
  });
}

function evaluate(sc, { assignments, unassigned }) {
  const oracle = oracleRisk(sc.planningView, sc.actual, DANGER, SIM_MIN_PER_TICK);
  const total = sc.groups.reduce((s, g) => s + g.people, 0);
  let floodKm = 0;
  let enRouteKm = 0;
  let floodedShelter = 0;
  let travel = 0;
  let worst = 0;
  const arrivals = {};
  for (const a of assignments) {
    const truth = shifted(oracle, a.group.delay);
    const ownZone = a.group.origin.zoneId;
    // en route = outside the zone you're leaving; that's the part route choice can change
    const enRouteTruth = { at: (p, m) => { const r = truth.at(p, m); return r.zoneId === ownZone ? { p: 0, zoneId: r.zoneId } : r; } };
    floodKm += routeExposure(a.route, truth).expectedFloodKm * a.people;
    enRouteKm += routeExposure(a.route, enRouteTruth).expectedFloodKm * a.people;
    if (truth.at(a.shelter, a.route.durationMin).p === 1) floodedShelter += a.people;
    travel += a.route.durationMin * a.people;
    worst = Math.max(worst, a.route.durationMin);
    arrivals[a.shelter.id] = (arrivals[a.shelter.id] || 0) + a.people;
  }
  const overflow = sc.shelters.reduce((s, sh) => s + Math.max(0, (arrivals[sh.id] || 0) - (sh.capacity - sh.occupancy)), 0);
  return {
    pctWithoutBed: (100 * (overflow + unassigned)) / total,
    floodKmPerEvacuee: floodKm / total,
    meanTravelMin: travel / Math.max(1, total - unassigned),
    worstTravelMin: worst,
    pctFloodedShelter: (100 * floodedShelter) / total,
    enRouteKmPerEvacuee: enRouteKm / total,
  };
}

const METRICS = [
  ["pctWithoutBed", "% without bed", 1],
  ["floodKmPerEvacuee", "Flooded km / evacuee", 3],
  ["meanTravelMin", "Mean travel (min)", 2],
  ["worstTravelMin", "Worst travel (min)", 1],
  ["pctFloodedShelter", "% to flooded shelter", 2],
  ["enRouteKmPerEvacuee", "En-route flooded km / evacuee (secondary)", 4],
];

const COMPARISONS = [
  ["forecast", "snapshot", "Forecast vs current-flood avoidance (both independent)"],
  ["snapshot0", "snapshot", "Ablation: current-flood avoidance without vs with warning caution"],
  ["forecast", "snapshot0", "Forecast vs current-flood avoidance without warning caution"],
  ["capacity", "snapshotGreedy", "Optimal vs greedy assignment (current-flood costs)"],
  ["combined", "forecastGreedy", "Optimal vs greedy assignment (forecast costs)"],
  ["combined", "capacity", "Forecast vs current-flood costs (both optimal assignment)"],
  ["combined", "oracle", "Proposed vs perfect foresight (gap to upper bound)"],
];

const stats = (xs) => {
  const n = xs.length;
  const m = xs.reduce((s, x) => s + x, 0) / n;
  const sd = Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, n - 1));
  return { m, ci: (1.96 * sd) / Math.sqrt(n) };
};
const fmt = (x, d) => (Math.abs(x) < 0.5 * 10 ** -d ? (0).toFixed(d) : x.toFixed(d));

function policyTable(rows) {
  const lines = [`| Policy | ${METRICS.map((m) => m[1]).join(" | ")} |`, `|---|${METRICS.map(() => "---:").join("|")}|`];
  for (const [key, p] of Object.entries(POLICIES)) {
    const pr = rows.filter((r) => r.policy === key);
    lines.push(`| ${p.label} | ${METRICS.map(([k, , d]) => { const { m, ci } = stats(pr.map((r) => r[k])); return `${fmt(m, d)} ± ${fmt(ci, d)}`; }).join(" | ")} |`);
  }
  return lines;
}

function comparisonTable(rows) {
  const byKey = {};
  for (const r of rows) byKey[`${r.type}|${r.seed}|${r.mode}|${r.policy}`] = r;
  const scenarios = [...new Set(rows.map((r) => `${r.type}|${r.seed}|${r.mode}`))];
  const lines = [
    "Paired differences (A − B) over identical scenarios, mean ± 95% CI; `w/l` = scenarios where A is better / worse (lower is better for every metric).",
    "",
    `| A vs B | ${METRICS.map((m) => m[1]).join(" | ")} |`,
    `|---|${METRICS.map(() => "---:").join("|")}|`,
  ];
  for (const [a, b, label] of COMPARISONS) {
    const cells = METRICS.map(([k, , d]) => {
      const diffs = scenarios.map((s) => byKey[`${s}|${a}`][k] - byKey[`${s}|${b}`][k]);
      const { m, ci } = stats(diffs);
      const w = diffs.filter((x) => x < -1e-9).length;
      const l = diffs.filter((x) => x > 1e-9).length;
      return `${fmt(m, d)} ± ${fmt(ci, d)} (${w}/${l})`;
    });
    lines.push(`| ${label} | ${cells.join(" | ")} |`);
  }
  return lines;
}

function main() {
  const rows = [];
  for (const type of SCENARIO_TYPES) {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const base = buildScenario(seed, type);
      for (const mode of DEPARTURES) {
        const sc = withDepartures(base, mode);
        const evacuees = sc.groups.reduce((s, g) => s + g.people, 0);
        for (const policy of Object.keys(POLICIES)) rows.push({ type, seed, mode, policy, evacuees, ...evaluate(sc, plan(policy, sc)) });
      }
    }
  }

  const outDir = path.join(__dirname, "results");
  fs.mkdirSync(outDir, { recursive: true });
  const header = ["type", "seed", "mode", "policy", "evacuees", ...METRICS.map((m) => m[0])];
  fs.writeFileSync(path.join(outDir, `${OUT_NAME}.csv`), [header.join(","), ...rows.map((r) => header.map((h) => (typeof r[h] === "number" ? +r[h].toFixed(5) : r[h])).join(","))].join("\n") + "\n");

  const lines = [
    `# Evacuation policy experiment (${OUT_NAME})`,
    "",
    `${SEEDS} seeds × ${SCENARIO_TYPES.length} scenario types × ${DEPARTURES.length} departure modes = ${SEEDS * SCENARIO_TYPES.length * DEPARTURES.length} scenario runs. Storm decay per tick: ${STORM_DECAY}.`,
    "Routes: real OSRM road routes (offline set, `routes.json`). Water: shared simulator. Plans use only information available at t0;",
    "scores use the levels that actually occurred when evacuees passed each point. Values: mean ± 95% CI. Lower is better for every metric.",
    "",
  ];
  for (const mode of ["all", ...DEPARTURES]) {
    const subset = rows.filter((r) => mode === "all" || r.mode === mode);
    const title = mode === "all" ? "All scenarios" : `Departures: ${mode}`;
    lines.push(`## ${title}`, "", ...policyTable(subset), "", ...comparisonTable(subset), "");
  }
  lines.push("## Appendix: by scenario type and departure mode", "");
  for (const type of SCENARIO_TYPES) for (const mode of DEPARTURES) {
    lines.push(`### ${type}, ${mode}`, "", ...policyTable(rows.filter((r) => r.type === type && r.mode === mode)), "");
  }
  fs.writeFileSync(path.join(outDir, `${OUT_NAME}.md`), lines.join("\n"));
  console.log(lines.slice(0, lines.indexOf("## Appendix: by scenario type and departure mode")).join("\n"));
}

main();
