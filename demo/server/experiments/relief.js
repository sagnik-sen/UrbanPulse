// Flood relief collection experiment: walk-in queues versus scheduled slots at ration shops.
//
//   node experiments/relief.js
//
// 200 seeded scenarios. Each seed draws one set of arrival times for 2,000 households in one zone served
// by two shops (60 households an hour each). Two arms run for 3 collection days:
//   (a) walk-in: every household turns up at a random time between 9:00 and 17:00 at a random shop of the
//       zone; whoever is still unserved at 17:00 comes back the next day at a random time, at a random shop
//   (b) scheduled: relief.schedule() gives each household a shop and a one-hour slot up front; it arrives at
//       a uniform random time within that hour. Anyone still unserved at 17:00 comes back under the same
//       rule as in (a)
// Writes results/relief.md and results/relief.csv (the csv is git-ignored).
// Pre-declared before the first run; the parameters below are not tuned after seeing results.
const fs = require("node:fs");
const path = require("node:path");
const { performance } = require("node:perf_hooks");
const { seededRng } = require("../simulator");
const { schedule } = require("../relief");

const SEEDS = 200;
const HOUSEHOLDS = 2000;
const DAYS = 3;
const PER_HOUR = 60; // ILLUSTRATIVE rate, the same for both shops
const SHOP_COUNT = 2;
const OPEN_START = 9 * 60; // minutes after midnight
const BREAK_START = 13 * 60;
const BREAK_END = 15 * 60;
const CLOSE = 17 * 60;

const SHOPS = Array.from({ length: SHOP_COUNT }, (_, i) => ({ id: `shop${i + 1}`, zoneId: "demo", perHour: PER_HOUR }));

const ASSUMPTIONS = [
  "Shops and rates are ILLUSTRATIVE: one zone, two shops, 60 households an hour each. Real ration shop throughput was not measured.",
  "Households: 2,000 in the zone, each with one card and one payment to collect. No households are lost to no-shows, duplicate cards or wrong shops.",
  "Service: one household at a time per shop, 60 / perHour minutes each (1 minute here), first come first served. A service starts only while the shop is open: 9:00 to 13:00 and 15:00 to 17:00 (six service hours a day, as in the 2023 scheme).",
  "Lunch break: a household that arrives between 13:00 and 15:00 waits in the queue until 15:00. Walk-in arrivals are drawn over the whole 9:00 to 17:00 window as the task specifies, so they include the break.",
  "Walk-in arrivals: on day 1 every household arrives at a uniform random minute between 9:00 and 17:00 at a uniform random shop of the zone. Households not served by 17:00 leave and come back next day under the same rule.",
  "Scheduled arrivals: schedule() from relief.js assigns each household a shop and a day and hour before anyone arrives (3 days, the same 9:00 to 17:00 service hours as the walk-in arm). Each household arrives at a uniform random minute within its assigned hour, at its assigned shop, on its assigned day.",
  "Scheduled return rule: a household not served by 17:00 on its assigned day comes back the next day at a uniform random time between 9:00 and 17:00 at a uniform random shop, the same rule as walk-ins. The schedule is not rebuilt after the first day.",
  "Three days: a household still unserved at 17:00 on day 3 counts as unserved after 3 days. There is no fourth day.",
  "Wait in queue (primary): for each household, the sum over all its visits of the minutes from arrival to the start of service, or to 17:00 for a visit that ends unserved. This includes the break and every overnight return's waiting until closing, but not the time between a return and the next visit. The metric is the mean and p90 over all 2,000 households, served or not.",
  "Max queue: the largest number of people at one shop who have arrived but not yet started service, measured at each arrival, over all shops and days. People waiting through the break count.",
  "Unserved after 3 days: the percentage of households never served by the end of day 3.",
  "Served on first visit: the percentage of households served on their first visit (day 1 for walk-in, the assigned day for scheduled).",
  "Draws: each arm has its own random stream per seed (seed-specific, not shared), so the arms are compared across seeds, not on identical arrivals. The scheduled assignment (shop, day, hour) is identical in every seed because schedule() is deterministic; only arrival minutes vary.",
  "CI: mean ± 1.96 sd / sqrt(n) across the 200 seeds, the convention of run.js and rescue.js.",
  "Not modelled: travel time to the shop, identity checks, staff breaks, power or system outages, shop closures, and any household that gives up.",
];

