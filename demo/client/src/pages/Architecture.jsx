const LAYERS = [
  { n: 1, title: "Physical Environment", desc: "Roads, Stormwater Drains, Lakes" },
  { n: 2, title: "Data Collection", desc: "Live Open-Meteo rainfall, citizen flood and water-depth reports, shelter check-ins; water-level sensors simulated until IoT hardware is installed" },
  { n: 3, title: "Communication", desc: "Offline-capable citizen app and an SMS command service (simulated gateway) now; MQTT, 5G, LoRaWAN planned" },
  { n: 4, title: "Processing", desc: "Apache Kafka, PostgreSQL" },
  { n: 5, title: "Cloud Infrastructure", desc: "AWS / Azure scalable storage" },
  { n: 6, title: "Forecasting & Planning", desc: "Damped-trend forecast, IMD 24-hour rainfall rules, sensor + citizen-report fusion, capacity-aware evacuation with vulnerable residents first, optimal boat matching; LSTM / XGBoost once sensor data exists" },
  { n: 7, title: "Application Layer", desc: "GCC command center and a Tamil / English citizen app; a time machine replays the 2015 and 2023 floods" },
  { n: 8, title: "Decision & Action", desc: "Alerts with explanations, evacuation orders, dispatch, volunteer boat rescue, reservoir releases, relief distribution" },
  { n: 9, title: "Trust & Accountability", desc: "Audit log sealed on the Shardeum blockchain by two agencies; citizens can verify any official alert; public relief ledger" },
];

const BUILT = new Set([6, 7, 8, 9]);
const PARTLY = new Set([2, 3]);

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
