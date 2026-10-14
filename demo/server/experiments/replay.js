// Historical rainfall replay: real Chennai rainfall for two floods and one control window, run
// through the alerting rules and compared with documented flooding.
//
//   node experiments/replay.js [--out replay]
//
// Rainfall: Open-Meteo Historical Weather API (ERA5 reanalysis), CC BY 4.0, one series per zone
// centroid (zones can share a grid cell and therefore an identical series).
// Documented flooding is day-resolution only (experiments/data/flood-timeline.json).
// Model constants below are pre-declared and must not be tuned after seeing results.
const fs = require("node:fs");
const path = require("node:path");
const { ZONE_DEFS } = require("../simulator");
const { RESERVOIRS, releaseImpact } = require("../reservoirs");

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]]] : acc), []));
const OUT_NAME = args.out || "replay";

const TICKS_PER_HOUR = 30; // 1 tick = 2 simulated minutes
const STORM_DECAY = 0.97;
const RAIN_GAIN = 0.15;
const WARNING = 40;
const DANGER = 70;
const IMD_HEAVY_MM = 64.5;
const IMD_VERY_HEAVY_MM = 115.6;
const WINDOW_HOURS = 24;
const EPS = 1e-9;
const HOUR_MS = 3600000;

const DATA_DIR = path.join(__dirname, "data");
const RESULTS_DIR = path.join(__dirname, "results");
const EVENT_KEYS = ["michaung-2023", "chennai-2015", "control-nov-2023"];
const EVENT_TITLES = {
  "michaung-2023": "Cyclone Michaung, Chennai (December 2023)",
  "chennai-2015": "Chennai floods (November-December 2015)",
  "control-nov-2023": "Control window (November 2023, assumed flood-free)",
};
// Documented rainfall totals. The Michaung figure is not in flood-timeline.json; its source is given by the experiment brief.
const DOCUMENTED_RAIN = {
  "michaung-2023": { window: 48, mm: 400, text: "over 40 cm in about 48 hours", source: "https://www.deccanherald.com/amp/story/india%2Ftamil-nadu%2Ffloating-cars-submerged-localities-chennai-battles-floods-in-the-wake-of-cyclone-michuang-2796547" },
  "chennai-2015": { day: "2015-12-01", mm: 300, text: "more than 30 cm of rainfall on 1 December 2015" },
};

const zeroNulls = (series) => series.map((x) => x ?? 0);
const atLeast = (x, threshold) => x >= threshold - EPS;
const classify = (x, warn, danger) => (atLeast(x, danger) ? "danger" : atLeast(x, warn) ? "warning" : "safe");

// Model A: each tick storm = storm * 0.97 + mmPerHour * 0.15, level = base + storm. Impact (cusecs-derived) enters storm at the start of its hour. Level is sampled at the end of each hour.
function modelALevels(rates, base, impactAt = {}) {
  let storm = 0;
  return rates.map((mm, h) => {
    storm += impactAt[h] || 0;
    for (let tick = 0; tick < TICKS_PER_HOUR; tick++) storm = storm * STORM_DECAY + mm * RAIN_GAIN;
    return base + storm;
  });
}

// Model B: sum of the zone's rain over hours h-23..h, recomputed per window (no running sum, so no float drift).
function rollingSum(series, h, hours = WINDOW_HOURS) {
  let sum = 0;
  for (let j = Math.max(0, h - hours + 1); j <= h; j++) sum += series[j];
  return sum;
}

function statesFrom(values, warn, danger) {
  const cls = values.map((x) => classify(x, warn, danger));
  return { warn: cls.map((c) => c !== "safe"), danger: cls.map((c) => c === "danger") };
}

function risingEdges(states) {
  let edges = 0;
  states.forEach((s, i) => {
    if (s && (i === 0 || !states[i - 1])) edges++;
  });
  return edges;
}

// Release alert: forces danger and warning for the release hour only; the model takes over afterwards.
function withReleaseAlert(states, releaseHour) {
  return {
    warn: states.warn.map((s, i) => s || i === releaseHour),
    danger: states.danger.map((s, i) => s || i === releaseHour),
  };
}