// one shop on one day. Customers are served one at a time in arrival order. A service may start only
// while the shop is open; a customer who would start after 17:00 is unserved (start null). Returns the
// largest number of people in line at any arrival.
function serveDay(customers, perHour) {
  const duration = 60 / perHour;
  const sorted = [...customers].sort((a, b) => a.t - b.t);
  let free = 0;
  for (const c of sorted) {
    let start = Math.max(c.t, free);
    if (start >= BREAK_START && start < BREAK_END) start = BREAK_END;
    if (start >= CLOSE) {
      c.start = null;
      continue;
    }
    c.start = start;
    free = start + duration;
  }
  const starts = sorted.filter((c) => c.start != null).map((c) => c.start);
  let maxQueue = 0;
  let p = 0;
  sorted.forEach((c, i) => {
    while (p < starts.length && starts[p] <= c.t) p++;
    maxQueue = Math.max(maxQueue, i + 1 - p);
  });
  return maxQueue;
}

// after a day, customers who got no service go home; each visit adds its queue minutes to the household
function settleDay(list) {
  for (const c of list) {
    c.h.queueMin += (c.start ?? CLOSE) - c.t;
    if (c.h.firstVisit && c.start != null) c.h.firstVisitServed = true;
    c.h.firstVisit = false;
  }
  return list.filter((c) => c.start == null).map((c) => c.h);
}

// returns every household, the number still unserved after the last day, and the largest queue
function walkIn(rng) {
  const hh = Array.from({ length: HOUSEHOLDS }, () => ({ queueMin: 0, firstVisit: true, firstVisitServed: false }));
  let pending = hh;
  let maxQueue = 0;
  for (let day = 1; day <= DAYS; day++) {
    const shops = Array.from({ length: SHOP_COUNT }, () => []);
    for (const h of pending) {
      const shop = Math.floor(rng() * SHOP_COUNT);
      shops[shop].push({ h, t: OPEN_START + rng() * (CLOSE - OPEN_START) });
    }
    pending = [];
    for (const list of shops) {
      maxQueue = Math.max(maxQueue, serveDay(list, PER_HOUR));
      pending = pending.concat(settleDay(list));
    }
  }
  return { hh, unserved: pending.length, maxQueue };
}

// first visits happen on the assigned day within the assigned hour; returns after a miss use the walk-in rule
function scheduled(rng, assignment) {
  const hh = assignment.map((a) => ({ queueMin: 0, firstVisit: true, firstVisitServed: false, day: a.day + 1, hour: a.hour, shop: a.shop }));
  let pending = [];
  let maxQueue = 0;
  for (let day = 1; day <= DAYS; day++) {
    const shops = Array.from({ length: SHOP_COUNT }, () => []);
    for (const h of hh) {
      if (h.day !== day) continue;
      shops[h.shop].push({ h, t: h.hour * 60 + rng() * 60 });
    }
    for (const h of pending) {
      shops[Math.floor(rng() * SHOP_COUNT)].push({ h, t: OPEN_START + rng() * (CLOSE - OPEN_START) });
    }
    pending = [];
    for (const list of shops) {
      maxQueue = Math.max(maxQueue, serveDay(list, PER_HOUR));
      pending = pending.concat(settleDay(list));
    }
  }
  return { hh, unserved: pending.length, maxQueue };
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
  const { m, ci, n } = stats(xs);
  return `${fmt(m, d)} ± ${fmt(ci, d)} (n=${n})`;
};

// households are numbered in arrival order, so the assignment is the same for every seed
function metrics(hh, unserved, maxQueue) {
  const waits = hh.map((h) => h.queueMin);
  return {
    meanWait: mean(waits),
    p90Wait: percentile(waits, 0.9),
    maxQueue,
    pctUnserved: (100 * unserved) / hh.length,
    pctFirstVisit: (100 * hh.filter((h) => h.firstVisitServed).length) / hh.length,
  };
}

