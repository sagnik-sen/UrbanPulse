import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { useFloodData } from "./FloodDataContext";
import { rainLabel, hourLabel, timeAgo } from "./constants";

const RAIN_BLUE = "#3987e5";

function Freshness({ rainfall }) {
  if (!rainfall?.updatedAt) return <span className="muted small">Live data unavailable{rainfall?.error ? ` (${rainfall.error})` : ""}</span>;
  return (
    <span className="muted small">
      {rainfall.source} · updated {timeAgo(rainfall.updatedAt)}
      {rainfall.stale && <span className="suggest-tag danger">stale</span>}
    </span>
  );
}

// one row per zone: rain now, next 24 h total, heaviest hour
export function RainStrip() {
  const { rainfall, rainLink, locations } = useFloodData();
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>🌧 Live Rainfall (real data)</h2>
        <Freshness rainfall={rainfall} />
      </div>
      {!rainfall?.updatedAt ? (
        <p className="muted small">Couldn't reach the weather service. The simulation keeps running without live rain.</p>
      ) : (
        <>
          <div className="rain-grid">
            {locations.map((l) => {
              const r = rainfall.zones[l.id];
              if (!r) return null;
              return (
                <div key={l.id} className="rain-cell">
                  <div className="small" style={{ fontWeight: 600 }}>{l.name}</div>
                  <div className="rain-now"><span className="route-num">{r.currentMmPerHr}</span> mm/h</div>
                  <div className="muted small">{rainLabel(r.currentMmPerHr)} now</div>
                  <div className="muted small">Next 24 h: <strong className="rain-total">{r.next24hMm} mm</strong>{r.peakMmPerHr > 0 && <> · peak {r.peakMmPerHr} mm/h at {hourLabel(r.peakAt)}</>}</div>
                </div>
              );
            })}
          </div>
          <p className="muted small" style={{ marginTop: 10 }}>
            {rainLink
              ? "Simulation linked: each zone's current rain rate adds water to its simulated drains (about +5 level points per mm/h)."
              : "Simulation not linked to live rain (Settings → Live rainfall)."}
          </p>
        </>
      )}
    </section>
  );
}

// hourly rain for one zone over the next 24 h
export function RainChart({ zoneId }) {
  const { rainfall } = useFloodData();
  const r = rainfall?.zones?.[zoneId];
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Rainfall: next 24 hours</h2>
        <Freshness rainfall={rainfall} />
      </div>
      {!r ? (
        <p className="muted small">No live rainfall data for this zone right now.</p>
      ) : (
        <>
          <p className="small" style={{ marginBottom: 10 }}>
            Now: <strong>{r.currentMmPerHr} mm/h</strong> ({rainLabel(r.currentMmPerHr).toLowerCase()}) · next 24 h total <strong>{r.next24hMm} mm</strong>
            {r.peakMmPerHr > 0 ? <> · heaviest {r.peakMmPerHr} mm/h at {hourLabel(r.peakAt)}</> : " · no rain expected"}
          </p>
          <HeavyRainRisk risk={r.heavyRainRisk} />
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={r.hourly.map((h) => ({ ...h, label: hourLabel(h.time) }))} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
              <CartesianGrid stroke="#2c2c2a" vertical={false} />
              <XAxis dataKey="label" stroke="#898781" tick={{ fontSize: 11 }} interval={2} />
              <YAxis stroke="#898781" tick={{ fontSize: 11 }} allowDecimals unit=" mm" width={60} />
              <Tooltip
                contentStyle={{ background: "#1a1a19", border: "1px solid #2c2c2a", borderRadius: 8, fontSize: 12 }}
                formatter={(v, _n, item) => [`${v} mm${item.payload.prob != null ? ` (${item.payload.prob}% chance)` : ""}`, "Rain"]}
              />
              <Bar dataKey="mm" fill={RAIN_BLUE} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </>
      )}
    </section>
  );
}

// compact line for cards
export function RainLine({ zoneId }) {
  const { rainfall } = useFloodData();
  const r = rainfall?.zones?.[zoneId];
  if (!r) return null;
  const risk = r.heavyRainRisk;
  return (
    <div className="muted small">
      🌧 {r.currentMmPerHr} mm/h now · {r.next24hMm} mm next 24 h
      {risk && <> · heavy-rain risk <strong style={{ color: risk.alert ? "#fab219" : undefined }}>{Math.round(risk.probability * 100)}%</strong></>}
    </div>
  );
}

// XGBoost heavy-rain model (server/heavyrain.js): advisory, shown beside the forecast, never raises alerts
const pct = (p) => `${Math.round(p * 1000) / 10}%`;
function HeavyRainRisk({ risk }) {
  if (!risk) return null;
  return (
    <p className="small" style={{ margin: "0 0 10px" }}>
      Heavy-rain risk (XGBoost):{" "}
      <strong style={{ color: risk.alert ? "#fab219" : undefined }}>{pct(risk.probability)}</strong> chance of 64.5 mm or more in the next 24 h
      <span className="muted"> · {risk.alert ? "above" : "below"} the model's alert line of {pct(risk.threshold)} · learned from 2000–2016 ERA5 weather, advisory only</span>
    </p>
  );
}
