// Volunteer boat rescue policy experiment.
//
//   node experiments/rescue.js
//
// 200 seeded scenarios of a 6-hour flood event over the six demo zones. Each seed draws one set of
// requests and boats, and both policies run on that same draw (paired comparison):
//   (a) greedy first-come: matchGreedy whenever a request arrives or a boat frees up
//   (b) optimal batch: matchOptimal every 5 minutes
// Writes results/rescue.md and results/rescue.csv (the csv is git-ignored).
// Pre-declared before the first run; the parameters below are not tuned after seeing results.
const fs = require("node:fs");
const path = require("node:path");
const { performance } = require("node:perf_hooks");
const { ZONE_DEFS, SHELTER_DEFS, seededRng } = require("../simulator");
const { distanceKm, ZONE_RADIUS_KM } = require("../risk");
const { matchOptimal, matchGreedy, BOAT_KMH, PRIORITY_MINUTES } = require("../rescue");

const SEEDS = 200;
const HORIZON_MIN = 360;
const REQUESTS_PER_MIN = 0.5;
const PEOPLE_EXTRA_MEAN = 2; // people = 1 + Poisson(2), capped
const MAX_PEOPLE = 12;
const NEED_PROB = { medical: 0.1, elderly: 0.2, child: 0.2, disabled: 0.05 };
const BOAT_COUNT = 8;
const CAP_MIN = 4;
const CAP_MAX = 12;
const LOAD_MIN = 10;
const UNLOAD_MIN = 5;
const OPTIMAL_EVERY_MIN = 5;
const KM_PER_DEG_LAT = 110.574;
const kmPerDegLng = (lat) => 111.32 * Math.cos((lat * Math.PI) / 180);

const POLICIES = [
  { key: "greedy", label: "Greedy first-come (matchGreedy, on each arrival or boat free)" },
  { key: "optimal", label: "Optimal batch (matchOptimal, every 5 min)" },
];
const METRICS = [
  ["meanWait", "Mean wait to boat (min)", 1],
  ["p90Wait", "p90 wait to boat (min)", 1],
  ["medicalMeanWait", "Mean wait, medical need (min)", 1],
  ["pctNotReached", "% not reached within 6 h", 2],
  ["boatKmPerPerson", "Boat-km per person rescued", 3],
  ["boatKmPerPersonReached", "Boat-km per person, reached legs only (secondary)", 3],
];

// Knuth's method; lambda is small here
function poisson(rng, lambda) {
  const limit = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng();
  } while (p > limit);
  return k - 1;
}

const nearestShelter = (point) => SHELTER_DEFS.reduce((best, s) => (distanceKm(point, s) < distanceKm(point, best) ? s : best));

function buildScenario(seed) {
  const rng = seededRng(seed * 7919 + 1);
  const boats = Array.from({ length: BOAT_COUNT }, (_, i) => {
    const z = ZONE_DEFS[Math.floor(rng() * ZONE_DEFS.length)];
    return { id: `b${i}`, capacity: CAP_MIN + Math.floor(rng() * (CAP_MAX - CAP_MIN + 1)), lat: z.lat, lng: z.lng };
  });
  const requests = [];
  for (let minute = 0; minute < HORIZON_MIN; minute++) {
    const arriving = poisson(rng, REQUESTS_PER_MIN);
    for (let k = 0; k < arriving; k++) {
      const z = ZONE_DEFS[Math.floor(rng() * ZONE_DEFS.length)];
      const radius = ZONE_RADIUS_KM * Math.sqrt(rng()); // uniform over the disc
      const angle = 2 * Math.PI * rng();
      const lat = z.lat + (radius * Math.sin(angle)) / KM_PER_DEG_LAT;
      const lng = z.lng + (radius * Math.cos(angle)) / kmPerDegLng(z.lat);
      const people = Math.min(MAX_PEOPLE, 1 + poisson(rng, PEOPLE_EXTRA_MEAN));
      const needs = Object.keys(NEED_PROB).filter((need) => rng() < NEED_PROB[need]);
      const point = { lat, lng };
      requests.push({ id: `q${requests.length}`, minute, ts: minute * 60000, lat, lng, people, needs, shelter: nearestShelter(point), status: "open" });
    }
  }
  return { seed, boats, requests };
}

