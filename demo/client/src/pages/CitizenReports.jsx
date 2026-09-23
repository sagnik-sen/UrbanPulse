import { useMemo, useState } from "react";
import { useFloodData } from "../FloodDataContext";
import { CATEGORIES, SEVERITY, REPORT_STATUS, timeAgo, downloadCsv } from "../constants";
import ReportModal from "../ReportModal";

export default function CitizenReports() {
  const { reports, setReportStatus } = useFloodData();
  const [status, setStatus] = useState("all");
  const [severity, setSeverity] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);

  const filtered = useMemo(
    () => reports.filter((r) => (status === "all" || r.status === status) && (severity === "all" || r.severity === severity)),
    [reports, status, severity]
  );

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
              {Object.entries(REPORT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
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
                <tr key={r.id}>
                  <td className="mono">{timeAgo(r.ts)}</td>
                  <td>{r.zoneName}</td>
                  <td>{CATEGORIES[r.category]}</td>
                  <td><span className="badge"><span className="badge-dot" style={{ background: SEVERITY[r.severity].color }} />{SEVERITY[r.severity].label}</span></td>
                  <td className="desc-cell">{r.description}</td>
                  <td className="muted small">{r.reporter}</td>
                  <td>
                    <select className="select" value={r.status} onChange={(e) => setReportStatus(r.id, e.target.value)} aria-label="Report status">
                      {Object.entries(REPORT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
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
