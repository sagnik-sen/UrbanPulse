import { useMemo, useState } from "react";
import { useFloodData } from "../FloodDataContext";
import { useAuth } from "../AuthContext";
import { CATEGORIES, SEVERITY, REPORT_STATUS, timeAgo, downloadCsv } from "../constants";
import ReportModal, { DEPTHS } from "../ReportModal";

// "rejected" is staff-only, so it lives here rather than in the constants shared with the citizen app
const STATUS_OPTIONS = { ...REPORT_STATUS, rejected: { label: "False report", color: "#898781" } };

// same replay as server/fusion-live.js: resolved or in-progress is confirmed, rejected is false
function reporterCounts(reports) {
  const counts = new Map();
  for (const r of reports) {
    if (!r.deviceId) continue;
    const c = counts.get(r.deviceId) ?? { confirmed: 0, false: 0 };
    if (r.status === "resolved" || r.status === "in_progress") c.confirmed += 1;
    else if (r.status === "rejected") c.false += 1;
    counts.set(r.deviceId, c);
  }
  return counts;
}

// prior a=1, b=3 (see NEW_DEVICE_PRIOR in server/fusion.js)
function trustLabel(deviceId, counts) {
  if (!deviceId) return "Reporter trust unknown";
  const c = counts.get(deviceId) ?? { confirmed: 0, false: 0 };
  const pct = Math.round((100 * (1 + c.confirmed)) / (4 + c.confirmed + c.false));
  if (c.confirmed + c.false === 0) return `Reporter trust ${pct}% (new)`;
  return `Reporter trust ${pct}% (${c.confirmed} confirmed, ${c.false} false)`;
}

export default function CitizenReports() {
  const { reports, setReportStatus } = useFloodData();
  const { can } = useAuth();
  const [status, setStatus] = useState("all");
  const [severity, setSeverity] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);

  const filtered = useMemo(
    () => reports.filter((r) => (status === "all" || r.status === status) && (severity === "all" || r.severity === severity)),
    [reports, status, severity]
  );
  const counts = useMemo(() => reporterCounts(reports), [reports]);

  const exportCsv = () => downloadCsv("urbanpulse-citizen-reports.csv", filtered.map((r) => ({
    filed: new Date(r.ts).toISOString(), zone: r.zoneName, category: CATEGORIES[r.category], severity: r.severity, status: r.status, reporter: r.reporter, description: r.description, lat: r.lat, lng: r.lng,
  })));

  const count = (k) => reports.filter((r) => r.status === k).length;

  return (
    <>
      <section className="kpi-row" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        <div className="kpi"><div className="kpi-label">Total reports</div><div className="kpi-value">{reports.length}</div></div>
        <div className="kpi accent-warning"><div className="kpi-label">Open</div><div className="kpi-value">{count("open")}</div></div>
        <div className="kpi"><div className="kpi-label">In progress</div><div className="kpi-value" style={{ color: "#3987e5" }}>{count("in_progress")}</div></div>
        <div className="kpi accent-safe"><div className="kpi-label">Resolved</div><div className="kpi-value">{count("resolved")}</div></div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Citizen Reports</h2>
          <div className="head-actions">
            <select className="select" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
              <option value="all">All statuses</option>
              {Object.entries(STATUS_OPTIONS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <select className="select" value={severity} onChange={(e) => setSeverity(e.target.value)} aria-label="Filter by severity">
              <option value="all">All severities</option>
              {Object.entries(SEVERITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <button className="btn ghost" onClick={exportCsv} disabled={filtered.length === 0}>Export CSV</button>
            <button className="btn" onClick={() => setModalOpen(true)}>+ New report</button>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="empty">{reports.length === 0 ? "No citizen reports yet. File one with “+ New report” or by clicking on the Live Map." : "No reports match these filters."}</div>
        ) : (
          <table className="table">
            <thead>
              <tr><th>Filed</th><th>Zone</th><th>Issue</th><th>Severity</th><th>Description</th><th>Reporter</th><th>Status</th></tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} style={{ opacity: r.status === "rejected" ? 0.6 : 1 }}>
                  <td className="mono">{timeAgo(r.ts)}</td>
                  <td>{r.zoneName}</td>
                  <td>{CATEGORIES[r.category]}</td>
                  <td><span className="badge"><span className="badge-dot" style={{ background: SEVERITY[r.severity].color }} />{SEVERITY[r.severity].label}</span></td>
                  <td className="desc-cell">
                    {r.status === "rejected" && <span className="badge" style={{ color: "#898781", marginRight: 6 }}>False report</span>}
                    {r.description}
                    {r.depth && <div className="muted small">Water: {r.depth}-deep (~{DEPTHS[r.depth].cm} cm)</div>}
                  </td>
                  <td className="muted small">
                    {r.reporter}
                    <div>{trustLabel(r.deviceId, counts)}</div>
                  </td>
                  <td>
                    {can.respond ? (
                      <select className="select" value={r.status} onChange={(e) => setReportStatus(r.id, e.target.value)} aria-label="Report status">
                        {Object.entries(STATUS_OPTIONS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                      </select>
                    ) : (
                      <span className="badge"><span className="badge-dot" style={{ background: STATUS_OPTIONS[r.status].color }} />{STATUS_OPTIONS[r.status].label}</span>
                    )}
                    {can.respond && r.status !== "rejected" && (
                      <button className="btn ghost small" style={{ marginLeft: 6 }} onClick={() => setReportStatus(r.id, "rejected")}>False report</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {modalOpen && <ReportModal onClose={() => setModalOpen(false)} />}
    </>
  );
}
