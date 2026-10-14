// Pure: turns audit rows into one response timeline per incident. Rows come from db.auditByActions().

function median(values) {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

function buildTimelines(rows) {
  const by = (action) => rows.filter((r) => r.action === action);
  const alerts = by("alert_published");
  const dispatches = by("team_dispatched");
  const evacuations = by("evacuation_order");
  const clears = new Map(by("incident_cleared").map((r) => [r.details.incidentId, r]));

  return by("incident_opened").map((open) => {
    const { incidentId, zoneId } = open.details;
    const clear = clears.get(incidentId) ?? null;
    const inWindow = (r) => r.ts >= open.ts && (!clear || r.ts < clear.ts);
    const alert = alerts.find((r) => (r.details.zoneId === zoneId || r.details.zoneId === "all") && inWindow(r)) ?? null;
    const dispatch = dispatches.find((r) => r.details.incidentId === incidentId) ?? null;
    const evacuation = evacuations.find((r) => (r.details.zones || []).includes(zoneId) && inWindow(r)) ?? null;

    const entry = (r) => (r ? { ts: r.ts, afterSec: Math.round((r.ts - open.ts) / 1000), entryId: r.id, anchored: r.batch_id != null } : null);
    const sealed = [open, alert, dispatch, evacuation, clear].every((r) => r == null || r.batch_id != null);
    return {
      incidentId,
      zoneId,
      zone: open.details.zone,
      openedAt: open.ts,
      events: { alert: entry(alert), dispatch: entry(dispatch), evacuation: entry(evacuation), cleared: entry(clear) },
      sealed,
    };
  }).sort((a, b) => b.openedAt - a.openedAt);
}

function summarize(timelines) {
  const withEvent = (name) => timelines.map((t) => t.events[name]).filter(Boolean);
  const dispatched = withEvent("dispatch");
  return {
    incidents: timelines.length,
    dispatchedPct: timelines.length ? Math.round((dispatched.length / timelines.length) * 100) : null,
    medianDispatchSec: median(dispatched.map((e) => e.afterSec)),
    medianEvacuationSec: median(withEvent("evacuation").map((e) => e.afterSec)),
    medianDurationSec: median(withEvent("cleared").map((e) => e.afterSec)),
    openNow: timelines.filter((t) => !t.events.cleared).length,
  };
}

module.exports = { buildTimelines, summarize };
