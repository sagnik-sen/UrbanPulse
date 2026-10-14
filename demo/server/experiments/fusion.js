// Sensor + citizen-report fusion experiment (offline simulation).
//
//   node experiments/fusion.js [--seeds 200] [--out fusion]
//
// Citizen behaviour (report rates, trust histories, spam and hoax devices) is modelled, not measured.
// Each seed draws one world (storms, sensor noise, genuine reports) from separate seeded streams,
// so every setting and method is scored on the same water levels.
const fs = require("node:fs");
const path = require("node:path");
const { createZones, stepZones, injectStorm, seededRng } = require("../simulator");
const { normalCdf } = require("../risk");
const { PARAMS, zoneProbability } = require("../fusion");

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]]] : acc), []));
const SEEDS = Number(args.seeds) || 200;
const OUT_NAME = args.out || "fusion";

const SIM_MIN_PER_TICK = 2;
const TICKS_PER_DAY = 720;
const WARMUP = 30;
const TICKS = 240;
const STORMS = 3;
const STORM_MIN = 40;
const STORM_MAX = 70;
const SENSOR_NOISE = 2;
const POOL = 100;
const ESTABLISHED = 60;
const SPAM_DEVICES = 20;
const GENUINE_RATE = { danger: 0.3, warning: 0.05 };
const EPISODE_MIN = 3;
const HOAX_REPORTS = 15;
const HOAX_WINDOW = 5;
const METHODS = ["sensor only", "reports only", "fused"];
const SETTINGS = [
  ...[0, 0.5, 1].flatMap((dropout) => [0, 0.05, 0.2].map((falseRate) => ({ label: `dropout ${dropout} / false ${falseRate}`, dropout, falseRate, hoax: false }))),
  { label: "dropout 0.5 / false 0.05 / hoax", dropout: 0.5, falseRate: 0.05, hoax: true },
];
const STREAM = { world: 1, events: 2, sensors: 3, genuine: 4, spurious: 5 };

const streamFor = (seed, name) => seededRng(seed * 16 + STREAM[name]);
const gaussian = (rng) => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;

function poisson(lambda, rng) {
  if (lambda <= 0) return 0;
  const limit = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng();
  } while (p > limit);
  return k - 1;
}

// maximal runs of true-danger ticks, as [start, end] indices into the scored run
function episodesOf(levels) {
  const out = [];
  let start = -1;
  for (let r = 0; r <= levels.length; r++) {
    const danger = r < levels.length && levels[r] >= PARAMS.DANGER;
    if (danger && start < 0) start = r;
    if (!danger && start >= 0) {
      if (r - start >= EPISODE_MIN) out.push({ start, end: r - 1 });
      start = -1;
    }
  }
  return out;
}

