import { Fragment, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useFloodData } from "../FloodDataContext";
import { INCIDENT_STATUS, duration, downloadCsv } from "../constants";

const TABS = [["all", "All"], ["active", "Active"], ["responding", "Responding"], ["cleared", "Cleared"]];

function IncidentRow({ inc, teams, updateIncident }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const s = INCIDENT_STATUS[inc.status];

  const addNote = async (e) => {
    e.preventDefault();
    if (!note.trim()) return;
    await updateIncident(inc.id, { note: note.trim() });
    setNote("");
  };

  return (
    <Fragment>
      <tr className={`clickable ${open ? "expanded" : ""}`} onClick={() => setOpen((o) => !o)}>
        <td><span className="chev">{open ? "▾" : "▸"}</span> <Link className="link" to={`/sensors/${inc.zoneId}`} onClick={(e) => e.stopPropagation()}>{inc.zoneName}</Link></td>
        <td><span className="badge"><span className="badge-dot" style={{ background: s.color }} />{s.label}</span></td>
        <td className="mono">{new Date(inc.startTs).toLocaleTimeString()}</td>
        <td className="mono">{duration(inc.startTs, inc.endTs)}</td>
        <td className="mono">{inc.peakLevel}%</td>
        <td onClick={(e) => e.stopPropagation()}>
          {inc.status === "cleared" ? (
            <span className="muted small">{inc.team ?? "—"}</span>
          ) : (
            <select className="select" value={inc.team ?? ""} onChange={(e) => e.target.value && updateIncident(inc.id, { team: e.target.value })}>
              <option value="">Dispatch team…</option>
              {teams.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          )}
        </td>
      </tr>
      {open && (
        <tr className="detail-row">
          <td colSpan={6}>
            <div className="timeline">
              {inc.log.map((entry, i) => (
                <div key={i} className="timeline-item">
                  <span className="mono small">{new Date(entry.ts).toLocaleTimeString()}</span>
                  <span>{entry.text}</span>
                </div>
              ))}
            </div>
            <form className="inline-form" onSubmit={addNote}>
              <input className="input" placeholder="Add field note (e.g. 'Pumps deployed at 2nd Main Rd')" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
              <button className="btn" type="submit" disabled={!note.trim()}>Add note</button>
            </form>
          </td>
        </tr>
      )}
    </Fragment>
  );
}

export default function Incidents() {
  const { incidents, locations, teams, updateIncident } = useFloodData();
  const [tab, setTab] = useState("all");
  const [zone, setZone] = useState("all");

  const filtered = useMemo(
    () => incidents.filter((i) => (tab === "all" || i.status === tab) && (zone === "all" || i.zoneId === zone)),
    [incidents, tab, zone]
  );

  const counts = Object.fromEntries(TABS.map(([k]) => [k, k === "all" ? incidents.length : incidents.filter((i) => i.status === k).length]));

  const exportCsv = () => downloadCsv("urbanpulse-incidents.csv", filtered.map((i) => ({
    zone: i.zoneName, status: i.status, started: new Date(i.startTs).toISOString(), ended: i.endTs ? new Date(i.endTs).toISOString() : "", peak_level: i.peakLevel, team: i.team ?? "",
  })));

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Incidents</h2>
        <div className="head-actions">
          <select className="select" value={zone} onChange={(e) => setZone(e.target.value)}>
            <option value="all">All zones</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <button className="btn ghost" onClick={exportCsv} disabled={filtered.length === 0}>Export CSV</button>
        </div>
      </div>
      <p className="muted small" style={{ marginBottom: 12 }}>One incident per continuous danger episode. Opens automatically when a zone crosses the danger threshold and auto-clears when it recedes. Click a row for its timeline.</p>

      <div className="tabs">
        {TABS.map(([k, label]) => (
          <button key={k} className={`tab ${tab === k ? "on" : ""}`} onClick={() => setTab(k)}>{label} <span className="tab-count">{counts[k]}</span></button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="empty">No incidents match this filter. Use Settings → Storm Simulator to trigger one.</div>
      ) : (
        <table className="table">
          <thead>
            <tr><th>Zone</th><th>Status</th><th>Started</th><th>Duration</th><th>Peak</th><th>Response team</th></tr>
          </thead>
          <tbody>
            {filtered.map((inc) => <IncidentRow key={inc.id} inc={inc} teams={teams} updateIncident={updateIncident} />)}
          </tbody>
        </table>
      )}
    </section>
  );
}