// Advances the event minute by minute. Boats are busy from assignment until they unload at the shelter.
function runPolicy(scenario, method) {
  const match = method === "optimal" ? matchOptimal : matchGreedy;
  const fleet = scenario.boats.map((b) => ({ ...b, status: "available", freeAt: 0 }));
  const requests = scenario.requests.map((r) => ({ ...r, status: "open", arrival: null }));
  const arrivalsAt = Array.from({ length: HORIZON_MIN }, () => 0);
  for (const r of requests) arrivalsAt[r.minute] += 1;
  let boatKm = 0;

  for (let m = 0; m < HORIZON_MIN; m++) {
    let freedNow = false;
    for (const b of fleet) {
      if (b.status === "busy" && b.freeAt <= m) {
        if (b.freeAt > m - 1) freedNow = true;
        b.status = "available";
      }
    }
    const due = method === "greedy" ? arrivalsAt[m] > 0 || freedNow : m % OPTIMAL_EVERY_MIN === 0;
    if (!due) continue;

    const byId = new Map(requests.map((r) => [r.id, r]));
    const boatById = new Map(fleet.map((b) => [b.id, b]));
    for (const pair of match(requests.filter((r) => r.minute <= m), fleet, m * 60000)) {
      const r = byId.get(pair.requestId);
      const b = boatById.get(pair.boatId);
      const toRequestKm = distanceKm(b, r);
      const carryKm = distanceKm(r, r.shelter);
      boatKm += toRequestKm + carryKm;
      r.status = "assigned";
      r.arrival = m + pair.minutes;
      r.km = toRequestKm + carryKm;
      b.status = "busy";
      b.freeAt = r.arrival + LOAD_MIN + (carryKm / BOAT_KMH) * 60 + UNLOAD_MIN;
      b.lat = r.shelter.lat;
      b.lng = r.shelter.lng;
    }
  }

  const reached = requests.filter((r) => r.status === "assigned" && r.arrival <= HORIZON_MIN);
  const waits = reached.map((r) => r.arrival - r.minute);
  const medical = reached.filter((r) => r.needs.includes("medical")).map((r) => r.arrival - r.minute);
  const people = reached.reduce((s, r) => s + r.people, 0);
  const reachedKm = reached.reduce((s, r) => s + r.km, 0);
  return {
    requests: requests.length,
    reached: reached.length,
    meanWait: waits.length ? mean(waits) : null,
    p90Wait: waits.length ? percentile(waits, 0.9) : null,
    medicalMeanWait: medical.length ? mean(medical) : null,
    pctNotReached: (100 * (requests.length - reached.length)) / requests.length,
    boatKmPerPerson: people ? boatKm / people : null,
    boatKmPerPersonReached: people ? reachedKm / people : null,
  };
}

const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
const percentile = (xs, p) => [...xs].sort((a, b) => a - b)[Math.ceil(p * xs.length) - 1];
// run.js convention: mean and 1.96 * sd / sqrt(n)
function stats(xs) {
  const n = xs.length;
  const m = mean(xs);
  const sd = Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, n - 1));
  return { m, ci: (1.96 * sd) / Math.sqrt(n), n };
}
const fmt = (x, d) => x.toFixed(d);
const cell = (xs, d) => {
  const clean = xs.filter((x) => x != null);
  const { m, ci, n } = stats(clean);
  return `${fmt(m, d)} ± ${fmt(ci, d)} (n=${n})`;
};

const ASSUMPTIONS = [
  "Time: 1-minute steps over a 6-hour event (360 minutes). A request is stamped with the minute it arrives.",
  "Requests: per minute, a Poisson(0.5) count (a Poisson process at 0.5 per minute overall).",
  "Location: uniform over the disc of radius 1.5 km (ZONE_RADIUS_KM) around a uniformly chosen demo zone centre.",
  "People: 1 + Poisson(2), capped at 12. Needs: medical 0.1, elderly 0.2, child 0.2, disabled 0.05, each independent.",
  "Boats: 8, capacity uniform integer 4 to 12, each starting at a uniformly chosen zone centre.",
  "Speed: 8 km/h (BOAT_KMH) on straight-line distance, for every leg. No road network, no flood effects on speed (assumption).",
  "Service: 10 minutes loading at the request, carry to the nearest demo shelter (straight line from the request), 5 minutes unloading. The boat is free at that shelter afterwards.",
  "Shelter capacity is not modelled: boats carry people to the nearest shelter whatever its occupancy. No boat breakdowns, fuel or daylight limits, and no cancellations.",
  "Greedy: matchGreedy runs in the minute a request arrives or a boat becomes free. Requests take the nearest free boat that can carry them, in arrival order.",
  "Optimal: matchOptimal runs every 5 minutes. Cost = travel minutes less priority minutes (medical 30, disabled 20, elderly 15, child 15; largest need counts) less 0.5 per minute waited.",
  "Matching takes no time. Waits are measured from the arrival minute to the minute the boat reaches the request.",
  "Reached: boat arrives at the request within the 6 hours. Mean wait, p90 wait and medical mean wait use reached requests only, so requests still waiting at the horizon are excluded from them; read them with the % not reached.",
  "Boat-km (primary): straight-line km of every leg (to the request and on to the shelter) of assignments made within the 6 hours, divided by the people on reached requests. Assignments whose pickup falls after the horizon add km but no rescued people, which overstates the figure for a policy that leaves many pickups late.",
  "Boat-km (secondary, added after the first run): the same divided by people, counting only the legs of reached requests. It removes that overstatement, so it is the better comparison of travel per person.",
  "Pairing: each seed's requests and boats are drawn once and both policies run on that draw. CI: mean ± 1.96 sd / sqrt(n) across seeds; a seed with no value for a metric is skipped (n shows the count).",
];