function runScenario(seed, setting) {
  const world = streamFor(seed, "world");
  const events = streamFor(seed, "events");
  const sensors = streamFor(seed, "sensors");
  const genuine = streamFor(seed, "genuine");
  const spurious = streamFor(seed, "spurious");
  const zones = createZones();
  const maxAge = PARAMS.MAX_AGE_HALF_LIVES * PARAMS.HALF_LIFE_TICKS;

  const trust = new Map();
  const genuineIds = zones.map((z) =>
    Array.from({ length: POOL }, (_, i) => {
      const id = `${z.id}-g${i}`;
      if (i < ESTABLISHED) trust.set(id, { a: 2 + Math.floor(events() * 4), b: 3 });
      return id;
    }),
  );
  const spamIds = zones.map((z) =>
    Array.from({ length: SPAM_DEVICES }, (_, i) => {
      const id = `${z.id}-s${i}`;
      trust.set(id, { a: 1, b: 6 });
      return id;
    }),
  );

  const storms = new Map();
  while (storms.size < STORMS) {
    const t = WARMUP + 1 + Math.floor(events() * TICKS);
    if (!storms.has(t)) storms.set(t, { zone: Math.floor(events() * zones.length), amount: STORM_MIN + events() * (STORM_MAX - STORM_MIN) });
  }
  const hoaxTick = WARMUP + 1 + Math.floor(events() * TICKS);
  const offline = zones.map(() => sensors() < setting.dropout);

  const levels = zones.map(() => []);
  const declared = Object.fromEntries(METHODS.map((m) => [m, zones.map(() => [])]));
  const reports = zones.map(() => []);
  let hoaxZone = null;

  for (let t = 1; t <= WARMUP + TICKS; t++) {
    const storm = storms.get(t);
    if (storm) injectStorm(zones, zones[storm.zone].id, storm.amount);
    stepZones(zones, t, world);

    const readings = zones.map((z, i) => {
      const noisy = z.level + SENSOR_NOISE * gaussian(sensors);
      return offline[i] ? null : noisy;
    });

    zones.forEach((z, i) => {
      const rate = z.level >= PARAMS.DANGER ? GENUINE_RATE.danger : z.level >= PARAMS.WARNING ? GENUINE_RATE.warning : 0;
      const severity = z.level >= 85 ? "high" : z.level >= PARAMS.DANGER ? "medium" : "low";
      for (let k = poisson(rate, genuine); k > 0; k--) {
        reports[i].push({ deviceId: genuineIds[i][Math.floor(genuine() * POOL)], severity, tick: t });
      }
      for (let k = poisson(setting.falseRate, spurious); k > 0; k--) {
        const deviceId = spurious() < 0.5 ? spamIds[i][Math.floor(spurious() * SPAM_DEVICES)] : `fresh-${t}-${i}-${k}`;
        reports[i].push({ deviceId, severity: "high", tick: t });
      }
    });

    if (setting.hoax && t === hoaxTick) {
      const candidates = zones.map((z, i) => i).filter((i) => zones[i].level < PARAMS.WARNING);
      if (candidates.length > 0) {
        hoaxZone = candidates[Math.floor(events() * candidates.length)];
        for (let j = 0; j < HOAX_REPORTS; j++) reports[hoaxZone].push({ deviceId: `hoax-${t}-${j}`, severity: "high", tick: t });
      }
    }

    zones.forEach((_, i) => {
      reports[i] = reports[i].filter((r) => r.tick >= t - maxAge);
    });

    if (t <= WARMUP) continue;
    zones.forEach((z, i) => {
      const reading = readings[i];
      levels[i].push(z.level);
      declared["sensor only"][i].push(reading != null && normalCdf(reading, PARAMS.DANGER, PARAMS.SENSOR_SIGMA) >= PARAMS.DECLARE_P);
      declared["reports only"][i].push(zoneProbability({ reading: null, reports: reports[i], now: t, trust }) >= PARAMS.DECLARE_P);
      declared.fused[i].push(zoneProbability({ reading, reports: reports[i], now: t, trust }) >= PARAMS.DECLARE_P);
    });
  }

  const episodes = levels.map(episodesOf);
  const total = episodes.reduce((s, e) => s + e.length, 0);
  return METHODS.map((m) => {
    let detected = 0;
    const delays = [];
    let falseAlarms = 0;
    zones.forEach((_, i) => {
      const d = declared[m][i];
      for (const ep of episodes[i]) {
        const first = d.slice(ep.start, ep.end + 1).indexOf(true);
        if (first >= 0) {
          detected++;
          delays.push(first * SIM_MIN_PER_TICK);
        }
      }
      for (let r = 0; r < d.length; r++) {
        if (d[r] && (r === 0 || !d[r - 1]) && levels[i][r] < PARAMS.WARNING) falseAlarms++;
      }
    });
    let hoaxPct = null;
    if (hoaxZone !== null) {
      const from = hoaxTick - WARMUP - 1;
      hoaxPct = declared[m][hoaxZone].slice(from, from + HOAX_WINDOW).includes(true) ? 100 : 0;
    }
    return {
      setting: setting.label,
      seed,
      method: m,
      episodes: total,
      detected,
      recallPct: total ? (100 * detected) / total : null,
      delayMin: delays.length ? mean(delays) : null,
      falseAlarmsPerZoneDay: (falseAlarms * TICKS_PER_DAY) / (zones.length * TICKS),
      hoaxPct,
    };
  });
}

const stats = (xs) => {
  const n = xs.length;
  if (n === 0) return null;
  const m = mean(xs);
  const sd = Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, n - 1));
  return { m, ci: (1.96 * sd) / Math.sqrt(n), n };
};

const cell = (rows, key, decimals) => {
  const s = stats(rows.map((r) => r[key]).filter((x) => x !== null));
  return s ? `${s.m.toFixed(decimals)} ± ${s.ci.toFixed(decimals)}` : "n/a";
};

function metricTable(title, key, decimals, settings, rows) {
  const lines = [`## ${title}`, "", `| Setting | ${METHODS.join(" | ")} |`, `|---|${METHODS.map(() => "---:").join("|")}|`];
  for (const s of settings) {
    lines.push(`| ${s.label} | ${METHODS.map((m) => cell(rows.filter((r) => r.setting === s.label && r.method === m), key, decimals)).join(" | ")} |`);
  }
  return [...lines, ""];
}

