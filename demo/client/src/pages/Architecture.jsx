// The proposed 9-layer system, split per layer into what runs in this prototype and what comes next.
const LAYERS = [
  { n: 1, title: "Physical Environment", built: [], next: ["Roads, stormwater drains, lakes and reservoirs of Greater Chennai"] },
  {
    n: 2, title: "Data Collection",
    built: ["Live rainfall, pressure, humidity and wind per zone (Open-Meteo)", "Citizen flood reports with water depth", "Shelter QR check-ins", "Rescue requests and relief tokens"],
    next: ["IoT water-level sensors in drains and lakes (simulated today)"],
  },
  {
    n: 3, title: "Communication",
    built: ["Offline-capable citizen app (PWA)", "SMS command service (simulated gateway)", "Live push to staff over WebSockets"],
    next: ["MQTT, LoRaWAN and 5G links from field sensors", "Real SMS gateway"],
  },
  { n: 4, title: "Processing", built: ["Node.js server with SQLite (2-second tick)"], next: ["Apache Kafka stream processing, PostgreSQL"] },
  { n: 5, title: "Cloud Infrastructure", built: [], next: ["AWS / Azure hosting with scalable storage"] },
  {
    n: 6, title: "Forecasting & Planning",
    built: [
      "XGBoost heavy-rain model trained on 25 years of real ERA5 weather",
      "Damped-trend water-level forecast with 95% band",
      "IMD 24-hour rainfall rules",
      "Sensor + citizen-report fusion with reporter trust",
      "Capacity-aware evacuation (min-cost flow), vulnerable residents first",
      "Optimal boat-to-request matching",
    ],
    next: ["LSTM water-level forecast once real sensor data exists"],
  },
  {
    n: 7, title: "Application Layer",
    built: ["GCC command center", "Tamil / English citizen app", "Flood time machine replaying 2015 and 2023", "Public trust ledger and relief ledger"],
    next: [],
  },
  {
    n: 8, title: "Decision & Action",
    built: ["Alerts with \"why this alert?\" explanations", "Evacuation orders, team dispatch", "Volunteer boat rescue", "Reservoir releases", "Scheduled relief payments with staff token checks"],
    next: [],
  },
  {
    n: 9, title: "Trust & Accountability",
    built: ["Audit log sealed on the Shardeum blockchain every 5 minutes", "Two independent signers: GCC and Water Resources Dept.", "Anyone can verify an alert or the whole ledger", "Response-time accountability per incident"],
    next: ["Each agency runs its own signer on its own machine"],
  },
];

const FLOW = [
  { title: "Sources", items: ["Rain & weather (Open-Meteo)", "Water-level sensors*", "Citizens: reports, SMS, check-ins"] },
  { title: "Models", items: ["XGBoost heavy-rain risk", "Level forecast + IMD rules", "Report fusion"] },
  { title: "Decisions", items: ["Alerts and incidents", "Evacuation and rescue plans", "Releases and relief"] },
  { title: "People", items: ["Control room staff", "Citizens (app, SMS, voice)", "Volunteer boats, shops"] },
  { title: "Trust", items: ["Append-only audit log", "Merkle root on Shardeum", "Public verification"] },
];

const status = (l) => (l.built.length === 0 ? "planned" : l.next.length === 0 ? "built" : "partly");
const BADGE = {
  built: { label: "Running in this demo", color: "#0ca30c" },
  partly: { label: "Partly in this demo", color: "#fab219" },
  planned: { label: "Planned — next phase", color: "#898781" },
};

export default function Architecture() {
  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <h2>How data flows</h2>
          <span className="muted small">* simulated until IoT hardware is installed</span>
        </div>
        <div className="flow">
          {FLOW.map((step, i) => (
            <div key={step.title} className="flow-step-wrap">
              <div className={`flow-step${step.title === "Trust" ? " trust" : ""}`}>
                <div className="layer-title">{step.title}</div>
                {step.items.map((it) => <div key={it} className="layer-desc">{it}</div>)}
              </div>
              {i < FLOW.length - 1 && <div className="flow-arrow" aria-hidden="true">→</div>}
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Proposed 9-Layer Architecture</h2>
          <span className="muted small">Green: running · Amber: partly built · Grey: planned</span>
        </div>
        <div className="layer-stack">
          {LAYERS.map((l) => {
            const s = status(l);
            return (
              <div key={l.n} className={`layer-row ${s === "planned" ? "planned" : "built"}`}>
                <div className="layer-num">{l.n}</div>
                <div className="layer-body">
                  <div className="layer-title">{l.title}</div>
                  {l.built.length > 0 && <div className="layer-desc"><strong>In the demo:</strong> {l.built.join(" · ")}</div>}
                  {l.next.length > 0 && <div className="layer-desc muted"><strong>Next:</strong> {l.next.join(" · ")}</div>}
                </div>
                <span className="badge">
                  <span className="badge-dot" style={{ background: BADGE[s].color }} />
                  {BADGE[s].label}
                </span>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}