// Timestamps are IST wall-clock labels ("YYYY-MM-DDTHH:MM"). Every one goes through the same parser, so no local time zone enters.
const istMs = (label) => Date.parse(`${label}Z`);
const dayStart = (floodDay) => `${floodDay}T00:00`;
const leadHours = (alertLabel, floodDay) => (istMs(dayStart(floodDay)) - istMs(alertLabel)) / HOUR_MS;
const beforeDayEnd = (alertLabel, floodDay) => istMs(alertLabel) < istMs(dayStart(floodDay)) + 24 * HOUR_MS;

function loadRain(key) {
  const d = JSON.parse(fs.readFileSync(path.join(DATA_DIR, `rain-${key}.json`), "utf8"));
  const zoneIds = Object.keys(d.mmPerHour).sort();
  if (JSON.stringify(zoneIds) !== JSON.stringify(ZONE_DEFS.map((z) => z.id).sort())) throw new Error(`${key}: zones do not match ZONE_DEFS`);
  for (const z of zoneIds) if (d.mmPerHour[z].length !== d.time.length) throw new Error(`${key}: ${z} length differs from time`);
  return {
    time: d.time,
    rain: Object.fromEntries(zoneIds.map((z) => [z, zeroNulls(d.mmPerHour[z])])),
    source: d.source,
  };
}

function toRow({ key, zone, documented, time, floodDay }, model, states, peak, peakUnit) {
  const first = (xs) => {
    const i = xs.indexOf(true);
    return i < 0 ? null : time[i];
  };
  const firstDanger = first(states.danger);
  const hasLead = Boolean(documented && floodDay && firstDanger);
  return {
    event: key,
    model,
    zone: zone.id,
    name: zone.name,
    documented,
    firstWarning: first(states.warn),
    firstDanger,
    dangerAlerts: risingEdges(states.danger),
    warningAlerts: risingEdges(states.warn),
    leadHours: hasLead ? leadHours(firstDanger, floodDay) : null,
    beforeDayEnd: hasLead ? beforeDayEnd(firstDanger, floodDay) : false,
    peak,
    peakUnit,
  };
}

function replayEvent(key, timeline, { time, rain }) {
  const info = timeline.events[key];
  const release = info.release || null;
  const reservoir = release ? RESERVOIRS.find((r) => r.id === release.reservoir) : null;
  const downstream = reservoir ? reservoir.downstream : [];
  const releaseHour = release ? time.indexOf(release.time) : -1;
  if (release && releaseHour < 0) throw new Error(`${key}: release time ${release.time} not in data`);
  const impactAt = release ? { [releaseHour]: releaseImpact(release.cusecs) } : {};
  const rows = [];
  for (const zone of ZONE_DEFS) {
    const series = rain[zone.id];
    const ctx = { key, zone, documented: info.zones.includes(zone.id), time, floodDay: info.floodDay };
    const levels = modelALevels(series, zone.base, downstream.includes(zone.id) ? impactAt : {});
    const sums = series.map((_, h) => rollingSum(series, h));
    const a = statesFrom(levels, WARNING, DANGER);
    const b = statesFrom(sums, IMD_HEAVY_MM, IMD_VERY_HEAVY_MM);
    rows.push(toRow(ctx, "A", a, Math.max(...levels), "level"));
    rows.push(toRow(ctx, "B", b, Math.max(...sums), "mm/24h"));
    if (downstream.includes(zone.id)) {
      rows.push(toRow(ctx, "A+release", withReleaseAlert(a, releaseHour), Math.max(...levels), "level"));
      rows.push(toRow(ctx, "B+release", withReleaseAlert(b, releaseHour), Math.max(...sums), "mm/24h"));
    }
  }
  return rows;
}

// Distinct series groups: zones that share a grid cell have identical rainfall.
function seriesGroups(rain) {
  const groups = new Map();
  for (const [zone, series] of Object.entries(rain)) {
    const k = JSON.stringify(series);
    groups.set(k, [...(groups.get(k) || []), zone]);
  }
  return [...groups.values()];
}

function peakWindow(rain, time, hours) {
  let best = { mm: -1 };
  for (const [zone, series] of Object.entries(rain)) {
    series.forEach((_, h) => {
      const mm = rollingSum(series, h, hours);
      if (mm > best.mm) best = { mm, zone, end: time[h] };
    });
  }
  return best;
}

