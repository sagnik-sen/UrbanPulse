// Priority evacuation experiment: registered vulnerable residents placed first (planWithPriority)
// against the proposed policy with everyone treated equally (forecast-aware costs, single-stage
// optimal assignment, the policy in experiments/run.js).
//
//   node experiments/priority.js [--seeds 200] [--out priority]
//
// Same scenarios as run.js: same seeds, storms, water, departure schedules, shelters (with the same
// occupancy draws) and committed road routes (routes.json). run.js runs its experiment when loaded
// and exports nothing, so buildScenario and withDepartures are copied from it; keep them in sync.
//
// Pre-declared before any results were seen (not retuned after): VULNERABLE_SHARE, MIX, the shelter
// accessibility in simulator.js, the three tiers and the metrics below.
const fs = require("node:fs");
const path = require("node:path");
const { createZones, createShelters, stepZones, injectStorm, seededRng } = require("../simulator");
const { forecast } = require("../forecast");
const { forecastRisk } = require("../risk");
const { planGroups, planWithPriority } = require("../planner");
const { summarize } = require("../vulnerable");

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]]] : acc), []));
const SEEDS = Number(args.seeds) || 200;
const OUT_NAME = args.out || "priority";

// ASSUMPTION (not measured for Chennai): share of each evacuating zone's people who are registered as
// needing help, with the Census-style split below. Elderly 50%, mobility 25%, medical 15%, infant 10%.
const VULNERABLE_SHARE = 0.08;
const MIX = { elderly: 0.5, mobility: 0.25, medical: 0.15, infant: 0.1 };

const STORM_DECAY = 0.97;
const SIM_MIN_PER_TICK = 2;
const WARNING = 40;
const DANGER = 70;
const FORECAST_WINDOW = 30;
const FORECAST_STEPS = 60;
const FUTURE_TICKS = 60;
const TRIGGER_STEPS = 15;
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

// copied from run.js buildScenario (same random draws in the same order)
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

  for (const s of shelters) s.occupancy = Math.floor(rng() * 0.6 * s.capacity);

  let evacZones = planningView
    .filter((z) => z.risk === "danger" || z.forecast.slice(0, TRIGGER_STEPS).some((p) => p.mean >= DANGER))
    .map((z) => z.id);
  if (evacZones.length === 0) evacZones = shuffle(rng, planningView.map((z) => z.id)).slice(0, 1 + Math.floor(rng() * 2));

  const groups = [];
  for (const zoneId of evacZones) {
    const people = 200 + Math.floor(rng() * 301);
    const origins = ORIGINS.filter((o) => o.zoneId === zoneId);
    origins.forEach((o, i) => groups.push({ origin: o, people: Math.floor(people / origins.length) + (i < people % origins.length ? 1 : 0) }));
  }

  const delayRng = seededRng(seed * 104729 + 17);
  const staggered = groups.map(() => SIM_MIN_PER_TICK * Math.round((delayRng() * MAX_STAGGER_MIN) / SIM_MIN_PER_TICK));
  return { seed, type, planningView, shelters, groups, staggered };
}

// copied from run.js withDepartures
function withDepartures(sc, mode) {
  return { ...sc, mode, groups: sc.groups.map((g, i) => ({ ...g, delay: mode === "staggered" ? sc.staggered[i] : 0 })) };
}

// Registrations for the evacuating zones, as the server would hold them: a deterministic split of
// each zone's people (no random draws, so the water and the groups stay identical to run.js).
function registrationsFor(groups) {
  const people = zonePeople(groups);
  const records = [];
  for (const [zoneId, n] of Object.entries(people)) {
    const total = Math.round(n * VULNERABLE_SHARE);
    const elderly = Math.round(total * MIX.elderly);
    const mobility = Math.round(total * MIX.mobility);
    const medical = Math.round(total * MIX.medical);
    const counts = { elderly, mobility, medical, infant: total - elderly - mobility - medical };
    for (const [category, count] of Object.entries(counts)) if (count > 0) records.push({ zoneId, category, count });
  }
  return summarize(records);
}

function zonePeople(groups) {
  const people = {};
  for (const g of groups) people[g.origin.zoneId] = (people[g.origin.zoneId] ?? 0) + g.people;
  return people;
}

