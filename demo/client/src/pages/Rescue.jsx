import { useMemo, useState } from "react";
import { useFloodData } from "../FloodDataContext";
import { useAuth } from "../AuthContext";
import { timeAgo } from "../constants";

// same as PRIORITY_MINUTES in server/rescue.js; used only to sort the queue for the room
const PRIORITY = { medical: 30, disabled: 20, elderly: 15, child: 15 };
const NEED_LABEL = { medical: "Medical", elderly: "Elderly", child: "Child", disabled: "Disabled" };
const BOAT_STATUS = { available: { label: "Available", color: "#0ca30c" }, busy: { label: "On a rescue", color: "#fab219" }, offline: { label: "Offline", color: "#898781" } };
const priority = (r) => Math.max(0, ...r.needs.map((n) => PRIORITY[n] ?? 0));

function Needs({ needs }) {
  if (needs.length === 0) return <span className="muted small">None</span>;
  return needs.map((n) => <span key={n} className="badge" style={{ marginRight: 4 }}>{NEED_LABEL[n]}</span>);
}

export default function Rescue() {
  const { rescues, boats, locations, matchBoats, markRescued, registerBoat, updateBoat } = useFloodData();
  const { can } = useAuth();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [matchResult, setMatchResult] = useState(null);
  const [form, setForm] = useState({ name: "", owner: "", capacity: 6, zoneId: "" });

  const waiting = useMemo(
    () => rescues.filter((r) => r.status === "open").sort((a, b) => priority(b) - priority(a) || a.ts - b.ts),
    [rescues]
  );
  const onWater = useMemo(() => rescues.filter((r) => r.status === "assigned").sort((a, b) => a.assignedAt - b.assignedAt), [rescues]);
  const available = boats.filter((b) => b.status === "available").length;
  const peopleWaiting = waiting.reduce((s, r) => s + r.people, 0);

  const run = async (name, fn) => {
    setBusy(name);
    setError("");
    try {
      await fn();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  };

  const match = (method) => run(method, async () => {
    const res = await matchBoats(method);
    setMatchResult({ method, assigned: res.assigned });
  });

  const register = (e) => {
    e.preventDefault();
    const zone = locations.find((l) => l.id === (form.zoneId || locations[0]?.id));
    if (!zone) return;
    run("register", async () => {
      await registerBoat({ name: form.name, owner: form.owner, capacity: Number(form.capacity), lat: zone.lat, lng: zone.lng });
      setForm((f) => ({ ...f, name: "", owner: "" }));
    });
  };

  return (
    <>
      <section className="kpi-row" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        <div className="kpi accent-warning"><div className="kpi-label">Waiting for a boat</div><div className="kpi-value">{waiting.length}</div></div>
        <div className="kpi"><div className="kpi-label">People waiting</div><div className="kpi-value">{peopleWaiting}</div></div>
        <div className="kpi"><div className="kpi-label">Boats on a rescue</div><div className="kpi-value" style={{ color: "#fab219" }}>{onWater.length}</div></div>
        <div className="kpi accent-safe"><div className="kpi-label">Boats available</div><div className="kpi-value">{available} of {boats.length}</div></div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Waiting for a boat</h2>
          {can.respond && (
            <div className="head-actions">
              <button className="btn" onClick={() => match("optimal")} disabled={!!busy || waiting.length === 0}>{busy === "optimal" ? "Matching…" : "Match boats (optimal)"}</button>
              <button className="btn ghost" onClick={() => match("greedy")} disabled={!!busy || waiting.length === 0}>{busy === "greedy" ? "Matching…" : "Match boats (first-come)"}</button>
            </div>
          )}
        </div>
        {matchResult && <p className="muted small" role="status">{matchResult.method === "optimal" ? "Optimal" : "First-come"} matching sent {matchResult.assigned} boat{matchResult.assigned === 1 ? "" : "s"}.</p>}
        {error && <div className="form-error" role="alert">{error}</div>}
        {waiting.length === 0 ? (
          <div className="empty">No open requests. Citizens can request a boat from the citizen app.</div>
        ) : (
          <table className="table">
            <thead><tr><th>Waiting</th><th>Zone</th><th>People</th><th>Needs</th><th>Note</th><th>Phone</th></tr></thead>
            <tbody>
              {waiting.map((r) => (
                <tr key={r.id}>
                  <td className="mono">{timeAgo(r.ts)}</td>
                  <td>{r.zoneName}</td>
                  <td>{r.people}</td>
                  <td><Needs needs={r.needs} /></td>
                  <td className="desc-cell">{r.note || <span className="muted small">—</span>}</td>
                  <td>{r.contact ? <a href={`tel:${r.contact}`}>{r.contact}</a> : <span className="muted small">None given</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel">
        <div className="panel-head"><h2>On the water</h2></div>
        {onWater.length === 0 ? (
          <div className="empty">No boats on a rescue.</div>
        ) : (
          <table className="table">
            <thead><tr><th>Zone</th><th>People</th><th>Needs</th><th>Boat</th><th>Phone</th><th>Status</th></tr></thead>
            <tbody>
              {onWater.map((r) => {
                const boat = boats.find((b) => b.id === r.boatId);
                return (
                  <tr key={r.id}>
                    <td>{r.zoneName}</td>
                    <td>{r.people}</td>
                    <td><Needs needs={r.needs} /></td>
                    <td>{boat?.name ?? "Unknown boat"}<div className="muted small">{boat?.owner}</div></td>
                    <td>{r.contact ? <a href={`tel:${r.contact}`}>{r.contact}</a> : <span className="muted small">None given</span>}</td>
                    <td>
                      {can.respond ? (
                        <button className="btn ghost small" onClick={() => run(r.id, () => markRescued(r.id))} disabled={!!busy}>Mark rescued</button>
                      ) : (
                        <span className="muted small">Assigned {timeAgo(r.assignedAt)}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel">
        <div className="panel-head"><h2>Volunteer boats</h2></div>
        <table className="table">
          <thead><tr><th>Boat</th><th>Owner</th><th>Seats</th><th>Status</th></tr></thead>
          <tbody>
            {boats.map((b) => (
              <tr key={b.id}>
                <td>{b.name}</td>
                <td className="muted small">{b.owner}</td>
                <td>{b.capacity}</td>
                <td>
                  {can.respond ? (
                    <select className="select" value={b.status} disabled={b.status === "busy" || !!busy} onChange={(e) => run(b.id, () => updateBoat(b.id, { status: e.target.value }))} aria-label={`Status of ${b.name}`}>
                      {Object.entries(BOAT_STATUS).filter(([k]) => k !== "busy" || b.status === "busy").map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  ) : (
                    <span className="badge"><span className="badge-dot" style={{ background: BOAT_STATUS[b.status].color }} />{BOAT_STATUS[b.status].label}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {can.respond && (
          <form className="inline-form" style={{ marginTop: 14 }} onSubmit={register}>
            <input className="input" placeholder="Boat name" maxLength={40} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-label="Boat name" required />
            <input className="input" placeholder="Owner or association" maxLength={40} value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })} aria-label="Owner" required />
            <input className="input" type="number" min={2} max={20} value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} aria-label="Seats" required />
            <select className="select" value={form.zoneId || locations[0]?.id || ""} onChange={(e) => setForm({ ...form, zoneId: e.target.value })} aria-label="Starting area">
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <button className="btn" disabled={!!busy}>Register boat</button>
          </form>
        )}
      </section>
    </>
  );
}
