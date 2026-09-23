import { useEffect, useState } from "react";
import { useFloodData } from "../FloodDataContext";

function ThresholdSettings() {
  const { thresholds, updateThresholds, pushToast } = useFloodData();
  const [warning, setWarning] = useState(thresholds.warning);
  const [danger, setDanger] = useState(thresholds.danger);

  useEffect(() => {
    setWarning(thresholds.warning);
    setDanger(thresholds.danger);
  }, [thresholds]);

  const invalid = Number(warning) >= Number(danger);
  const dirty = Number(warning) !== thresholds.warning || Number(danger) !== thresholds.danger;

  const save = async () => {
    await updateThresholds({ warning: Number(warning), danger: Number(danger) });
    pushToast({ kind: "info", title: "Thresholds updated", text: `Warning ≥${warning}% · Danger ≥${danger}% applied to live feed` });
  };

  return (
    <div className="panel">
      <div className="panel-head"><h2>Risk Thresholds</h2></div>
      <p className="muted small" style={{ marginBottom: 18 }}>Controls when a zone flips Safe → Warning → Danger across the whole system, live.</p>

      <label className="field-label" htmlFor="warn">Warning threshold: {warning}%</label>
      <input id="warn" type="range" min="10" max="90" value={warning} onChange={(e) => setWarning(Number(e.target.value))} className="slider" />

      <label className="field-label" htmlFor="dang" style={{ marginTop: 18 }}>Danger threshold: {danger}%</label>
      <input id="dang" type="range" min="20" max="100" value={danger} onChange={(e) => setDanger(Number(e.target.value))} className="slider" />

      <div className="threshold-preview">
        <div className="threshold-bar">
          <div className="seg safe" style={{ width: `${Math.min(warning, danger)}%` }} />
          <div className="seg warning" style={{ width: `${Math.max(0, danger - warning)}%` }} />
          <div className="seg danger" style={{ width: `${100 - Math.max(warning, danger)}%` }} />
        </div>
        <div className="threshold-labels"><span>0%</span><span>{warning}%</span><span>{danger}%</span><span>100%</span></div>
      </div>

      {invalid && <div className="form-error" role="alert">Warning threshold must be lower than danger threshold.</div>}
      <div className="btn-row">
        <button className="btn" onClick={save} disabled={invalid || !dirty}>Save thresholds</button>
        <button className="btn ghost" onClick={() => { setWarning(40); setDanger(70); }}>Reset to defaults</button>
      </div>
    </div>
  );
}

function StormSimulator() {
  const { locations, triggerStorm, pushToast } = useFloodData();
  const [zoneId, setZoneId] = useState("velachery");
  const [intensity, setIntensity] = useState(40);

  const trigger = async () => {
    await triggerStorm(zoneId, intensity);
    const name = zoneId === "all" ? "all zones" : locations.find((l) => l.id === zoneId)?.name;
    pushToast({ kind: "warning", title: "Storm injected", text: `+${intensity} surge on ${name}. Watch the Overview and Incidents pages.` });
  };

  return (
    <div className="panel">
      <div className="panel-head"><h2>Storm Simulator</h2><span className="muted small">Demo control</span></div>
      <p className="muted small" style={{ marginBottom: 18 }}>
        Injects a cloudburst into the simulated sensor feed. Levels spike, an incident opens, an automated SMS goes out, and shelter occupancy climbs, then everything decays back naturally.
      </p>

      <label className="field">
        <span className="field-label">Target zone</span>
        <select className="input" value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
          <option value="all">All zones (city-wide cyclone)</option>
          {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </label>

      <label className="field-label" htmlFor="intensity">Intensity: +{intensity}%</label>
      <input id="intensity" type="range" min="10" max="60" value={intensity} onChange={(e) => setIntensity(Number(e.target.value))} className="slider" />

      <div className="btn-row">
        <button className="btn danger" onClick={trigger}>⛈ Trigger storm</button>
      </div>
    </div>
  );
}

function DemoData() {
  const { clearDemoData, pushToast, reports, incidents, broadcasts } = useFloodData();
  const [confirming, setConfirming] = useState(false);

  const clear = async () => {
    await clearDemoData();
    setConfirming(false);
    pushToast({ kind: "info", title: "Demo data cleared", text: "Reports, incidents and broadcasts removed; thresholds reset" });
  };

  return (
    <div className="panel">
      <div className="panel-head"><h2>Demo Data</h2><span className="muted small">Saved in SQLite</span></div>
      <p className="muted small" style={{ marginBottom: 14 }}>
        Everything below survives server restarts. Clear it before a presentation to start from a clean slate.
      </p>
      <div className="data-counts">
        <div><span className="route-num">{reports.length}</span> reports</div>
        <div><span className="route-num">{incidents.length}</span> incidents</div>
        <div><span className="route-num">{broadcasts.length}</span> broadcasts</div>
      </div>
      {confirming ? (
        <div className="confirm-row" role="alertdialog" aria-label="Confirm clearing demo data">
          <span className="small">Permanently delete all of this?</span>
          <button className="btn danger" onClick={clear}>Yes, clear everything</button>
          <button className="btn ghost" onClick={() => setConfirming(false)}>Cancel</button>
        </div>
      ) : (
        <div className="btn-row"><button className="btn ghost" onClick={() => setConfirming(true)}>Clear demo data…</button></div>
      )}
    </div>
  );
}

export default function Settings() {
  return (
    <section className="grid-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
      <ThresholdSettings />
      <StormSimulator />
      <DemoData />
    </section>
  );
}
