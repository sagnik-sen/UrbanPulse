import { Link } from "react-router-dom";
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer } from "recharts";
import { useFloodData } from "../FloodDataContext";
import { STATUS, ZONE_COLOR } from "../constants";

export default function SensorGrid() {
  const { locations, history } = useFloodData();

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Sensor Grid</h2>
        <span className="muted small">6 simulated monitoring zones — click a card for full detail</span>
      </div>
      <div className="sensor-grid">
        {locations.map((loc) => (
          <Link key={loc.id} to={`/sensors/${loc.id}`} className="sensor-card sensor-card-link">
            <div className="sensor-head">
              <strong>{loc.name}</strong>
              <span className={`badge ${loc.risk}`}>
                <span className="badge-dot" style={{ background: STATUS[loc.risk].color }} />
                {STATUS[loc.risk].label}
              </span>
            </div>
            <div className="sensor-body">
              <div className="sensor-level">{loc.level}<span className="unit">%</span></div>
              <ResponsiveContainer width={140} height={46}>
                <AreaChart data={history[loc.id] || []}>
                  <defs>
                    <linearGradient id={`grad-${loc.id}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={ZONE_COLOR[loc.id]} stopOpacity={0.5} />
                      <stop offset="100%" stopColor={ZONE_COLOR[loc.id]} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area type="monotone" dataKey="level" stroke={ZONE_COLOR[loc.id]} fill={`url(#grad-${loc.id})`} strokeWidth={2} />
                  <XAxis dataKey="time" hide />
                  <YAxis domain={[0, 100]} hide />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            {loc.forecastHours != null && (
              <div className="sensor-forecast">AI forecast: critical in ~{loc.forecastHours}h</div>
            )}
          </Link>
        ))}
      </div>
    </section>
  );
}
