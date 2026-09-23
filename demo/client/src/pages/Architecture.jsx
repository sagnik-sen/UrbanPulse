const LAYERS = [
  { n: 1, title: "Physical Environment", desc: "Roads, Stormwater Drains, Lakes" },
  { n: 2, title: "Data Collection", desc: "IoT Sensors, Rain Gauges, Citizen Reports" },
  { n: 3, title: "Communication", desc: "MQTT, 5G, Wi-Fi, LoRaWAN" },
  { n: 4, title: "Processing", desc: "Apache Kafka, PostgreSQL" },
  { n: 5, title: "Cloud Infrastructure", desc: "AWS / Azure scalable storage" },
  { n: 6, title: "AI Intelligence", desc: "LSTM, Random Forest, XGBoost" },
  { n: 7, title: "Application Layer", desc: "GCC Dashboard, Mobile App" },
  { n: 8, title: "Decision & Action", desc: "Alerts, Traffic Diversion, Dispatch" },
];

const BUILT = new Set([6, 7, 8]);

export default function Architecture() {
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Proposed 8-Layer Architecture</h2>
        <span className="muted small">Guarantees &lt;5s latency, edge resilience, PDPB-compliant security</span>
      </div>
      <div className="layer-stack">
        {LAYERS.map((l) => (
          <div key={l.n} className={`layer-row ${BUILT.has(l.n) ? "built" : "planned"}`}>
            <div className="layer-num">{l.n}</div>
            <div className="layer-body">
              <div className="layer-title">{l.title}</div>
              <div className="layer-desc">{l.desc}</div>
            </div>
            <span className={`badge ${BUILT.has(l.n) ? "safe" : "warning"}`}>
              <span className="badge-dot" style={{ background: BUILT.has(l.n) ? "#0ca30c" : "#fab219" }} />
              {BUILT.has(l.n) ? "Prototyped in this demo" : "Planned — next phase"}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
