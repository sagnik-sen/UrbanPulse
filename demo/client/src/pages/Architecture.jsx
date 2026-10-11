const LAYERS = [
  { n: 1, title: "Physical Environment", desc: "Roads, Stormwater Drains, Lakes" },
  { n: 2, title: "Data Collection", desc: "Live Open-Meteo rainfall and citizen reports now; water-level sensors simulated until IoT hardware is installed" },
  { n: 3, title: "Communication", desc: "MQTT, 5G, Wi-Fi, LoRaWAN" },
  { n: 4, title: "Processing", desc: "Apache Kafka, PostgreSQL" },
  { n: 5, title: "Cloud Infrastructure", desc: "AWS / Azure scalable storage" },
  { n: 6, title: "Forecasting & Planning", desc: "Damped-trend smoothing forecast and capacity-aware evacuation planning now; LSTM / XGBoost once sensor data exists" },
  { n: 7, title: "Application Layer", desc: "GCC Dashboard, Mobile App" },
  { n: 8, title: "Decision & Action", desc: "Alerts, Evacuation Orders, Dispatch" },
  { n: 9, title: "Trust & Accountability", desc: "Audit log sealed on the Shardeum blockchain; citizens can verify any official alert" },
];

const BUILT = new Set([6, 7, 8, 9]);
const PARTLY = new Set([2]);

export default function Architecture() {
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Proposed 9-Layer Architecture</h2>
        <span className="muted small">Green: running in this demo · Amber: planned or partly built</span>
      </div>
      <div className="layer-stack">
        {LAYERS.map((l) => (
          <div key={l.n} className={`layer-row ${BUILT.has(l.n) || PARTLY.has(l.n) ? "built" : "planned"}`}>
            <div className="layer-num">{l.n}</div>
            <div className="layer-body">
              <div className="layer-title">{l.title}</div>
              <div className="layer-desc">{l.desc}</div>
            </div>
            <span className={`badge ${BUILT.has(l.n) ? "safe" : "warning"}`}>
              <span className="badge-dot" style={{ background: BUILT.has(l.n) ? "#0ca30c" : "#fab219" }} />
              {BUILT.has(l.n) ? "Prototyped in this demo" : PARTLY.has(l.n) ? "Partly in this demo" : "Planned — next phase"}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
