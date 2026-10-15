import { useEffect, useMemo, useRef, useState } from "react";
import { useFloodData } from "../FloodDataContext";
import { downloadCsv } from "../constants";

const ACTIONS = {
  login: { label: "Signed in", tone: "neutral" },
  login_failed: { label: "Failed sign-in", tone: "warn" },
  login_locked: { label: "Account locked", tone: "danger" },
  logout: { label: "Signed out", tone: "neutral" },
  thresholds_changed: { label: "Thresholds changed", tone: "warn" },
  storm_simulated: { label: "Storm simulated", tone: "neutral" },
  report_status: { label: "Report status", tone: "neutral" },
  team_dispatched: { label: "Team dispatched", tone: "info" },
  incident_note: { label: "Incident note", tone: "neutral" },
  broadcast_sent: { label: "Broadcast sent", tone: "warn" },
  evacuation_order: { label: "Evacuation order", tone: "danger" },
  demo_data_cleared: { label: "Demo data cleared", tone: "danger" },
  rain_link: { label: "Rain link changed", tone: "neutral" },
  alert_published: { label: "Public alert record", tone: "info" },
  incident_opened: { label: "Incident opened", tone: "warn" },
  incident_cleared: { label: "Incident cleared", tone: "neutral" },
  reservoir_release: { label: "Reservoir release", tone: "danger" },
  sensor_status: { label: "Sensor status", tone: "warn" },
  rescue_requested: { label: "Boat rescue requested", tone: "warn" },
  rescue_assigned: { label: "Boat assigned", tone: "info" },
  rescue_completed: { label: "Rescue completed", tone: "ok" },
  rescue_cancelled: { label: "Rescue cancelled", tone: "neutral" },
  boat_registered: { label: "Boat registered", tone: "info" },
  boat_updated: { label: "Boat updated", tone: "neutral" },
  vulnerable_registered: { label: "Vulnerable resident registered", tone: "neutral" },
  vulnerable_cancelled: { label: "Vulnerable resident cancelled", tone: "neutral" },
  shelter_checkin: { label: "Shelter check-in", tone: "neutral" },
  shelter_checkout: { label: "Shelter check-out", tone: "neutral" },
  shelter_mode: { label: "Shelter occupancy mode", tone: "warn" },
  shelter_token_rotated: { label: "Shelter check-in code replaced", tone: "warn" },
};

// who acts when no staff member is signed in
const SYSTEM_ACTOR = { alert_published: "public", incident_opened: "system", incident_cleared: "system", rescue_requested: "public", rescue_cancelled: "public", shelter_checkin: "public", shelter_checkout: "public" };