function main() {
  const rows = [];
  for (const setting of SETTINGS) for (let seed = 1; seed <= SEEDS; seed++) rows.push(...runScenario(seed, setting));

  const scoredLabels = SETTINGS.filter((s) => !s.hoax);
  const episodeLines = [
    "## Danger episodes per seed",
    "",
    "| Setting | Episodes per seed (mean ± 95% CI) | Seeds with at least one episode |",
    "|---|---:|---:|",
    ...SETTINGS.map((s) => {
      const perSeed = rows.filter((r) => r.setting === s.label && r.method === METHODS[0]);
      const st = stats(perSeed.map((r) => r.episodes));
      return `| ${s.label} | ${st.m.toFixed(2)} ± ${st.ci.toFixed(2)} | ${perSeed.filter((r) => r.episodes > 0).length} of ${SEEDS} |`;
    }),
    "",
  ];

  const paramLines = [
    "| Parameter | Value |",
    "|---|---|",
    ...Object.entries(PARAMS).map(([k, v]) => `| ${k} | ${JSON.stringify(v)} |`),
    `| WARMUP_TICKS | ${WARMUP} (not scored) |`,
    `| SCORED_TICKS | ${TICKS} (1 tick = ${SIM_MIN_PER_TICK} simulated minutes) |`,
    `| STORMS | ${STORMS} per run, amount U(${STORM_MIN}, ${STORM_MAX}) added to zone level, default storm decay |`,
    `| SENSOR_NOISE | N(0, ${SENSOR_NOISE}); sensor offline for the whole run with probability dropout |`,
    `| CITIZEN_POOL | ${POOL} genuine per zone: ${ESTABLISHED} established (a = 2..5, b = 3), ${POOL - ESTABLISHED} new |`,
    `| GENUINE_RATE | ${GENUINE_RATE.danger} per zone-tick at level >= DANGER, ${GENUINE_RATE.warning} at WARNING <= level < DANGER |`,
    `| SPAM | ${SPAM_DEVICES} devices per zone, trust record a = 1, b = 6; half of false reports |`,
    `| HOAX | ${HOAX_REPORTS} high reports from fresh ids in one zone below WARNING, scored over ${HOAX_WINDOW} ticks from the burst |`,
  ];

  const hoaxSeeds = rows.filter((r) => r.hoaxPct !== null && r.method === METHODS[0]).length;
  const header = [
    "# Sensor + citizen-report fusion (fusion)",
    "",
    "Simulation with modelled citizen behaviour. Report rates, trust histories, spam and hoax behaviour are assumptions, not measured.",
    "Trust records are fixed for each run (not updated from outcomes). Values are mean ± 95% CI over seeds.",
    `${SEEDS} seeds × ${SETTINGS.length} settings × ${METHODS.length} methods. Methods see only the sensor reading (if online) and citizen reports.`,
    `Hoax bursts were injected in ${hoaxSeeds} of ${SEEDS} hoax-setting seeds; the rest had no zone below WARNING at the burst tick and are excluded from the hoax table.`,
    "",
    "## Parameters",
    "",
    ...paramLines,
    "",
    ...episodeLines,
  ];

  const body = [
    ...metricTable("Recall: % of danger episodes declared at least once", "recallPct", 1, scoredLabels, rows),
    ...metricTable("Detection delay (minutes from episode start to first declaration, detected episodes)", "delayMin", 1, scoredLabels, rows),
    ...metricTable("False alarms per zone-day (declared rising edges while level < WARNING)", "falseAlarmsPerZoneDay", 2, scoredLabels, rows),
    ...metricTable("Hoax triggered: % of seeds where the hoax zone is declared within 5 ticks of the burst", "hoaxPct", 1, SETTINGS.filter((s) => s.hoax), rows),
  ];
  const md = [...header, ...body].join("\n");

  const csvKeys = ["setting", "seed", "method", "episodes", "detected", "recallPct", "delayMin", "falseAlarmsPerZoneDay", "hoaxPct"];
  const csv = [
    csvKeys.map((k) => k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)).join(","),
    ...rows.map((r) => csvKeys.map((k) => (r[k] === null ? "" : typeof r[k] === "number" ? +r[k].toFixed(4) : r[k])).join(",")),
  ].join("\n") + "\n";

  const outDir = path.join(__dirname, "results");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, `${OUT_NAME}.csv`), csv);
  fs.writeFileSync(path.join(outDir, `${OUT_NAME}.md`), md + "\n");
  console.log(md);
}

main();
