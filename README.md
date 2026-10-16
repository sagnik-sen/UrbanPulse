# UrbanPulse Chennai

Smart flood monitoring and response system for Chennai (forecasting, evacuation planning and blockchain-sealed records), built for BCSE355L – Design of Smart Cities (VIT Chennai).

Chennai floods almost every Northeast Monsoon (2015 floods, Cyclone Michaung in 2023), and response is still mostly reactive. UrbanPulse is a proposed system that combines IoT water-level sensors, flood forecasting and automated alerts so the city can act before roads go under.

## What's here

- `docs/DOCUMENTATION.md`: full technical documentation
- `UrbanPulse Chennai.pptx`: project presentation (problem, root cause, proposed architecture)
- `demo/`: working prototype of the application side of the system
  - **Command center** for GCC staff: live risk map and forecasts, IMD 24-hour rainfall alerts, incidents and dispatch, citizen reports fused with sensor readings, broadcasts, shelters with QR check-in, capacity-aware evacuation planning that puts vulnerable residents first, volunteer boat rescue, a reservoir release desk, a flood relief ledger, response-time accountability, and a time machine that replays Cyclone Michaung (2023) and the 2015 floods through the live system
  - **Citizen app** (English and Tamil, works offline): area status, safe route to an open shelter, official alerts with "why this alert?" explanations and read-aloud, a check for forwarded alert messages, flood and water-depth reports, rescue requests, relief tokens, and an SMS service for when mobile data is down
  - **Trust layer**: the audit log is sealed on the Shardeum blockchain by two agencies (GCC and the Water Resources Department), so any edit or deletion is detectable and anyone can verify an official alert
- `demo/server/experiments/`: reproducible experiments with results (evacuation policies, citizen-report fusion, tamper detection, a replay of real 2015 and 2023 rainfall, 200-ward city scale, live blockchain cost and latency, priority evacuation, boat rescue, relief queues)
- `demo/figures/`: paper figures generated from those results

Water-level sensors are simulated for now; rainfall is live (Open-Meteo) and real IoT hardware is the next phase.

## Run it

Needs Node.js 22.5+. Full setup, demo accounts and a demo walkthrough are in [demo/README.md](demo/README.md).
The complete technical reference (architecture, configuration, API, algorithms, blockchain layer, experiments, security, limitations) is [docs/DOCUMENTATION.md](docs/DOCUMENTATION.md).

```bash
cd demo/server && npm install && npm start
cd demo/client && npm install && npm run dev
```

Then open http://localhost:5173.

## Team

Sagnik Sen & Ayush Gupta · Faculty: Dr. Suseela S