function peakDay(rain, time, day) {
  let best = { mm: -1 };
  for (const [zone, series] of Object.entries(rain)) {
    const mm = series.reduce((s, x, h) => s + (time[h].startsWith(day) ? x : 0), 0);
    if (mm > best.mm) best = { mm, zone };
  }
  return best;
}

const pick = (rows, model, zoneId) => rows.find((r) => r.model === model && r.zone === zoneId);
const cellTime = (label) => (label ? label.replace("T", " ") : "—");
const cellLead = (r) => {
  if (!r.documented) return "n/a";
  if (r.leadHours === null) return "— (no)";
  return `${r.leadHours >= 0 ? "+" : ""}${r.leadHours.toFixed(1)} (${r.beforeDayEnd ? "yes" : "no"})`;
};
const csvCell = (v) => (v === null || v === undefined ? "" : typeof v === "boolean" ? (v ? "yes" : "no") : typeof v === "number" ? +v.toFixed(2) : v);

function eventTable(rows, release) {
  const lines = [
    "| Zone | Documented | A warn | A danger | A danger edges | A lead (h) | B warn | B danger | B danger edges | B lead (h) |",
    "|---|---|---|---|---:|---:|---|---|---:|---:|",
  ];
  const line = (label, a, b) => `| ${label} | ${a.documented ? "yes" : "no"} | ${cellTime(a.firstWarning)} | ${cellTime(a.firstDanger)} | ${a.dangerAlerts} | ${cellLead(a)} | ${cellTime(b.firstWarning)} | ${cellTime(b.firstDanger)} | ${b.dangerAlerts} | ${cellLead(b)} |`;
  for (const zone of ZONE_DEFS) {
    const a = pick(rows, "A", zone.id);
    const b = pick(rows, "B", zone.id);
    lines.push(line(zone.name, a, b));
    if (release && release.downstream.includes(zone.id)) lines.push(line(`${zone.name} + release alert`, pick(rows, "A+release", zone.id), pick(rows, "B+release", zone.id)));
  }
  return lines;
}

function controlTable(rows) {
  const lines = [
    "| Zone | A warning edges | A danger edges | B warning edges | B danger edges | Peak A level | Peak B 24 h (mm) |",
    "|---|---:|---:|---:|---:|---:|---:|",
  ];
  for (const zone of ZONE_DEFS) {
    const a = pick(rows, "A", zone.id);
    const b = pick(rows, "B", zone.id);
    lines.push(`| ${zone.name} | ${a.warningAlerts} | ${a.dangerAlerts} | ${b.warningAlerts} | ${b.dangerAlerts} | ${a.peak.toFixed(1)} | ${b.peak.toFixed(1)} |`);
  }
  return lines;
}

function buildLimitations(loaded) {
  const seriesText = EVENT_KEYS.map((key) => {
    const groups = seriesGroups(loaded[key].rain);
    const shared = groups.filter((g) => g.length > 1).map((g) => g.join(" = "));
    return `${EVENT_TITLES[key]}: ${groups.length} distinct rainfall series across ${ZONE_DEFS.length} zones${shared.length ? `; identical: ${shared.join("; ")}` : ""}`;
  });
  return [
    "- Ground truth is day-resolution only. Lead times are measured to 00:00 IST of the documented flood day, so they are coarse by up to one day.",
    "- ERA5 reanalysis underestimates peak rainfall (see the rainfall check). The alerts are therefore driven by smoothed rainfall, and the replay cannot say what gauge-based rainfall would have triggered.",
    `- Zone-level grid cells: ${seriesText.join(". ")}. Zones with identical series receive identical alerts by construction and are not independent evidence.`,
    "- Model A is a toy level model with the live app's constants: no random bursts, no oscillation and no noise, and base levels taken from ZONE_DEFS. Velachery's base (40) equals the warning threshold, so Model A warns from the first hour of every window.",
    "- Alert times are the data's hourly labels. Whether a label marks the start or the end of the hour it accumulates is not checked offline, so every alert time is uncertain by up to one hour.",
    "- The control window (2023-11-01 to 2023-11-25) is assumed to contain no major flooding. Control edges are false alarms only under that assumption.",
    "- Model B sums at the start of each window use fewer than 24 hours of data.",
    "- The reservoir release effect is a simulation constant (releaseImpact), not a hydrological model, and the release alert is forced for one hour only. The officialWarning time in the timeline is not modelled.",
  ];
}

