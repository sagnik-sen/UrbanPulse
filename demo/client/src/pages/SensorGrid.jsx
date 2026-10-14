import { Link } from "react-router-dom";
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer } from "recharts";
import { useFloodData } from "../FloodDataContext";
import { useAuth } from "../AuthContext";
import { STATUS, ZONE_COLOR } from "../constants";
import { RainLine } from "../Rainfall";

const DECLARE_P = 0.5; // matches PARAMS.DECLARE_P in server/fusion.js
const IMD_LABEL = { heavy: "Heavy rain", veryHeavy: "Very heavy rain", extremelyHeavy: "Extremely heavy rain" };

function imdBadge(prefix, category) {
  if (!category || category === "none") return null;
  return (
    <span className={`badge ${category === "heavy" ? "warning" : "danger"}`}>{prefix}{IMD_LABEL[category]}</span>
  );
}

export default function SensorGrid() {
  const { locations, history, offlineSensors, setSensorOnline, pushToast, rainfall } = useFloodData();
  const { can } = useAuth();

  // the card is a link, so the toggle must not also navigate
  const toggleSensor = (e, zoneId, online) => {
    e.preventDefault();
    e.stopPropagation();
    setSensorOnline(zoneId, online).catch((err) => pushToast({ kind: "danger", title: "Sensor change failed", text: err.message }));
  };

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Sensor Grid</h2>
        <span className="muted small">6 simulated monitoring zones — click a card for full detail</span>
      </div>
      <div className="sensor-grid">
        {locations.map((loc) => {
          const offline = offlineSensors.includes(loc.id);
          const fused = loc.fused;
          const imd = rainfall?.zones?.[loc.id];
          return (
            <Link key={loc.id} to={`/sensors/${loc.id}`} className="sensor-card sensor-card-link">
              <div className="sensor-head">
                <strong>{loc.name}</strong>
                {/* an offline sensor has no reading, so no level-based risk either */}
                {!offline && (
                  <span className={`badge ${loc.risk}`}>
                    <span className="badge-dot" style={{ background: STATUS[loc.risk].color }} />
                    {STATUS[loc.risk].label}
                  </span>
                )}
              </div>
              {(offline || can.manage) && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                  {offline && <span className="badge"><span className="badge-dot" style={{ background: "#898781" }} />Sensor offline</span>}
                  {offline && fused?.p >= DECLARE_P && (
                    <span className="badge" style={{ background: STATUS.danger.color }}>Flooding reported by citizens</span>
                  )}
                  {can.manage && (
                    <button type="button" className="btn ghost small" onClick={(e) => toggleSensor(e, loc.id, offline)}>
                      {offline ? "Bring sensor online" : "Take sensor offline"}
                    </button>
                  )}
                </div>
              )}
              <div className="sensor-body">
                {offline ? (
                  <div className="sensor-level muted" style={{ fontSize: 16 }}>No reading</div>
                ) : (
                  <>
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
                  </>
                )}
              </div>
              {!offline && loc.forecastHours != null && (
                <div className="sensor-forecast">Forecast: critical in ~{loc.forecastHours}h</div>
              )}
              {fused && (
                <div className="sensor-forecast">Citizen reports: {fused.recentReports} recent · flood likelihood {Math.round(fused.p * 100)}%</div>
              )}
              {imd && (
                <>
                  <div className="sensor-forecast">Rain 24 h: {imd.past24hMm} mm observed · {imd.next24hMm} mm forecast</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                    {imdBadge("IMD: ", imd.imdObserved)}
                    {imdBadge("IMD forecast: ", imd.imdForecast)}
                  </div>
                </>
              )}
              <div style={{ marginTop: 6 }}><RainLine zoneId={loc.id} /></div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