// Single-stage plans carry no tier. There, the vulnerable are assumed to be a uniform share of each
// group, so they get the same bed and accessible-shelter odds as everyone else in that group.
function measure(plan, reg, people) {
  const tiered = Boolean(plan.tiers);
  let vulAssigned = 0;
  let vulTravel = 0;
  let accPlaced = 0;
  let genAssigned = 0;
  let genTravel = 0;
  for (const a of plan.assignments) {
    const zone = a.group.origin.zoneId;
    const r = reg[zone];
    const vulShare = r ? r.total / people[zone] : 0;
    const accShare = r ? (r.mobility + r.medical) / people[zone] : 0;
    const p = a.people;
    const d = a.route.durationMin;
    const vul = tiered ? (a.tier === "accessible" || a.tier === "priority" ? p : 0) : p * vulShare;
    const acc = tiered ? (a.tier === "accessible" ? p : 0) : p * accShare;
    const gen = tiered ? (a.tier === "general" ? p : 0) : p * (1 - vulShare);
    vulAssigned += vul;
    vulTravel += vul * d;
    if (a.shelter.accessible) accPlaced += acc;
    genAssigned += gen;
    genTravel += gen * d;
  }
  const evacuees = Object.values(people).reduce((s, x) => s + x, 0);
  const vulTotal = Object.values(reg).reduce((s, r) => s + r.total, 0);
  const accTotal = Object.values(reg).reduce((s, r) => s + r.mobility + r.medical, 0);
  const genTotal = evacuees - vulTotal;
  const vulUnassigned = vulTotal - vulAssigned;
  const genUnassigned = genTotal - genAssigned;
  return {
    evacuees,
    vulTotal,
    pctWithoutBed: (100 * (vulUnassigned + genUnassigned)) / evacuees,
    vulPctWithoutBed: (100 * vulUnassigned) / vulTotal,
    accPctAccessible: (100 * accPlaced) / accTotal,
    vulMeanTravelMin: vulAssigned ? vulTravel / vulAssigned : 0,
    genPctWithoutBed: (100 * genUnassigned) / genTotal,
    genMeanTravelMin: genAssigned ? genTravel / genAssigned : 0,
  };
}

const POLICIES = {
  proposed: { label: "Proposed: everyone equal (forecast costs, optimal) [baseline]" },
  priority: { label: "Vulnerable first (planWithPriority)" },
};