function report(loaded, rows, timeline) {
  const out = [
    "# Historical rainfall replay",
    "",
    "Rainfall: Open-Meteo Historical Weather API, ERA5 reanalysis, CC BY 4.0 (https://open-meteo.com/). Hourly precipitation at the six zone centroids, IST.",
    "Documented flooding is day resolution only (experiments/data/flood-timeline.json); no hour-level public timeline was found. All times in this report are IST hour labels from the data.",
    "",
    "## Models",
    "",
    `- **Model A, rate model (the live app's rule).** Per zone, each 2-minute tick: storm = storm × ${STORM_DECAY} + mmPerHour × ${RAIN_GAIN}, starting at 0; level = base + storm. Rain is constant within each hour (${TICKS_PER_HOUR} ticks). Warning at level ≥ ${WARNING}, danger at level ≥ ${DANGER}. There are no random bursts or oscillation. The state is taken at the last tick of each hour. Steady state under a constant rate r is base + ${(RAIN_GAIN / (1 - STORM_DECAY)).toFixed(0)} × r. Threshold comparisons allow 1e-9 for float rounding.`,
    `- **Model B, 24-hour accumulation (IMD categories).** At each hour h, S = sum of the zone's rain over hours h−23..h (null = 0; fewer hours at the start of a window). Warning at S ≥ ${IMD_HEAVY_MM} mm ("heavy rain"), danger at S ≥ ${IMD_VERY_HEAVY_MM} mm ("very heavy rain"). Cite: India Meteorological Department rainfall intensity categories for 24-hour totals.`,
    "- **Release alert (2015 only, both models).** The downstream zones of Chembarambakkam (adyar, tnagar, mylapore) are forced to danger and warning for the release hour (2015-12-01 20:00 IST), and the model takes over afterwards. Model A also adds releaseImpact(29000) = 35 to those zones' storm at the start of that hour; that is in the A row too. The state is sampled at the hour's last tick, when 0.97^30 ≈ 0.40 of the impact remains (about 14 of 35). Model B has no level and no impact term. Rows marked \"+ release alert\" include the forced alert.",
    "- **Edges and lead.** A rising edge is a transition from safe to alert; the window starts in the safe state. Lead = flood day 00:00 IST minus the first danger time, in hours (positive = before the flood day began). \"Before day end\" = first danger earlier than the flood day's 24:00.",
    "",
  ];

  for (const key of ["michaung-2023", "chennai-2015"]) {
    const info = timeline.events[key];
    const { time } = loaded[key];
    out.push(`## ${EVENT_TITLES[key]}`, "");
    out.push(`Flood day ${info.floodDay} (IST). Documented zones: ${info.zones.join(", ")}. Window ${time[0].replace("T", " ")} to ${time.at(-1).replace("T", " ")} (${time.length} h).`);
    if (info.release) out.push(`Release: ${info.release.reservoir}, ${info.release.cusecs.toLocaleString("en-US")} cusecs at ${info.release.time.replace("T", " ")} IST; the timeline records officialWarning ${info.release.officialWarning.replace("T", " ")}.`);
    out.push("", "Documented facts (flood-timeline.json):", "");
    for (const f of info.facts) out.push(`- ${f.text} Source: ${f.source}`);
    out.push("", ...eventTable(rows[key], info.release ? { downstream: RESERVOIRS.find((r) => r.id === info.release.reservoir).downstream } : null), "");
  }

  const ctl = timeline.events["control-nov-2023"];
  out.push(`## ${EVENT_TITLES["control-nov-2023"]}`, "", `Window ${loaded["control-nov-2023"].time[0].replace("T", " ")} to ${loaded["control-nov-2023"].time.at(-1).replace("T", " ")} (${loaded["control-nov-2023"].time.length} h). ${ctl.facts[0].text} Every edge below is a false alarm under that assumption.`, "", ...controlTable(rows["control-nov-2023"]), "");

  const mi = loaded["michaung-2023"];
  const ch = loaded["chennai-2015"];
  const mi24 = peakWindow(mi.rain, mi.time, 24);
  const mi48 = peakWindow(mi.rain, mi.time, DOCUMENTED_RAIN["michaung-2023"].window);
  const ch24 = peakWindow(ch.rain, ch.time, 24);
  const ch1 = peakDay(ch.rain, ch.time, DOCUMENTED_RAIN["chennai-2015"].day);
  const chSource = timeline.events["chennai-2015"].facts.find((f) => f.text.includes("30 cm")).source;
  const ratio = (x, d) => (x / d).toFixed(2);
  out.push(
    "## Rainfall check (reanalysis vs documented totals)",
    "",
    "| Event | Measure | Data (mm) | Where, ends (IST) | Documented (mm) | Data ÷ documented |",
    "|---|---|---:|---|---:|---:|",
    `| Michaung | Max 24 h, any zone | ${mi24.mm.toFixed(1)} | ${mi24.zone}, ${mi24.end.replace("T", " ")} | — | — |`,
    `| Michaung | Max 48 h, any zone (vs "${DOCUMENTED_RAIN["michaung-2023"].text}") | ${mi48.mm.toFixed(1)} | ${mi48.zone}, ${mi48.end.replace("T", " ")} | ${DOCUMENTED_RAIN["michaung-2023"].mm} | ${ratio(mi48.mm, DOCUMENTED_RAIN["michaung-2023"].mm)} |`,
    `| Chennai 2015 | Max 24 h, any zone | ${ch24.mm.toFixed(1)} | ${ch24.zone}, ${ch24.end.replace("T", " ")} | — | — |`,
    `| Chennai 2015 | ${DOCUMENTED_RAIN["chennai-2015"].day} calendar day, any zone (vs "${DOCUMENTED_RAIN["chennai-2015"].text}") | ${ch1.mm.toFixed(1)} | ${ch1.zone} | ${DOCUMENTED_RAIN["chennai-2015"].mm} | ${ratio(ch1.mm, DOCUMENTED_RAIN["chennai-2015"].mm)} |`,
    "",
    `Sources: Michaung figure, ${DOCUMENTED_RAIN["michaung-2023"].source}; 2015 figure, ${chSource}. Both documented figures are lower bounds ("over", "more than"), so the ratios are upper bounds on the coverage. Where zones share one series (see Limitations), the zone named is the first of the tied zones.`,
    "",
    "## Limitations",
    "",
    ...buildLimitations(loaded),
    "",
  );
  return out.join("\n");
}