function main() {
  const started = performance.now();
  const demo = Array.from({ length: HOUSEHOLDS }, () => ({ zoneId: "demo" }));
  const assigned = schedule(demo, SHOPS, { days: DAYS, startHour: 9, endHour: 17 });
  if (assigned.some((a) => a == null)) throw new Error("schedule ran out of slots for this scenario");
  const assignment = assigned.map((a) => ({ day: a.day, hour: a.hour, shop: Number(a.shopId.slice(4)) - 1 }));

  const rows = [];
  for (let seed = 1; seed <= SEEDS; seed++) {
    const wi = walkIn(seededRng(seed * 104729 + 1));
    rows.push({ seed, arm: "walk-in", ...metrics(wi.hh, wi.unserved, wi.maxQueue) });
    const sc = scheduled(seededRng(seed * 104729 + 2), assignment);
    rows.push({ seed, arm: "scheduled", ...metrics(sc.hh, sc.unserved, sc.maxQueue) });
  }
  const runtimeS = (performance.now() - started) / 1000;

  const outDir = path.join(__dirname, "results");
  fs.mkdirSync(outDir, { recursive: true });
  const header = ["seed", "arm", "meanWait", "p90Wait", "maxQueue", "pctUnserved", "pctFirstVisit"];
  const csvCell = (v) => (typeof v === "number" ? +v.toFixed(5) : v);
  fs.writeFileSync(path.join(outDir, "relief.csv"), [header.join(","), ...rows.map((r) => header.map((h) => csvCell(r[h])).join(","))].join("\n") + "\n");

  const METRICS = [
    ["meanWait", "Mean wait in queue (min, all households)", 1],
    ["p90Wait", "p90 wait in queue (min)", 1],
    ["maxQueue", "Max queue at any shop (people)", 1],
    ["pctUnserved", "% unserved after 3 days", 2],
    ["pctFirstVisit", "% served on first visit", 2],
  ];
  const table = [
    `| Arm | ${METRICS.map((m) => m[1]).join(" | ")} |`,
    `|---|${METRICS.map(() => "---:").join("|")}|`,
  ];
  for (const arm of ["walk-in", "scheduled"]) {
    const ar = rows.filter((r) => r.arm === arm);
    table.push(`| ${arm} | ${METRICS.map(([k, , d]) => cell(ar.map((r) => r[k]), d)).join(" | ")} |`);
  }

  const lines = [
    "# Flood relief: walk-in queues versus scheduled slots",
    "",
    `${SEEDS} seeds, each with ${HOUSEHOLDS} households in one zone served by ${SHOP_COUNT} ration shops at ${PER_HOUR} households an hour each, over ${DAYS} collection days. Values: mean ± 95% CI over seeds (n = seeds). Lower is better for waits, queues and unserved; higher is better for first-visit service.`,
    "",
    "Background: after Cyclone Michaung (December 2023) Tamil Nadu paid Rs 6,000 per ration card to about 24.25 lakh families (Rs 1,486 crore). Families collected cash at their ration shop on a token's date and time; people without tokens had to apply at the shops, and there were queues and \"chaos in PDS shops\". Sources: https://www.dtnext.in/news/chennai/cyclonic-michaung-cm-stalin-launches-rs-6000-one-time-assistance-scheme-754998 and https://www.outlookindia.com/national/tamil-nadu-govt-to-provide-rs-6-000-flood-relief-to-ration-cardholders-in-4-flood-affected-districts-news-336002 .",
    "",
    `Runtime: ${runtimeS.toFixed(1)} s on this machine.`,
    "",
    "## Results",
    "",
    ...table,
    "",
    "## Assumptions",
    "",
    ...ASSUMPTIONS.map((a) => `- ${a}`),
    "",
    "## Parameters",
    "",
    `Households ${HOUSEHOLDS}; shops ${SHOP_COUNT} at ${PER_HOUR} an hour; service hours 9:00-13:00 and 15:00-17:00; days ${DAYS}; seeds ${SEEDS}.`,
    "",
  ];
  fs.writeFileSync(path.join(outDir, "relief.md"), lines.join("\n"));
  console.log(lines.join("\n"));
}

main();