// [key, column label, decimals, better direction]
const METRICS = [
  ["pctWithoutBed", "All: % without bed", 2, "lower"],
  ["vulPctWithoutBed", "Vulnerable: % without bed", 2, "lower"],
  ["accPctAccessible", "Accessible-needing: % in accessible shelter", 2, "higher"],
  ["vulMeanTravelMin", "Vulnerable: mean travel (min)", 2, "lower"],
  ["genPctWithoutBed", "General: % without bed", 2, "lower"],
  ["genMeanTravelMin", "General: mean travel (min)", 2, "lower"],
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

function pairedTable(rows) {
  const byKey = {};
  for (const r of rows) byKey[`${r.type}|${r.seed}|${r.mode}|${r.policy}`] = r;
  const scenarios = [...new Set(rows.map((r) => `${r.type}|${r.seed}|${r.mode}`))];
  const lines = [
    "Paired differences (vulnerable first − proposed) over identical scenarios, mean ± 95% CI; `w/l` = scenarios where vulnerable-first is better / worse, judged by each metric's direction.",
    "",
    `| Comparison | ${METRICS.map((m) => m[1]).join(" | ")} |`,
    `|---|${METRICS.map(() => "---:").join("|")}|`,
  ];
  const cells = METRICS.map(([k, , d, better]) => {
    const diffs = scenarios.map((s) => byKey[`${s}|priority`][k] - byKey[`${s}|proposed`][k]);
    const { m, ci } = stats(diffs);
    const w = diffs.filter((x) => (better === "lower" ? x < -1e-9 : x > 1e-9)).length;
    const l = diffs.filter((x) => (better === "lower" ? x > 1e-9 : x < -1e-9)).length;
    return `${fmt(m, d)} ± ${fmt(ci, d)} (${w}/${l})`;
  });
  lines.push(`| Vulnerable first − proposed | ${cells.join(" | ")} |`);
  return lines;
}

function main() {
  const rows = [];
  for (const type of SCENARIO_TYPES) {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const base = buildScenario(seed, type);
      for (const mode of DEPARTURES) {
        const sc = withDepartures(base, mode);
        const reg = registrationsFor(sc.groups);
        const people = zonePeople(sc.groups);
        const risk = forecastRisk(sc.planningView, DANGER, SIM_MIN_PER_TICK);
        const common = { groups: sc.groups, shelters: sc.shelters, candidatesFor: (o, sh) => routeSet.routes[`${o}|${sh}`], risk };
        const runs = {
          proposed: planGroups({ ...common, method: "optimal" }),
          priority: planWithPriority({ ...common, vulnerableByZone: reg }),
        };
        for (const policy of Object.keys(POLICIES)) rows.push({ type, seed, mode, policy, ...measure(runs[policy], reg, people) });
      }
    }
  }

  const outDir = path.join(__dirname, "results");
  fs.mkdirSync(outDir, { recursive: true });
  const header = ["type", "seed", "mode", "policy", "evacuees", "vulTotal", ...METRICS.map((m) => m[0])];
  fs.writeFileSync(path.join(outDir, `${OUT_NAME}.csv`), [header.join(","), ...rows.map((r) => header.map((h) => (typeof r[h] === "number" ? +r[h].toFixed(5) : r[h])).join(","))].join("\n") + "\n");

  const runs = SEEDS * SCENARIO_TYPES.length * DEPARTURES.length;
  const lines = [
    `# Priority evacuation experiment (${OUT_NAME})`,
    "",
    `${SEEDS} seeds × ${SCENARIO_TYPES.length} scenario types × ${DEPARTURES.length} departure modes = ${runs} scenario runs, each planned both ways. Same scenarios as \`results.md\` (seeds, water, shelters, routes); storm decay per tick: ${STORM_DECAY}.`,
    "Plans use only information available at planning time (the same forecast risk model for both). Values: mean ± 95% CI over scenario runs, as in results.md.",
    "",
    "## Assumptions",
    "",
    `- **Vulnerable share: ${VULNERABLE_SHARE * 100}% of each evacuating zone's people** (ASSUMPTION, Census-style; not measured for Chennai). Split of the registered people: elderly ${MIX.elderly * 100}%, mobility ${MIX.mobility * 100}%, medical ${MIX.medical * 100}%, infant ${MIX.infant * 100}% (rounded per zone; infant takes the remainder).`,
    "- Accessible-needing = mobility + medical (40% of the vulnerable, 3.2% of evacuees). Elderly and infants are the priority tier that can use any shelter.",
    "- **Shelter accessibility is ILLUSTRATIVE, not surveyed:** s1 (Velachery), s3 (Sholinganallur) and s5 (Mylapore) are marked accessible; s2, s4 and s6 are not (`accessible` in `simulator.js`).",
    "- Vulnerable first places the tiers in order on the beds left by earlier tiers: accessible-needing people in accessible shelters only, then elderly and infants anywhere, then everyone else. An accessible-needing person with no free accessible bed stays unassigned: there is no fallback to a non-accessible shelter.",
    "- A zone's registered people are shared across its origin groups in proportion to group size, capped at each group's people.",
    "- The proposed policy has no notion of who is vulnerable, so its vulnerable figures assume the vulnerable are a uniform share of each group and get that group's bed and accessible-shelter odds.",
    "- Accessible-needing % = people placed in an accessible shelter ÷ all accessible-needing people (placed or not). Mean travel is over the people assigned.",
    "",
  ];
  for (const mode of ["all", ...DEPARTURES]) {
    const subset = rows.filter((r) => mode === "all" || r.mode === mode);
    const title = mode === "all" ? "All scenarios" : `Departures: ${mode}`;
    lines.push(`## ${title}`, "", ...policyTable(subset), "", ...pairedTable(subset), "");
  }
  lines.push("## Appendix: by scenario type and departure mode", "");
  for (const type of SCENARIO_TYPES) for (const mode of DEPARTURES) {
    lines.push(`### ${type}, ${mode}`, "", ...policyTable(rows.filter((r) => r.type === type && r.mode === mode)), "");
  }
  fs.writeFileSync(path.join(outDir, `${OUT_NAME}.md`), lines.join("\n"));
  console.log(lines.slice(0, lines.indexOf("## Appendix: by scenario type and departure mode")).join("\n"));
}

main();
