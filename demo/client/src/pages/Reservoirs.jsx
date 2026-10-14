import { useCallback, useEffect, useState } from "react";
import { useFloodData } from "../FloodDataContext";
import { useAuth } from "../AuthContext";

const MIN_CUSECS = 100;
const MAX_CUSECS = 60000;
const MIN_HOURS = 0.5;
const MAX_HOURS = 72;
const EMPTY_FORM = { reservoirId: "chembarambakkam", cusecs: "", durationHours: "", reason: "" };

function fillColor(pct) {
  if (pct >= 90) return "#d03b3b";
  if (pct >= 60) return "#fab219";
  return "#0ca30c";
}

// the seal says who signed the anchoring batch; only admins are told which agency that was
function SealCell({ release, wrd, explorer }) {
  if (release.batch_id == null) return <span className="audit-tag neutral" title="Waiting for the next anchoring batch">Pending</span>;
  const sealedByWrd = wrd && release.agency?.toLowerCase() === wrd.address.toLowerCase();
  if (!sealedByWrd) return <span className="audit-tag ok">Sealed</span>;
  return explorer && release.tx_hash
    ? <a className="audit-tag ok" href={`${explorer}/tx/${release.tx_hash}`} target="_blank" rel="noreferrer" title="Open the anchoring transaction">Sealed by WRD ↗</a>
    : <span className="audit-tag ok">Sealed by WRD</span>;
}

export default function Reservoirs() {
  const { locations, fetchAuditChain, pushToast } = useFloodData();
  const { can, expire } = useAuth();
  const [data, setData] = useState({ reservoirs: [], releases: [] });
  const [chain, setChain] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/reservoirs");
    const body = await res.json();
    if (res.status === 401) expire();
    if (!res.ok) throw new Error(body.error || "Could not load the reservoir desk");
    setData(body);
  }, [expire]);

  // seals land on a timer, so poll to turn "Pending" into "Sealed"
  useEffect(() => {
    refresh().catch((err) => setError(err.message));
    const timer = setInterval(() => refresh().catch(() => {}), 10000);
    return () => clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    if (!can.manage) return;
    fetchAuditChain().then(setChain).catch(() => setChain(null));
  }, [can.manage]); // eslint-disable-line react-hooks/exhaustive-deps

  const wrd = chain?.agencies?.find((a) => a.key === "wrd");
  const zoneName = (id) => locations.find((l) => l.id === id)?.name ?? id;
  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    const cusecs = Number(form.cusecs);
    const durationHours = Number(form.durationHours);
    const reason = form.reason.trim();
    if (!Number.isInteger(cusecs) || cusecs < MIN_CUSECS || cusecs > MAX_CUSECS) return setError(`Release must be a whole number from ${MIN_CUSECS} to ${MAX_CUSECS.toLocaleString("en-IN")} cusecs.`);
    if (!(durationHours >= MIN_HOURS && durationHours <= MAX_HOURS)) return setError(`Duration must be ${MIN_HOURS} to ${MAX_HOURS} hours.`);
    if (reason.length < 3) return setError("Give a reason of at least 3 characters.");
    setSending(true);
    setError("");
    try {
      const res = await fetch("/api/reservoirs/release", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reservoirId: form.reservoirId, cusecs, durationHours, reason }),
      });
      const body = await res.json();
      if (res.status === 401) expire();
      if (!res.ok) throw new Error(body.error || "Release was not ordered");
      setForm((f) => ({ ...f, cusecs: "", durationHours: "", reason: "" }));
      pushToast({ kind: "warning", title: "Release ordered", text: `Rise warning sent to ${body.alerts} zone${body.alerts === 1 ? "" : "s"}` });
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <h2>Reservoir Desk</h2>
          <span className="muted small">Releases warn the downstream zones and are sealed on the blockchain</span>
        </div>
        <p className="muted small" style={{ marginBottom: 12 }}>
          Reservoir figures are illustrative and the downstream effect is simulated. Releases are signed with the Water Resources Department's own blockchain key, separate from GCC's.
        </p>
        <div className="shelter-grid">
          {data.reservoirs.map((r) => {
            const pct = r.storagePct;
            return (
              <div key={r.id} className="sensor-card">
                <div className="sensor-head">
                  <strong>{r.name}</strong>
                </div>
                <div className="muted small" style={{ marginBottom: 10 }}>
                  River: {r.river} · {r.capacityMcft.toLocaleString("en-IN")} Mcft capacity
                </div>
                <div className="occ-row">
                  <span className="sensor-level" style={{ fontSize: 22 }}>{pct}%</span>
                  <span className="muted small">storage</span>
                </div>
                <div className="meter" role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${r.name} storage`}>
                  <div className="meter-fill" style={{ width: `${pct}%`, background: fillColor(pct) }} />
                </div>
                <div className="muted small" style={{ marginTop: 10 }}>
                  Downstream: {r.downstream.map(zoneName).join(", ")}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="grid-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
        {can.respond ? (
          <form className="panel" onSubmit={submit}>
            <div className="panel-head"><h2>Order a Release</h2></div>
            <label className="field">
              <span className="field-label">Reservoir</span>
              <select className="input" value={form.reservoirId} onChange={update("reservoirId")}>
                {data.reservoirs.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </label>
            <label className="field">
              <span className="field-label">Release (cusecs)</span>
              <input className="input" type="number" min={MIN_CUSECS} max={MAX_CUSECS} step={1} value={form.cusecs} onChange={update("cusecs")} />
            </label>
            <label className="field">
              <span className="field-label">Duration (hours)</span>
              <input className="input" type="number" min={MIN_HOURS} max={MAX_HOURS} step={0.5} value={form.durationHours} onChange={update("durationHours")} />
            </label>
            <label className="field">
              <span className="field-label">Reason</span>
              <textarea className="input" rows={3} maxLength={200} value={form.reason} onChange={update("reason")} placeholder="e.g. Inflow above safe level, gates opened in stages" />
            </label>
            {error && <div className="form-error" role="alert">{error}</div>}
            <button className="btn" type="submit" disabled={sending}>{sending ? "Ordering…" : "Order release"}</button>
          </form>
        ) : (
          <div className="panel">
            <div className="panel-head"><h2>Order a Release</h2></div>
            <p className="muted small">Only field officers and admins can order a release. Everyone can follow the release log.</p>
          </div>
        )}

        <div className="panel">
          <div className="panel-head">
            <h2>Release Log</h2>
            <span className="muted small">Latest {data.releases.length}</span>
          </div>
          {data.releases.length === 0 ? (
            <div className="empty">No releases ordered yet.</div>
          ) : (
            <table className="table">
              <thead><tr><th>Time</th><th>Reservoir</th><th>Cusecs</th><th>Duration</th><th>Reason</th><th>Ordered by</th><th>Seal</th></tr></thead>
              <tbody>
                {data.releases.map((r) => {
                  const d = r.details || {};
                  return (
                    <tr key={r.id}>
                      <td className="mono" title={new Date(r.ts).toLocaleString()}>{new Date(r.ts).toLocaleTimeString()}<div className="muted small">{new Date(r.ts).toLocaleDateString()}</div></td>
                      <td>{d.reservoir}</td>
                      <td className="mono">{d.cusecs?.toLocaleString("en-IN")}</td>
                      <td>{d.durationHours} h</td>
                      <td className="audit-details">{d.reason}</td>
                      <td>{r.username ?? "unknown"}{r.role && <div className="muted small">{r.role}</div>}</td>
                      <td><SealCell release={r} wrd={wrd} explorer={chain?.explorer} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </>
  );
}
