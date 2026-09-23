import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useFloodData } from "./FloodDataContext";
import ReportModal from "./ReportModal";
import Toasts from "./Toasts";

export default function Layout() {
  const { connected, incidents, reports } = useFloodData();
  const [now, setNow] = useState(Date.now());
  const [reportOpen, setReportOpen] = useState(false);

  useEffect(() => {
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(clock);
  }, []);

  const activeIncidents = incidents.filter((i) => i.status !== "cleared").length;
  const openReports = reports.filter((r) => r.status !== "resolved").length;

  const nav = [
    { to: "/", label: "Overview", end: true },
    { to: "/map", label: "Live Map" },
    { to: "/sensors", label: "Sensor Grid" },
    { to: "/incidents", label: "Incidents", badge: activeIncidents, badgeKind: "danger" },
    { to: "/reports", label: "Citizen Reports", badge: openReports, badgeKind: "warning" },
    { to: "/broadcasts", label: "Broadcasts" },
    { to: "/shelters", label: "Relief Shelters" },
    { to: "/analytics", label: "Analytics" },
    { to: "/architecture", label: "Architecture" },
    { to: "/settings", label: "Settings" },
  ];

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">UP</div>
          <div>
            <div className="brand-name">UrbanPulse</div>
            <div className="brand-sub">Chennai ICCC</div>
          </div>
        </div>
        <nav className="nav">
          {nav.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}>
              <span>{item.label}</span>
              {item.badge > 0 && <span className={`nav-badge ${item.badgeKind}`}>{item.badge}</span>}
            </NavLink>
          ))}
        </nav>
        <a href="/citizen" target="_blank" rel="noreferrer" className="nav-item citizen-link">Citizen app ↗</a>
        <div className="sidebar-footer">
          <span className={`dot ${connected ? "on" : "off"}`} />
          {connected ? "Live feed connected" : "Reconnecting…"}
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div>
            <h1>Flood Risk Command Center</h1>
            <p className="muted">Greater Chennai Corporation · simulated sensor network (demo prototype)</p>
          </div>
          <div className="topbar-right">
            <button className="btn" onClick={() => setReportOpen(true)}>+ Report flooding</button>
            <span className="clock">{new Date(now).toLocaleTimeString()}</span>
          </div>
        </header>
        <Outlet />
      </div>

      {reportOpen && <ReportModal onClose={() => setReportOpen(false)} />}

      <Toasts />
    </div>
  );
}