// one readable sentence per entry
function describe(e) {
  const d = e.details || {};
  switch (e.action) {
    case "login": return d.ip ? `From ${d.ip === "::1" || d.ip === "127.0.0.1" ? "this computer" : d.ip}` : "—";
    case "login_failed": return `Wrong password for "${d.username}"`;
    case "login_locked": return `Sign-in blocked for "${d.username}" after repeated failures`;
    case "logout": return "Session ended";
    case "thresholds_changed": return `Warning ${d.from?.warning}% → ${d.to?.warning}%, danger ${d.from?.danger}% → ${d.to?.danger}%`;
    case "storm_simulated": return `+${d.intensity} storm on ${d.zoneId === "all" ? "all zones" : d.zoneId}`;
    case "report_status": return `${d.zone} report: ${d.from} → ${d.to}`;
    case "team_dispatched": return `${d.team} sent to ${d.zone}`;
    case "incident_note": return `${d.zone}: "${d.note}"`;
    case "broadcast_sent": return `${d.severity} alert to ${d.zone} via ${(d.channels || []).join(", ")} (~${d.recipients?.toLocaleString("en-IN")} people): "${d.message}"`;
    case "evacuation_order": return `${(d.zones || []).join(", ")}: ${d.heldSeats} seats held${d.unassigned ? `, ${d.unassigned} without a bed` : ""} (${(d.shelters || []).join("; ")})`;
    case "demo_data_cleared": return "Cleared all reports, incidents and broadcasts";
    case "alert_published": return `${d.code}: ${d.severity} ${d.source === "auto" ? "automated" : "manual"} alert to ${d.zone}: "${d.message}"`;
    case "rain_link": return d.enabled ? "Linked simulation to live rainfall" : "Unlinked simulation from live rainfall";
    case "incident_opened": return `${d.zone} reached ${d.level}%`;
    case "incident_cleared": return `${d.zone} back to ${d.level}% (${d.how})`;
    case "reservoir_release": return `${d.reservoir}: ${d.cusecs} cusecs for ${d.durationHours} h ("${d.reason}")`;
    case "sensor_status": return `${d.zone} sensor ${d.online ? "back online" : "taken offline"}`;
    case "rescue_requested": return `${d.people} people in ${d.zone}${d.needs?.length ? ` (${d.needs.join(", ")})` : ""}`;
    case "rescue_assigned": return `${d.boat} sent, ${d.minutes} min away (${d.method} matching)`;
    case "rescue_completed": return `${d.boat} brought ${d.people} people from ${d.zone} to safety`;
    case "rescue_cancelled": return `${d.zone} request for ${d.people} people${d.boat ? `, ${d.boat} turned back` : ""}`;
    case "boat_registered": return `${d.boat} (${d.owner}, ${d.capacity} seats) registered`;
    case "boat_updated": return `${d.boat}: ${d.from} → ${d.to}`;
    case "vulnerable_registered": return `${d.zoneId}: ${d.category}, ${d.count} ${d.count === 1 ? "person" : "people"}`;
    case "vulnerable_cancelled": return `${d.zoneId}: ${d.category}, ${d.count} ${d.count === 1 ? "person" : "people"} (cancelled by the resident)`;
    case "shelter_checkin": return `${d.shelter}: ${d.people} ${d.people === 1 ? "person" : "people"} checked in`;
    case "shelter_checkout": return `${d.shelter}: ${d.people} ${d.people === 1 ? "person" : "people"} checked out`;
    case "shelter_mode": return `Occupancy ${d.from === "checkins" ? "live check-ins" : "simulated"} → ${d.to === "checkins" ? "live check-ins" : "simulated"}`;
    case "shelter_token_rotated": return `${d.shelter}: old check-in posters no longer work`;
    default: return JSON.stringify(d);
  }
}

// blockchain column: verification result beats the stored anchor, which beats pending
function ChainCell({ e, verdict, explorer, wrd }) {
  if (verdict === "tampered") return <span className="audit-tag danger" title="This entry no longer matches the hash anchored on-chain">✗ Tampered</span>;
  if (e.batch_id == null) return <span className="audit-tag neutral" title="Waiting for the next anchoring batch">Pending</span>;
  const signer = wrd && e.agency?.toLowerCase() === wrd.toLowerCase() ? " · WRD" : "";
  const label = (verdict === "verified" ? "✓ Verified" : `Anchored #${e.batch_id}`) + signer;
  const tone = verdict === "verified" ? "ok" : "info";
  return explorer && e.tx_hash
    ? <a className={`audit-tag ${tone}`} href={`${explorer}/tx/${e.tx_hash}`} target="_blank" rel="noreferrer" title="Open the anchoring transaction">{label} ↗</a>
    : <span className={`audit-tag ${tone}`}>{label}</span>;
}

function VerifyBanner({ result }) {
  if (result.error) return <div className="chain-banner bad" role="alert">{result.error}</div>;
  const at = new Date(result.checkedAt).toLocaleTimeString();
  if (result.ok) {
    return <div className="chain-banner ok" role="status">✓ All {result.verified} anchored entries match the Shardeum ledger ({result.batches.length} batch{result.batches.length === 1 ? "" : "es"}, checked {at}).</div>;
  }
  const problems = [
    result.tampered && `${result.tampered} entr${result.tampered === 1 ? "y" : "ies"} altered`,
    result.deleted.length && `${result.deleted.length} anchored entr${result.deleted.length === 1 ? "y" : "ies"} deleted`,
    result.missing.length && `${result.missing.length} anchored batch${result.missing.length === 1 ? "" : "es"} missing from the database`,
  ].filter(Boolean);
  return <div className="chain-banner bad" role="alert">✗ Tampering detected: {problems.join(", ") || "a batch no longer matches the chain"} (checked {at}).</div>;
}

