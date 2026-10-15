import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useFloodData, formatIst } from "./FloodDataContext";
import ReportModal from "./ReportModal";
import Toasts from "./Toasts";
import { useAuth, ROLE_LABEL } from "./AuthContext";

export default function Layout() {
  const { connected, incidents, reports, rescues, timeMachine, stopTimeMachine, pushToast } = useFloodData();
  const { user, logout, can } = useAuth();
  const navigate = useNavigate();
  const [now, setNow] = useState(Date.now());
  const [reportOpen, setReportOpen] = useState(false);

  useEffect(() => {
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(clock);
  }, []);

  const activeIncidents = incidents.filter((i) => i.status !== "cleared").length;
  const openReports = reports.filter((r) => r.status !== "resolved").length;
  const openRescues = rescues.filter((r) => r.status === "open").length;

  const nav = [
    { to: "/", label: "Overview", end: true },
    { to: "/map", label: "Live Map" },
    { to: "/planner", label: "Evacuation Planner" },
    { to: "/rescue", label: "Boat Rescue", badge: openRescues, badgeKind: "danger" },
    { to: "/sensors", label: "Sensor Grid" },
    { to: "/incidents", label: "Incidents", badge: activeIncidents, badgeKind: "danger" },
    { to: "/reports", label: "Citizen Reports", badge: openReports, badgeKind: "warning" },
    { to: "/broadcasts", label: "Broadcasts" },
    { to: "/shelters", label: "Relief Shelters" },
    { to: "/reservoirs", label: "Reservoir Desk" },
    { to: "/analytics", label: "Analytics" },
    { to: "/accountability", label: "Accountability" },
    { to: "/architecture", label: "Architecture" },
    can.manage && { to: "/time-machine", label: "Time Machine" },
    can.manage && { to: "/audit", label: "Audit Log" },
    can.manage && { to: "/settings", label: "Settings" },
  ].filter(Boolean);

  const signOut = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

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
        <div className="user-box">
          <div className="user-avatar" aria-hidden="true">{user.name[0]}</div>
          <div className="user-meta">
            <div className="user-name">{user.name}</div>
            <div className="muted small">{ROLE_LABEL[user.role]}</div>
          </div>
          <button className="icon-btn" onClick={signOut} title="Sign out" aria-label="Sign out">⎋</button>
        </div>
        <div className="sidebar-footer">
          <span className={`dot ${connected ? "on" : "off"}`} />
          {connected ? "Live feed connected" : "Reconnecting…"}
        </div>
      </aside>

      <div className="main">
        {timeMachine.active && (
          <div role="status" style={{ background: "#b42318", color: "#fff", padding: "10px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, fontWeight: 600 }}>
            <span>REPLAY: {timeMachine.name} · {formatIst(timeMachine.currentTime)} — alerts below are a simulation of a past event</span>
            {can.manage && <button className="btn" onClick={() => stopTimeMachine().catch((err) => pushToast({ kind: "danger", title: "Could not stop the replay", text: err.message }))}>Stop replay</button>}
          </div>
        )}
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
