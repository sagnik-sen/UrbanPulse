import { useFloodData } from "../FloodDataContext";
import { STATUS } from "../constants";

function fillColor(pct) {
  if (pct >= 90) return "#d03b3b";
  if (pct >= 60) return "#fab219";
  return "#0ca30c";
}

export default function Shelters() {
  const { shelters, locations } = useFloodData();
  const totalCap = shelters.reduce((s, x) => s + x.capacity, 0);
  const totalOcc = shelters.reduce((s, x) => s + x.occupancy, 0);

  return (
    <>
      <section className="kpi-row" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
        <div className="kpi"><div className="kpi-label">Shelters</div><div className="kpi-value">{shelters.length}</div></div>
        <div className="kpi"><div className="kpi-label">People sheltered</div><div className="kpi-value">{totalOcc.toLocaleString("en-IN")}</div></div>
        <div className="kpi"><div className="kpi-label">Beds available</div><div className="kpi-value">{(totalCap - totalOcc).toLocaleString("en-IN")}</div></div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Relief Shelters</h2>
          <span className="muted small">Occupancy rises automatically while the linked zone has an active incident</span>
        </div>
        <div className="shelter-grid">
          {shelters.map((s) => {
            const pct = Math.round((s.occupancy / s.capacity) * 100);
            const zone = locations.find((l) => l.id === s.zoneId);
            return (
              <div key={s.id} className="sensor-card">
                <div className="sensor-head">
                  <strong>{s.name}</strong>
                  {pct >= 90 && <span className="badge"><span className="badge-dot" style={{ background: "#d03b3b" }} />Near full</span>}
                </div>
                <div className="muted small" style={{ marginBottom: 10 }}>
                  Serves {zone?.name}
                  {zone && <> · zone <span style={{ color: STATUS[zone.risk].color }}>{STATUS[zone.risk].label.toLowerCase()}</span></>}
                </div>
                <div className="occ-row">
                  <span className="sensor-level" style={{ fontSize: 22 }}>{s.occupancy}</span>
                  <span className="muted small">/ {s.capacity} capacity</span>
                </div>
                <div className="meter" role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${s.name} occupancy`}>
                  <div className="meter-fill" style={{ width: `${pct}%`, background: fillColor(pct) }} />
                </div>
                <div className="muted small" style={{ marginTop: 6 }}>{pct}% full</div>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}
