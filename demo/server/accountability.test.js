const test = require("node:test");
const assert = require("node:assert");
const { openDb } = require("./db");
const { buildTimelines, summarize } = require("./accountability");

const T0 = Date.UTC(2026, 9, 14, 10, 0);
const at = (min) => T0 + min * 60_000;
const ACTIONS = ["incident_opened", "incident_cleared", "alert_published", "team_dispatched", "evacuation_order"];

// Velachery: alerted at once, dispatched at 12m, evacuation order at 20m, cleared at 60m.
// Adyar: an evacuation order at 20m predates it, so it must not match. Never cleared.
// Tambaram: no alert of its own, so the "all zones" broadcast at 52m is its first alert.
function scenario() {
  const db = openDb(":memory:");
  let n = 0;
  const log = (min, action, details, user) => {
    const id = `e${++n}`;
    db.logAudit({ id, ts: at(min), username: user ?? null, role: user ? "officer" : null, action, details });
    return id;
  };
  const ids = {};
  log(-5, "alert_published", { code: "UP-00000001", zoneId: "z-adyar", zone: "Adyar", severity: "danger", source: "auto" });
  ids.velOpen = log(0, "incident_opened", { incidentId: "inc-vel", zoneId: "z-vel", zone: "Velachery", level: 74 });
  ids.velAlert = log(0, "alert_published", { code: "UP-00000002", zoneId: "z-vel", zone: "Velachery", severity: "danger", source: "auto" });
  ids.velDispatch = log(12, "team_dispatched", { incidentId: "inc-vel", zone: "Velachery", team: "NDRF Battalion 4" }, "asha");
  ids.velEvac = log(20, "evacuation_order", { zones: ["z-vel", "z-adyar"], heldSeats: 900, unassigned: 0 }, "asha");
  ids.velClear = log(60, "incident_cleared", { incidentId: "inc-vel", zoneId: "z-vel", zone: "Velachery", level: 58, how: "auto" });
  log(70, "evacuation_order", { zones: ["z-vel"], heldSeats: 10, unassigned: 0 }, "asha");
  ids.adyOpen = log(30, "incident_opened", { incidentId: "inc-ady", zoneId: "z-adyar", zone: "Adyar", level: 71 });
  ids.adyAlert = log(30, "alert_published", { code: "UP-00000003", zoneId: "z-adyar", zone: "Adyar", severity: "danger", source: "auto" });
  ids.tamOpen = log(35, "incident_opened", { incidentId: "inc-tam", zoneId: "z-tam", zone: "Tambaram", level: 72 });
  log(40, "alert_published", { code: "UP-00000004", zoneId: "z-vel", zone: "Velachery", severity: "warning", source: "manual" }, "asha");
  ids.allAlert = log(52, "alert_published", { code: "UP-00000005", zoneId: "all", zone: "All zones", severity: "warning", source: "manual" }, "asha");
  log(-10, "login", { ip: "::1" }, "asha");
  return { db, ids };
}

test("auditByActions returns only the requested actions, oldest first, with details parsed", () => {
  const { db } = scenario();
  const rows = db.auditByActions(ACTIONS);
  assert.equal(rows.length, 12);
  assert.ok(rows.every((r) => ACTIONS.includes(r.action) && typeof r.details === "object"));
  assert.deepEqual(rows.map((r) => r.ts), [...rows.map((r) => r.ts)].sort((a, b) => a - b));
  assert.equal(rows.find((r) => r.action === "team_dispatched").details.team, "NDRF Battalion 4");
});

test("each incident is matched to its own alert, dispatch, evacuation and clear", () => {
  const { db, ids } = scenario();
  db.saveAnchorBatch({ id: 1, root: "0x00", count: 5, txHash: "0xabc", anchoredAt: at(60) },
    [ids.velOpen, ids.velAlert, ids.velDispatch, ids.velEvac, ids.velClear].map((id) => ({ id, leaf: "0x00" })));
  const timelines = buildTimelines(db.auditByActions(ACTIONS));
  assert.deepEqual(timelines.map((t) => t.incidentId), ["inc-tam", "inc-ady", "inc-vel"]);

  const vel = timelines[2];
  assert.equal(vel.zone, "Velachery");
  assert.equal(vel.openedAt, at(0));
  assert.deepEqual(vel.events.alert, { ts: at(0), afterSec: 0, entryId: ids.velAlert, anchored: true });
  assert.equal(vel.events.dispatch.afterSec, 720);
  assert.equal(vel.events.dispatch.entryId, ids.velDispatch);
  assert.equal(vel.events.evacuation.afterSec, 1200);
  assert.equal(vel.events.evacuation.entryId, ids.velEvac);
  assert.equal(vel.events.cleared.afterSec, 3600);
  assert.equal(vel.sealed, true, "every entry on the timeline is anchored, the late evacuation is not on it");

  const ady = timelines[1];
  assert.equal(ady.events.alert.entryId, ids.adyAlert);
  assert.equal(ady.events.dispatch, null);
  assert.equal(ady.events.evacuation, null, "an order issued before the incident opened does not count");
  assert.equal(ady.events.cleared, null);
  assert.equal(ady.sealed, false, "the open entry is not anchored yet");

  const tam = timelines[0];
  assert.equal(tam.events.alert.entryId, ids.allAlert, "an all-zones alert counts, a Velachery alert does not");
  assert.equal(tam.events.alert.afterSec, 1020);
  assert.equal(tam.sealed, false);
});

test("summary reports percentages, medians and open incidents", () => {
  const { db } = scenario();
  const summary = summarize(buildTimelines(db.auditByActions(ACTIONS)));
  assert.deepEqual(summary, {
    incidents: 3,
    dispatchedPct: 33,
    medianDispatchSec: 720,
    medianEvacuationSec: 1200,
    medianDurationSec: 3600,
    openNow: 2,
  });
});

test("summary medians average the two middle values and skip incidents without the event", () => {
  const ev = (afterSec) => (afterSec == null ? null : { afterSec });
  const timeline = (dispatch, evacuation, cleared) => ({ events: { dispatch: ev(dispatch), evacuation: ev(evacuation), cleared: ev(cleared) } });
  const summary = summarize([timeline(300, null, 1000), timeline(600, 900, null), timeline(null, null, 2000), timeline(900, 1500, 3000)]);
  assert.equal(summary.incidents, 4);
  assert.equal(summary.dispatchedPct, 75);
  assert.equal(summary.medianDispatchSec, 600);
  assert.equal(summary.medianEvacuationSec, 1200);
  assert.equal(summary.medianDurationSec, 2000);
  assert.equal(summary.openNow, 1);
});

test("summary with no incidents has no medians", () => {
  assert.deepEqual(summarize([]), {
    incidents: 0,
    dispatchedPct: null,
    medianDispatchSec: null,
    medianEvacuationSec: null,
    medianDurationSec: null,
    openNow: 0,
  });
});