function main() {
  const timeline = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "flood-timeline.json"), "utf8"));
  const loaded = Object.fromEntries(EVENT_KEYS.map((k) => [k, loadRain(k)]));
  const rows = Object.fromEntries(EVENT_KEYS.map((k) => [k, replayEvent(k, timeline, loaded[k])]));

  const csvHeader = ["event", "model", "zone", "documented", "first_warning", "first_danger", "danger_alerts", "warning_alerts", "lead_hours", "alert_before_day_end", "peak", "peak_unit"];
  const csvRows = EVENT_KEYS.flatMap((k) => rows[k]).map((r) => [r.event, r.model, r.zone, r.documented, r.firstWarning, r.firstDanger, r.dangerAlerts, r.warningAlerts, r.leadHours, r.documented ? r.beforeDayEnd : null, r.peak, r.peakUnit]);

  const md = report(loaded, rows, timeline);
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  fs.writeFileSync(path.join(RESULTS_DIR, `${OUT_NAME}.csv`), [csvHeader.join(","), ...csvRows.map((r) => r.map(csvCell).join(","))].join("\n") + "\n");
  fs.writeFileSync(path.join(RESULTS_DIR, `${OUT_NAME}.md`), md + "\n");
  console.log(md);
}

if (require.main === module) main();

module.exports = { modelALevels, rollingSum, classify, risingEdges, withReleaseAlert, leadHours, beforeDayEnd, zeroNulls, statesFrom, IMD_HEAVY_MM, IMD_VERY_HEAVY_MM, WARNING, DANGER };
