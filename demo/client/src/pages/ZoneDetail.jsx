import { useParams, Link } from "react-router-dom";
import { ComposedChart, Area, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, Legend } from "recharts";
import { useFloodData } from "../FloodDataContext";
import { useAuth } from "../AuthContext";
import { RainChart } from "../Rainfall";
import { STATUS, ZONE_COLOR, INCIDENT_STATUS, CATEGORIES, SEVERITY, timeAgo, duration, formatCount } from "../constants";

const SIM_MIN_PER_TICK = 2; // matches server: one 2s tick = 2 simulated minutes

export default function ZoneDetail() {
  const { id } = useParams();
  const { locations, history, incidents, reports, shelters, thresholds, triggerStorm, pushToast } = useFloodData();
  const { can } = useAuth();
  const loc = locations.find((l) => l.id === id);

  if (!loc) {
    return (
      <section className="panel">
        <p className="muted">Zone not found. <Link className="link" to="/sensors">Back to Sensor Grid</Link></p>
      </section>
    );
  }

  const zoneIncidents = incidents.filter((i) => i.zoneId === id);
  const zoneReports = reports.filter((r) => r.zoneId === id);
  const zoneShelters = shelters.filter((s) => s.zoneId === id);

  const past = (history[loc.id] || []).slice(-40);
  const path = loc.forecast || [];
  const chartData = [
    ...past.map((p, i) => {
      const isNow = i === past.length - 1;
      const point = { label: isNow ? "now" : `-${(past.length - 1 - i) * SIM_MIN_PER_TICK}m`, level: p.level };
      return isNow ? { ...point, forecast: p.level, band: [p.level, p.level] } : point;
    }),
    ...path.map((p) => ({ label: `+${p.h * SIM_MIN_PER_TICK}m`, forecast: p.mean, band: [p.lo, p.hi] })),
  ];
  const peak = path.reduce((best, p) => (!best || p.mean > best.mean ? p : best), null);

  const storm = async () => {
    await triggerStorm(id, 40);
    pushToast({ kind: "warning", title: "Storm injected", text: `+40 surge on ${loc.name}` });
  };

  return (
    <>
      <div className="panel-head" style={{ marginBottom: 16 }}>
        <div>
          <Link to="/sensors" className="link small">← Sensor Grid</Link>
          <h2 style={{ fontSize: 22, marginTop: 4 }}>{loc.name}</h2>
        </div>
        <div className="head-actions">
          <span className="badge"><span className="badge-dot" style={{ background: STATUS[loc.risk].color }} />{STATUS[loc.risk].label}</span>
          <Link to={`/map?evacFrom=${loc.id}`} className="btn ghost">🧭 Evacuation route</Link>
          {can.manage && <Link to="/broadcasts" className="btn ghost">Broadcast to zone</Link>}
          {can.manage && <button className="btn danger" onClick={storm}>⛈ Simulate storm here</button>}
        </div>
      </div>

      <section className="kpi-row" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        <div className="kpi"><div className="kpi-label">Current water level</div><div className="kpi-value" style={{ color: STATUS[loc.risk].color }}>{loc.level}%</div></div>
        <div className="kpi"><div className="kpi-label">AI forecast</div><div className="kpi-value small">{loc.risk === "danger" ? "At critical level" : loc.forecastHours != null ? `Critical in ~${loc.forecastHours}h` : "Stable / receding"}</div></div>
        <div className="kpi"><div className="kpi-label">Population</div><div className="kpi-value small">{formatCount(loc.population)}</div></div>
        <div className="kpi"><div className="kpi-label">Projected peak (next 2h)</div><div className="kpi-value small">{peak ? `${peak.mean}% at +${peak.h * SIM_MIN_PER_TICK}m` : "Gathering data…"}</div></div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Water Level: History &amp; 2-Hour Forecast</h2>
          <span className="muted small">Demo time: 1 s = 1 min · dashed lines: warning ≥{thresholds.warning}%, danger ≥{thresholds.danger}%</span>
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={chartData} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
            <CartesianGrid stroke="#2c2c2a" vertical={false} />
            <XAxis dataKey="label" stroke="#898781" tick={{ fontSize: 11 }} interval={9} />
            <YAxis domain={[0, 100]} stroke="#898781" tick={{ fontSize: 11 }} />
            <Tooltip
              contentStyle={{ background: "#1a1a19", border: "1px solid #2c2c2a", borderRadius: 8, fontSize: 12 }}
              formatter={(v, name) => (Array.isArray(v) ? [`${v[0]}–${v[1]}%`, name] : [`${v}%`, name])}
            />
            <Legend wrapperStyle={{ fontSize: 11, color: "#c3c2b7" }} />
            <ReferenceLine y={thresholds.warning} stroke="#fab219" strokeDasharray="4 4" />
            <ReferenceLine y={thresholds.danger} stroke="#d03b3b" strokeDasharray="4 4" />
            <ReferenceLine x="now" stroke="#898781" label={{ value: "now", fill: "#c3c2b7", fontSize: 11, position: "insideTopRight" }} />
            <Area type="monotone" dataKey="band" name="95% range" stroke="none" fill={ZONE_COLOR[loc.id]} fillOpacity={0.18} isAnimationActive={false} />
            <Area type="monotone" dataKey="level" name="Measured" stroke={ZONE_COLOR[loc.id]} fill={ZONE_COLOR[loc.id]} fillOpacity={0.25} strokeWidth={2} isAnimationActive={false} connectNulls={false} />
            <Line type="monotone" dataKey="forecast" name="Forecast" stroke="#ffffff" strokeDasharray="6 4" strokeWidth={2} dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
        <p className="muted small" style={{ marginTop: 8 }}>Model: damped-trend exponential smoothing over the last 30 readings (a stand-in for the trained LSTM).</p>
      </section>

      <RainChart zoneId={loc.id} />

      <section className="grid-3">
        <div className="panel">
          <div className="panel-head"><h2>Incidents</h2><Link className="link" to="/incidents">All →</Link></div>
          {zoneIncidents.length === 0 && <div className="empty">No incidents recorded.</div>}
          {zoneIncidents.slice(0, 6).map((i) => (
            <div key={i.id} className="list-row">
              <span className="badge"><span className="badge-dot" style={{ background: INCIDENT_STATUS[i.status].color }} />{INCIDENT_STATUS[i.status].label}</span>
              <span className="small">Peak {i.peakLevel}% · {duration(i.startTs, i.endTs)}</span>
              <span className="muted small">{i.team ?? "Unassigned"}</span>
            </div>
          ))}
        </div>

        <div className="panel">
          <div className="panel-head"><h2>Citizen Reports</h2><Link className="link" to="/reports">All →</Link></div>
          {zoneReports.length === 0 && <div className="empty">No reports from this zone.</div>}
          {zoneReports.slice(0, 6).map((r) => (
            <div key={r.id} className="list-row">
              <span className="badge"><span className="badge-dot" style={{ background: SEVERITY[r.severity].color }} />{CATEGORIES[r.category]}</span>
              <span className="small desc-cell">{r.description}</span>
              <span className="muted small">{timeAgo(r.ts)}</span>
            </div>
          ))}
        </div>

        <div className="panel">
          <div className="panel-head"><h2>Relief Shelters</h2><Link className="link" to="/shelters">All →</Link></div>
          {zoneShelters.map((s) => {
            const pct = Math.round((s.occupancy / s.capacity) * 100);
            return (
              <div key={s.id} style={{ marginBottom: 12 }}>
                <div className="small" style={{ marginBottom: 6 }}>{s.name}</div>
                <div className="meter"><div className="meter-fill" style={{ width: `${pct}%`, background: pct >= 90 ? "#d03b3b" : pct >= 60 ? "#fab219" : "#0ca30c" }} /></div>
                <div className="muted small" style={{ marginTop: 4 }}>{s.occupancy}/{s.capacity} occupied</div>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}
