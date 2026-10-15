// IMD 24-hour rainfall categories (India Meteorological Department, rainfall intensity terminology).
// Values come from Open-Meteo rounded to 0.1 mm, so the 115.5 / 115.6 and 204.4 / 204.5 cut-offs cover every value.
const RANKS = ["none", "heavy", "veryHeavy", "extremelyHeavy"];
const LABELS = { heavy: "Heavy rain", veryHeavy: "Very heavy rain", extremelyHeavy: "Extremely heavy rain" };
// lower bound of each category in mm; an alert's reason quotes it as the rule that fired
const CUTOFFS = { heavy: 64.5, veryHeavy: 115.6, extremelyHeavy: 204.5 };

function category(mm) {
  if (mm >= CUTOFFS.extremelyHeavy) return "extremelyHeavy";
  if (mm >= CUTOFFS.veryHeavy) return "veryHeavy";
  if (mm >= CUTOFFS.heavy) return "heavy";
  return "none";
}

function rank(cat) {
  return RANKS.indexOf(cat);
}

// a channel alerts when its rank rises above the last alerted rank and reaches minRank;
// a drop below the last alerted rank re-arms it so the next rise alerts again
function step(cur, last, minRank) {
  if (cur < last) return { alert: false, last: cur };
  if (cur > last && cur >= minRank) return { alert: true, last: cur };
  return { alert: false, last };
}

// zones with no rainfall reading keep their previous state, so a data gap cannot re-arm them
function imdAlerts(prevState, zones, rainfall, now) {
  const state = {};
  const alerts = [];
  for (const z of zones) {
    const prev = prevState[z.id] || { observed: 0, forecast: 0 };
    const r = rainfall.zones?.[z.id];
    if (!r) {
      state[z.id] = prev;
      continue;
    }
    const obs = step(rank(category(r.past24hMm)), prev.observed, 1);
    const fc = step(rank(category(r.next24hMm)), prev.forecast, 2);
    state[z.id] = { observed: obs.last, forecast: fc.last };
    if (obs.alert) {
      const cat = RANKS[obs.last];
      const advice = obs.last >= 2
        ? "Flooding likely in low-lying areas. Move vehicles and valuables to higher ground."
        : "Waterlogging possible in low-lying areas. Avoid underpasses and flooded roads.";
      const reason = { rule: "imd-observed", mm: r.past24hMm, threshold: CUTOFFS[cat], category: cat };
      alerts.push({ zoneId: z.id, severity: obs.last >= 2 ? "danger" : "warning", message: `IMD ${LABELS[cat].toUpperCase()}: ${Math.round(r.past24hMm)} mm in the last 24 h in ${z.name}. ${advice}`, reason, ts: now });
    }
    if (fc.alert) {
      const cat = RANKS[fc.last];
      const reason = { rule: "imd-forecast", mm: r.next24hMm, threshold: CUTOFFS[cat], category: cat };
      alerts.push({ zoneId: z.id, severity: "warning", message: `IMD FORECAST: ${LABELS[cat].toLowerCase()} (${Math.round(r.next24hMm)} mm) expected in ${z.name} in the next 24 h. Prepare to move to higher ground.`, reason, ts: now });
    }
  }
  return { state, alerts };
}

// adds the observed and forecast categories to each zone's rainfall reading for the clients
function withCategories(zones) {
  return Object.fromEntries(Object.entries(zones).map(([id, r]) => [id, { ...r, imdObserved: category(r.past24hMm), imdForecast: category(r.next24hMm) }]));
}

module.exports = { category, rank, imdAlerts, withCategories, LABELS };
