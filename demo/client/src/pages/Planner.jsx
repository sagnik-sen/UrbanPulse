import { useCallback, useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Polyline, Tooltip, useMap } from "react-leaflet";
import { useFloodData } from "../FloodDataContext";
import { useAuth } from "../AuthContext";
import { STATUS } from "../constants";
import MapReady from "../MapReady";
import { DangerZones } from "../EvacuationRoute";

// one colour per shelter so each route reads as "these people go there"
const SHELTER_COLOR = { s1: "#3987e5", s2: "#d95926", s3: "#199e70", s4: "#c98500", s5: "#d55181", s6: "#9085e9" };

const METRIC_ROWS = [
  ["assigned", "Evacuees with a bed", (v, m) => `${v} / ${m.evacuees}`, "higher"],
  ["meanTravelMin", "Mean travel", (v) => `${v} min`, "lower"],
  ["worstTravelMin", "Worst travel", (v) => `${v} min`, "lower"],
  ["floodKmPerEvacuee", "Expected flooded road / person", (v) => `${v} km`, "lower"],
  ["pctToAtRiskShelter", "Sent to a shelter at flood risk", (v) => `${v}%`, "lower"],
];

function FitRoutes({ assignments }) {
  const map = useMap();
  const key = assignments.map((a) => `${a.originId}|${a.shelterId}`).join(",");
  useEffect(() => {
    const pts = assignments.flatMap((a) => a.coords);
    if (pts.length) map.fitBounds(pts, { padding: [40, 40], maxZoom: 14 });
    // refit only when the set of routes changes, not on every live-data re-render
  }, [key, map]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function PlanCard({ title, subtitle, plan, other, highlight }) {
  return (
    <div className={`panel plan-card ${highlight ? "highlight" : ""}`}>
      <div className="panel-head" style={{ marginBottom: 4 }}><h2>{title}</h2></div>
      <p className="muted small" style={{ marginBottom: 12 }}>{subtitle}</p>
      <table className="metric-table">
        <tbody>
          {METRIC_ROWS.map(([key, label, show, better]) => {
            const v = plan.metrics[key];
            const o = other?.metrics[key];
            const wins = other && v !== o && (better === "lower" ? v < o : v > o);
            return (
              <tr key={key}>
                <td className="muted small">{label}</td>
                <td className={`metric-val ${highlight && wins ? "better" : ""}`}>{show(v, plan.metrics)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function Planner() {
  const { locations, buildEvacuationPlan, issueEvacuationOrder, pushToast } = useFloodData();
  const { can } = useAuth();
  const [zoneIds, setZoneIds] = useState([]);
  const [people, setPeople] = useState(300);
  const [result, setResult] = useState(null);
  const [view, setView] = useState("proposed");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [issued, setIssued] = useState(null);

  // context functions are recreated on every live tick; keep the latest without re-running effects
  const buildRef = useRef(buildEvacuationPlan);
  buildRef.current = buildEvacuationPlan;

  const compute = useCallback(async (body) => {
    setBusy(true);
    setError("");
    setConfirming(false);
    try {
      const r = await buildRef.current(body);
      setResult(r);
      setZoneIds(r.zoneIds);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }, []);

  // start from the zones the system suggests (in danger, or forecast to breach within 30 min)
  useEffect(() => { compute({ peoplePerZone: 300 }); }, [compute]);

  const toggleZone = (id) => setZoneIds((prev) => (prev.includes(id) ? prev.filter((z) => z !== id) : [...prev, id]));

  const issue = async () => {
    setBusy(true);
    try {
      const r = await issueEvacuationOrder({ zoneIds, peoplePerZone: people });
      setIssued({ at: Date.now(), ...r });
      pushToast({ kind: "warning", title: "Evacuation order issued", text: `${r.heldSeats} seats held across shelters; alerts sent to ${r.zones} zone${r.zones > 1 ? "s" : ""}${r.unassigned ? `. ${r.unassigned} people still need a bed` : ""}` });
      setConfirming(false);
      await compute({ zoneIds, peoplePerZone: people });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const plan = result?.[view];
  const stale = result && (people !== result.peoplePerZone || [...zoneIds].sort().join() !== [...result.zoneIds].sort().join());

  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <h2>Evacuation Planner</h2>
          <span className="muted small">Assigns evacuees to shelters and roads using the live forecast</span>
        </div>

        <div className="planner-controls">
          <fieldset className="field" style={{ flex: 1 }}>
            <legend className="field-label">Zones to evacuate</legend>
            <div className="zone-chips">
              {locations.map((l) => (
                <label key={l.id} className={`zone-chip ${zoneIds.includes(l.id) ? "on" : ""}`}>
                  <input type="checkbox" checked={zoneIds.includes(l.id)} onChange={() => toggleZone(l.id)} />
                  <span className="badge-dot" style={{ background: STATUS[l.risk].color }} />
                  {l.name}
                  {result?.suggestedZoneIds.includes(l.id) && <span className="suggest-tag">suggested</span>}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="field" style={{ width: 170 }}>
            <span className="field-label">People per zone</span>
            <input className="input" type="number" min={50} max={2000} step={50} value={people} onChange={(e) => setPeople(Number(e.target.value))} />
          </label>
        </div>

        <div className="btn-row" style={{ marginTop: 4 }}>
          <button className="btn" disabled={busy || zoneIds.length === 0} onClick={() => compute({ zoneIds, peoplePerZone: people })}>
            {busy ? "Planning…" : stale ? "Recompute plan" : "Compute plan"}
          </button>
          {can.respond && result && result.proposed.assignments.length > 0 && !stale && (
            confirming ? (
              <span className="confirm-row" style={{ marginTop: 0 }} role="alertdialog" aria-label="Confirm evacuation order">
                <span className="small">Hold {result.proposed.metrics.assigned} seats and alert {result.zoneIds.length} zone{result.zoneIds.length > 1 ? "s" : ""}?</span>
                <button className="btn danger" disabled={busy} onClick={issue}>Yes, issue order</button>
                <button className="btn ghost" onClick={() => setConfirming(false)}>Cancel</button>
              </span>
            ) : (
              <button className="btn danger" disabled={busy} onClick={() => setConfirming(true)}>Issue evacuation order…</button>
            )
          )}
        </div>
        {error && <div className="form-error" role="alert" style={{ marginTop: 12 }}>{error}</div>}
        {result && result.zoneIds.length === 0 && (
          <p className="muted small" style={{ marginTop: 12 }}>No zone is in danger or forecast to breach within 30 minutes. Pick zones above to plan a precautionary evacuation.</p>
        )}
      </section>

      {result && result.zoneIds.length > 0 && (
        <>
          {issued && (
            <div className="info-banner" role="status">
              ✓ Evacuation order issued at {new Date(issued.at).toLocaleTimeString()}: {issued.heldSeats} seats held, alerts sent to {issued.zones} zone{issued.zones > 1 ? "s" : ""}.
              The plan below uses the beds that are still free, for anyone who still needs one.
            </div>
          )}
          {result.proposed.metrics.unassigned > 0 && (
            <div className="action-banner" role="alert">
              ⚠ Not enough shelter space: {result.proposed.metrics.unassigned} of {result.proposed.metrics.evacuees} people would have no bed. Open more relief centres or reduce the evacuation size.
            </div>
          )}

          <section className="grid-2" style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 20 }}>
            <PlanCard title="Proposed plan" subtitle="Forecast-aware routes, shelters assigned jointly (optimal)" plan={result.proposed} other={result.conventional} highlight />
            <PlanCard title="Conventional plan" subtitle="Current conditions only, groups assigned one at a time" plan={result.conventional} />
          </section>
          <p className="muted small" style={{ marginTop: -8, marginBottom: 16 }}>
            Both plans are judged against the same live forecast. Green = proposed plan does better.
          </p>

          <section className="panel" style={{ padding: 0, overflow: "hidden" }}>
            <div className="panel-head" style={{ padding: "16px 18px 12px" }}>
              <h2>Routes</h2>
              <div className="segmented compact" role="radiogroup" aria-label="Plan shown on map">
                {[["proposed", "Proposed"], ["conventional", "Conventional"]].map(([k, label]) => (
                  <label key={k} className={`segment ${view === k ? "on" : ""}`}>
                    <input type="radio" name="planview" checked={view === k} onChange={() => setView(k)} />{label}
                  </label>
                ))}
              </div>
            </div>
            <MapContainer className="dark-map" center={[12.98, 80.23]} zoom={12} style={{ height: 460, width: "100%" }} scrollWheelZoom={false}>
              <TileLayer attribution='&copy; OpenStreetMap contributors &middot; routing &copy; OSRM' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <MapReady />
              <FitRoutes assignments={plan.assignments} />
              <DangerZones locations={locations} />
              {plan.assignments.map((a) => (
                <Polyline key={`${a.originId}|${a.shelterId}`} positions={a.coords} pathOptions={{ color: SHELTER_COLOR[a.shelterId], weight: 4, opacity: 0.85, dashArray: a.shelterAtRisk ? "6 6" : undefined }}>
                  <Tooltip sticky>{a.people} people · {a.zoneName} → {a.shelterName} · {a.durationMin} min</Tooltip>
                </Polyline>
              ))}
              {plan.assignments.map((a) => (
                <CircleMarker key={`o-${a.originId}-${a.shelterId}`} center={[a.from.lat, a.from.lng]} radius={5} pathOptions={{ color: "#fff", fillColor: "#fff", fillOpacity: 1, weight: 1 }} />
              ))}
              {plan.shelterLoads.map((l) => {
                const s = result.freeBeds.find((f) => f.id === l.id);
                const a = plan.assignments.find((x) => x.shelterId === l.id);
                const pos = a.coords[a.coords.length - 1];
                return (
                  <CircleMarker key={`s-${l.id}`} center={pos} radius={11} pathOptions={{ color: "#fff", fillColor: SHELTER_COLOR[l.id], fillOpacity: 1, weight: 2 }}>
                    <Tooltip permanent direction="top" offset={[0, -10]}>🏫 {l.arriving} → {s.name.split(",")[0]}</Tooltip>
                  </CircleMarker>
                );
              })}
            </MapContainer>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>{view === "proposed" ? "Proposed" : "Conventional"} assignments</h2>
              <span className="muted small">Dashed route = destination shelter at flood risk on arrival</span>
            </div>
            <table className="table">
              <thead>
                <tr><th>From</th><th>Shelter</th><th>People</th><th>Travel</th><th>Distance</th><th>Expected flooded road</th></tr>
              </thead>
              <tbody>
                {plan.assignments.map((a) => (
                  <tr key={`${a.originId}|${a.shelterId}`}>
                    <td>{a.zoneName} <span className="muted small">({a.originId.split("-").pop()})</span></td>
                    <td><span className="badge-dot" style={{ background: SHELTER_COLOR[a.shelterId], marginRight: 6 }} />{a.shelterName}{a.shelterAtRisk && <span className="suggest-tag danger">at risk</span>}</td>
                    <td className="mono">{a.people}</td>
                    <td className="mono">{a.durationMin} min</td>
                    <td className="mono">{a.distanceKm} km</td>
                    <td className="mono">{a.expectedFloodKm} km</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="beds-strip">
              {result.freeBeds.map((f) => {
                const arriving = plan.shelterLoads.find((l) => l.id === f.id)?.arriving ?? 0;
                return (
                  <div key={f.id} className="beds-item">
                    <div className="small">{f.name.split(",")[0]}</div>
                    <div className="meter" title={`${arriving} of ${f.free} free beds`}>
                      <div className="meter-fill" style={{ width: `${f.free ? Math.min(100, (100 * arriving) / f.free) : 100}%`, background: SHELTER_COLOR[f.id] }} />
                    </div>
                    <div className="muted small">{arriving} / {f.free} free beds</div>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}
    </>
  );
}
