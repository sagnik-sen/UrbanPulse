import { useMemo } from "react";
import { Link } from "react-router-dom";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import { useFloodData } from "../FloodDataContext";
import { STATUS, ZONE_COLOR, CATEGORIES, timeAgo, formatCount } from "../constants";
import MapReady from "../MapReady";

export default function Overview() {
  const { locations, trend, incidents, reports, broadcasts, shelters } = useFloodData();

  const counts = useMemo(() => ({
    safe: locations.filter((l) => l.risk === "safe").length,
    warning: locations.filter((l) => l.risk === "warning").length,
    danger: locations.filter((l) => l.risk === "danger").length,
  }), [locations]);

  const atRisk = locations.filter((l) => l.risk === "danger").reduce((s, l) => s + l.population, 0);
  const activeIncidents = incidents.filter((i) => i.status !== "cleared");
  const unassigned = activeIncidents.filter((i) => !i.team).length;
  const openReports = reports.filter((r) => r.status !== "resolved").length;
  const sheltered = shelters.reduce((s, x) => s + x.occupancy, 0);
  const nearestForecast = locations.filter((l) => l.forecastHours != null && l.risk !== "danger").sort((a, b) => a.forecastHours - b.forecastHours)[0];

  const activity = useMemo(() => [
    ...incidents.map((i) => ({ id: `i${i.id}`, ts: i.startTs, kind: "critical", icon: "⚠", text: `Incident opened: ${i.zoneName} (peak ${i.peakLevel}%)${i.team ? ` · ${i.team} dispatched` : ""}`, link: "/incidents" })),
    ...reports.map((r) => ({ id: `r${r.id}`, ts: r.ts, kind: "info", icon: "📍", text: `${CATEGORIES[r.category]} reported in ${r.zoneName}: ${r.description}`, link: "/reports" })),
    ...broadcasts.map((b) => ({ id: `b${b.id}`, ts: b.ts, kind: "broadcast", icon: "📢", text: `${b.source === "auto" ? "Auto-alert" : "Broadcast"} to ${b.zoneName}`, link: "/broadcasts" })),
  ].sort((a, b) => b.ts - a.ts).slice(0, 12), [incidents, reports, broadcasts]);

  return (
    <>
      {unassigned > 0 && (
        <Link to="/incidents" className="action-banner">
          ⚠ {unassigned} active incident{unassigned > 1 ? "s" : ""} with no response team assigned. Dispatch now →
        </Link>
      )}

      <section className="kpi-row">
        <div className="kpi accent-danger">
          <div className="kpi-label">Active incidents</div>
          <div className="kpi-value">{activeIncidents.length}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Residents in danger zones</div>
          <div className="kpi-value">{formatCount(atRisk)}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Zones · safe / warn / danger</div>
          <div className="kpi-value">
            <span style={{ color: STATUS.safe.color }}>{counts.safe}</span>
            <span className="muted"> / </span>
            <span style={{ color: STATUS.warning.color }}>{counts.warning}</span>
            <span className="muted"> / </span>
            <span style={{ color: STATUS.danger.color }}>{counts.danger}</span>
          </div>
        </div>
        <div className="kpi accent-warning">
          <div className="kpi-label">Open citizen reports</div>
          <div className="kpi-value">{openReports}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">People sheltered</div>
          <div className="kpi-value">{sheltered.toLocaleString("en-IN")}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Next forecast breach</div>
          <div className="kpi-value small">{nearestForecast ? `${nearestForecast.name} · ~${nearestForecast.forecastHours}h` : "None predicted"}</div>
        </div>
      </section>

      <section className="grid-2">
        <div className="panel map-card">
          <div className="panel-head">
            <h2>Live Risk Map</h2>
            <Link to="/map" className="link">Open full map →</Link>
          </div>
          <MapContainer className="dark-map" center={[12.98, 80.23]} zoom={11} style={{ height: "380px", width: "100%", borderRadius: "10px" }} scrollWheelZoom={false}>
            <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <MapReady />
            {shelters.map((s) => (
              <CircleMarker key={s.id} center={[s.lat, s.lng]} radius={6} pathOptions={{ color: "#fff", fillColor: "#199e70", fillOpacity: 1, weight: 1.5 }}>
                <Popup>🏫 {s.name}<br />{s.occupancy}/{s.capacity} occupied</Popup>
              </CircleMarker>
            ))}
            {locations.map((loc) => (
              <CircleMarker key={loc.id} center={[loc.lat, loc.lng]} radius={12} pathOptions={{ color: STATUS[loc.risk].color, fillColor: STATUS[loc.risk].color, fillOpacity: 0.75, weight: 2 }}>
                <Popup><strong>{loc.name}</strong><br />{loc.level}% · {STATUS[loc.risk].label}<br /><Link to={`/sensors/${loc.id}`}>Zone detail →</Link></Popup>
              </CircleMarker>
            ))}
          </MapContainer>
        </div>

        <div className="panel alerts-card">
          <div className="panel-head">
            <h2>Activity Feed</h2>
            <Link to="/incidents" className="link">Incidents →</Link>
          </div>
          <div className="feed">
            {activity.length === 0 && <div className="empty">All quiet. No incidents, reports or broadcasts yet.</div>}
            {activity.map((a) => (
              <Link key={a.id} to={a.link} className={`feed-item ${a.kind}`}>
                <span className="feed-icon">{a.icon}</span>
                <div>
                  <div className="feed-text">{a.text}</div>
                  <div className="feed-time">{timeAgo(a.ts)}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="panel trend-card">
        <div className="panel-head">
          <h2>City-Wide Water Level Trend</h2>
          <Link to="/analytics" className="link">Full analytics →</Link>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={trend} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
            <CartesianGrid stroke="#2c2c2a" vertical={false} />
            <XAxis dataKey="time" stroke="#898781" tick={{ fontSize: 11 }} minTickGap={30} />
            <YAxis domain={[0, 100]} stroke="#898781" tick={{ fontSize: 11 }} />
            <Tooltip contentStyle={{ background: "#1a1a19", border: "1px solid #2c2c2a", borderRadius: 8, fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 11, color: "#c3c2b7" }} />
            {locations.map((loc) => (
              <Line key={loc.id} type="monotone" dataKey={loc.id} name={loc.name} stroke={ZONE_COLOR[loc.id]} dot={false} strokeWidth={2} isAnimationActive={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </section>
    </>
  );
}