function main() {
  const started = performance.now();
  const rows = [];
  for (let seed = 1; seed <= SEEDS; seed++) {
    const scenario = buildScenario(seed);
    for (const p of POLICIES) rows.push({ seed, policy: p.key, ...runPolicy(scenario, p.key) });
  }
  const runtimeS = (performance.now() - started) / 1000;

  const outDir = path.join(__dirname, "results");
  fs.mkdirSync(outDir, { recursive: true });
  const csvHeader = ["seed", "policy", "requests", "reached", "meanWait", "p90Wait", "medicalMeanWait", "pctNotReached", "boatKmPerPerson", "boatKmPerPersonReached"];
  const csvCell = (v) => (v == null ? "" : typeof v === "number" ? +v.toFixed(5) : v);
  fs.writeFileSync(path.join(outDir, "rescue.csv"), [csvHeader.join(","), ...rows.map((r) => csvHeader.map((h) => csvCell(r[h])).join(","))].join("\n") + "\n");

  const table = [
    `| Policy | ${METRICS.map((m) => m[1]).join(" | ")} |`,
    `|---|${METRICS.map(() => "---:").join("|")}|`,
  ];
  for (const p of POLICIES) {
    const pr = rows.filter((r) => r.policy === p.key);
    table.push(`| ${p.label} | ${METRICS.map(([k, , d]) => cell(pr.map((r) => r[k]), d)).join(" | ")} |`);
  }

  const bySeed = (policy) => new Map(rows.filter((r) => r.policy === policy).map((r) => [r.seed, r]));
  const greedy = bySeed("greedy");
  const optimal = bySeed("optimal");
  const diff = [
    "Paired difference, optimal minus greedy, over identical draws: mean ± 95% CI, then `w/l` = seeds where optimal is better / worse (lower is better for every metric).",
    "",
    `| Metric | Optimal − greedy |`,
    `|---|---:|`,
  ];
  for (const [k, label, d] of METRICS) {
    const pairs = [...greedy.keys()].map((seed) => [greedy.get(seed)[k], optimal.get(seed)[k]]).filter(([g, o]) => g != null && o != null);
    const deltas = pairs.map(([g, o]) => o - g);
    const { m, ci } = stats(deltas);
    const better = deltas.filter((x) => x < -1e-9).length;
    const worse = deltas.filter((x) => x > 1e-9).length;
    diff.push(`| ${label} | ${fmt(m, d)} ± ${fmt(ci, d)} (${better}/${worse}) |`);
  }

  const lines = [
    "# Volunteer boat rescue: dispatch policy experiment",
    "",
    `${SEEDS} seeds, each a 6-hour event with ${BOAT_COUNT} volunteer boats. Values: mean ± 95% CI over seeds (n = seeds with a value). Lower is better for every metric.`,
    `Runtime: ${runtimeS.toFixed(1)} s on this machine.`,
    "",
    "## Results",
    "",
    `Load: on average ${mean(rows.filter((r) => r.policy === "greedy").map((r) => r.requests)).toFixed(0)} requests arrive per run (about ${REQUESTS_PER_MIN * 60} an hour). Reached per run: ${mean(rows.filter((r) => r.policy === "greedy").map((r) => r.reached)).toFixed(0)} greedy, ${mean(rows.filter((r) => r.policy === "optimal").map((r) => r.reached)).toFixed(0)} optimal. Demand exceeds what 8 boats can serve in 6 hours, so the queue grows and most requests stay unreached under both policies; the rates are set by the pre-declared scenario, not tuned.`,
    "",
    ...table,
    "",
    ...diff,
    "",
    "## Assumptions",
    "",
    ...ASSUMPTIONS.map((a) => `- ${a}`),
    "",
    "## Parameters",
    "",
    `Priority minutes ${JSON.stringify(PRIORITY_MINUTES)}; boat speed ${BOAT_KMH} km/h; horizon ${HORIZON_MIN} min; optimal batch every ${OPTIMAL_EVERY_MIN} min; loading ${LOAD_MIN} min; unloading ${UNLOAD_MIN} min.`,
    "",
  ];
  fs.writeFileSync(path.join(outDir, "rescue.md"), lines.join("\n"));
  console.log(lines.join("\n"));
}

main();
