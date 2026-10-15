import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { useFloodData } from "../FloodDataContext";
import { useAuth } from "../AuthContext";
import { STATUS } from "../constants";

function fillColor(pct) {
  if (pct >= 90) return "#d03b3b";
  if (pct >= 60) return "#fab219";
  return "#0ca30c";
}

const MODES = [
  { id: "simulated", label: "Simulated" },
  { id: "checkins", label: "Live check-ins" },
];

async function requestJson(path, method = "GET") {
  const res = await fetch(path, { method });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

export default function Shelters() {
  const { shelters, locations } = useFloodData();
  const { can } = useAuth();
  const [mode, setMode] = useState("simulated");
  const [summary, setSummary] = useState({});
  const [tokens, setTokens] = useState(null);
  const [qr, setQr] = useState(null);
  const [error, setError] = useState("");
  const totalCap = shelters.reduce((s, x) => s + x.capacity, 0);
  const totalOcc = shelters.reduce((s, x) => s + x.occupancy, 0);

  const loadSummary = () =>
    fetch("/api/state")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setMode(d.shelterMode);
        setSummary(d.shelterCheckins || {});
      })
      .catch(() => {});

  useEffect(() => {
    loadSummary();
  }, []);

  // a check-in or check-out always changes the headcount, so this refreshes the household counts when they change
  useEffect(() => {
    if (mode === "checkins") loadSummary();
  }, [totalOcc, mode]);

  useEffect(() => {
    if (can.respond) requestJson("/api/shelters/tokens").then(setTokens).catch(() => {});
  }, [can.respond]);

  const chooseMode = async (next) => {
    if (next === mode) return;
    setError("");
    try {
      await requestJson("/api/shelters/mode", "PUT", { mode: next });
      setMode(next);
    } catch (err) {
      setError(err.message);
    }
  };

  const makeQr = async (s, tokenMap) => {
    const url = `${window.location.origin}/checkin/${s.id}?t=${tokenMap[s.id]}`;
    const dataUrl = await QRCode.toDataURL(url, { errorCorrectionLevel: "M", margin: 2, width: 512 });
    setQr({ id: s.id, name: s.name, dataUrl });
  };

  const showQr = async (s) => {
    if (qr?.id === s.id) return setQr(null);
    setError("");
    try {
      await makeQr(s, tokens);
    } catch (err) {
      setError(err.message);
    }
  };

  const rotate = async (s) => {
    if (!window.confirm(`Make a new check-in code for ${s.name}? The poster already printed will stop working.`)) return;
    setError("");
    try {
      await requestJson(`/api/shelters/${s.id}/token`, "POST");
      const fresh = await requestJson("/api/shelters/tokens");
      setTokens(fresh);
      if (qr?.id === s.id) await makeQr(s, fresh);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <>
      <section className="kpi-row" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
        <div className="kpi"><div className="kpi-label">Shelters</div><div className="kpi-value">{shelters.length}</div></div>
        <div className="kpi"><div className="kpi-label">People sheltered</div><div className="kpi-value">{totalOcc.toLocaleString("en-IN")}</div></div>
        <div className="kpi"><div className="kpi-label">Beds available</div><div className="kpi-value">{(totalCap - totalOcc).toLocaleString("en-IN")}</div></div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Relief Shelters</h2>
          <span className="muted small">
            {mode === "checkins"
              ? "Occupancy is the number of people checked in at each shelter"
              : "Occupancy rises automatically while the linked zone has an active incident"}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <span className="muted small">Occupancy:</span>
          {can.manage ? (
            MODES.map((m) => (
              <button key={m.id} className={mode === m.id ? "btn" : "btn ghost"} aria-pressed={mode === m.id} onClick={() => chooseMode(m.id)}>{m.label}</button>
            ))
          ) : (
            <span className="small">{MODES.find((m) => m.id === mode)?.label}</span>
          )}
        </div>
        {error && <div className="form-error" role="alert">{error}</div>}
        <div className="shelter-grid">
          {shelters.map((s) => {
            const pct = Math.round((s.occupancy / s.capacity) * 100);
            const zone = locations.find((l) => l.id === s.zoneId);
            const checked = summary[s.id];
            return (
              <div key={s.id} className="sensor-card">
                <div className="sensor-head">
                  <strong>{s.name}</strong>
                  {pct >= 90 && <span className="badge"><span className="badge-dot" style={{ background: "#d03b3b" }} />Near full</span>}
                </div>
                <div className="muted small" style={{ marginBottom: 10 }}>
                  Serves {zone?.name}
                  {zone && <> · zone <span style={{ color: STATUS[zone.risk].color }}>{STATUS[zone.risk].label.toLowerCase()}</span></>}
                </div>
                <div className="occ-row">
                  <span className="sensor-level" style={{ fontSize: 22 }}>{s.occupancy}</span>
                  <span className="muted small">/ {s.capacity} capacity</span>
                </div>
                <div className="meter" role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${s.name} occupancy`}>
                  <div className="meter-fill" style={{ width: `${pct}%`, background: fillColor(pct) }} />
                </div>
                <div className="muted small" style={{ marginTop: 6 }}>{pct}% full</div>
                {mode === "checkins" && checked && (
                  <div className="muted small" style={{ marginTop: 4 }}>{checked.households} households checked in</div>
                )}
                {can.respond && (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                    <button className="btn ghost" onClick={() => showQr(s)} disabled={!tokens}>{qr?.id === s.id ? "Hide QR" : "Check-in QR"}</button>
                    {can.manage && <button className="btn ghost" onClick={() => rotate(s)}>Rotate code</button>}
                  </div>
                )}
                {qr?.id === s.id && (
                  <div style={{ marginTop: 10 }}>
                    <img src={qr.dataUrl} alt={`Check-in QR for ${s.name}`} width={180} height={180} style={{ background: "#fff", padding: 8, borderRadius: 8 }} />
                    <div className="small" style={{ marginTop: 6 }}><a href={qr.dataUrl} download={`checkin-${s.id}.png`}>Download PNG</a></div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}