export default function Audit() {
  const { fetchAudit, liveAudit, liveAnchors, fetchAuditChain, anchorAuditNow, verifyAudit } = useFloodData();
  const [chain, setChain] = useState(null);
  const [verify, setVerify] = useState(null);
  const [busy, setBusy] = useState("");
  const [entries, setEntries] = useState([]);
  const [action, setAction] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const fetchRef = useRef(fetchAudit);
  fetchRef.current = fetchAudit;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchRef.current(action)
      .then((rows) => { if (!cancelled) { setEntries(rows); setError(""); } })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [action]);

  useEffect(() => {
    fetchAuditChain().then(setChain).catch(() => setChain({ enabled: false }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // live entries arrive over the socket; merge them in front without duplicates
  const rows = useMemo(() => {
    const seen = new Set();
    const merged = [...liveAudit.filter((e) => !action || e.action === action), ...entries];
    const q = search.trim().toLowerCase();
    return merged.filter((e) => {
      if (seen.has(e.id)) return false;
      seen.add(e.id);
      return !q || `${e.username ?? ""} ${describe(e)}`.toLowerCase().includes(q);
    }).map((e) => (liveAnchors[e.id] ? { ...e, ...liveAnchors[e.id] } : e));
  }, [liveAudit, liveAnchors, entries, action, search]);

  const run = (name, fn) => async () => {
    setBusy(name);
    try { await fn(); } finally { setBusy(""); }
  };
  const anchorNow = run("anchor", () => anchorAuditNow().catch((err) => setVerify({ error: err.message })));
  // refetch too, so an entry edited behind the app's back shows its current text next to the red badge
  const verifyNow = run("verify", () => Promise.all([verifyAudit(), fetchRef.current(action)])
    .then(([result, fresh]) => { setVerify(result); setEntries(fresh); })
    .catch((err) => setVerify({ error: err.message })));

  const wrdAddress = chain?.agencies?.find((a) => a.key === "wrd")?.address;

  const exportCsv = () => downloadCsv("urbanpulse-audit-log.csv", rows.map((e) => ({
    time: new Date(e.ts).toISOString(), user: e.username ?? "", role: e.role ?? "", action: e.action, details: describe(e), anchor_tx: e.tx_hash ?? "",
  })));

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Audit Log</h2>
        <div className="head-actions">
          <input className="input" style={{ padding: "6px 10px", fontSize: 12, width: 180 }} placeholder="Search user or details" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search audit log" />
          <select className="select" value={action} onChange={(e) => setAction(e.target.value)} aria-label="Filter by action">
            <option value="">All actions</option>
            {Object.entries(ACTIONS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <button className="btn ghost" onClick={exportCsv} disabled={rows.length === 0}>Export CSV</button>
          {chain?.canWrite && <button className="btn ghost" onClick={anchorNow} disabled={!!busy}>{busy === "anchor" ? "Anchoring…" : "Anchor now"}</button>}
          {chain?.enabled && <button className="btn" onClick={verifyNow} disabled={!!busy}>{busy === "verify" ? "Verifying…" : "Verify on chain"}</button>}
        </div>
      </div>
      <p className="muted small" style={{ marginBottom: 12 }}>
        Every staff action and sign-in attempt, newest first, updating live. Append-only and kept when demo data is cleared.
        {chain?.enabled
          ? <> Entries are fingerprinted in batches and anchored to the {chain.network ?? "blockchain"} ledger{chain.explorer && <> (<a href={`${chain.explorer}/address/${chain.contract}`} target="_blank" rel="noreferrer">contract</a>)</>}, so any later edit or deletion shows up when verified.</>
          : chain && " Blockchain anchoring is not configured on this server."}
      </p>
      {error && <div className="form-error" role="alert">{error}</div>}
      {verify && <VerifyBanner result={verify} />}
      {loading && rows.length === 0 ? (
        <div className="empty">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="empty">No matching entries.</div>
      ) : (
        <table className="table">
          <thead><tr><th>Time</th><th>User</th><th>Action</th><th>Details</th>{chain?.enabled && <th>Blockchain</th>}</tr></thead>
          <tbody>
            {rows.map((e) => {
              const a = ACTIONS[e.action] ?? { label: e.action, tone: "neutral" };
              return (
                <tr key={e.id}>
                  <td className="mono" title={new Date(e.ts).toLocaleString()}>{new Date(e.ts).toLocaleTimeString()}<div className="muted small">{new Date(e.ts).toLocaleDateString()}</div></td>
                  <td>{e.username ?? <span className="muted">{SYSTEM_ACTOR[e.action] ?? "unknown"}</span>}{e.role && <div className="muted small">{e.role}</div>}</td>
                  <td><span className={`audit-tag ${a.tone}`}>{a.label}</span></td>
                  <td className="audit-details">{describe(e)}</td>
                  {chain?.enabled && <td><ChainCell e={e} verdict={verify?.rows?.[e.id]} explorer={chain.explorer} wrd={wrdAddress} /></td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
