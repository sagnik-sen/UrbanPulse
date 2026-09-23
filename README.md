# UrbanPulse Chennai

AI-powered smart flood monitoring system for Chennai, built for BCSE355L – Design of Smart Cities (VIT Chennai).

Chennai floods almost every Northeast Monsoon (2015 floods, Cyclone Michaung in 2023), and response is still mostly reactive. UrbanPulse is a proposed system that combines IoT water-level sensors, flood forecasting and automated alerts so the city can act before roads go under.

## What's here

- `UrbanPulse Chennai.pptx`: project presentation (problem, root cause, proposed 8-layer architecture)
- `demo/`: working prototype of the application side of the system
  - **Command center** for GCC staff: live risk map, 2-hour flood forecasts, incident dispatch, citizen reports, public alert broadcasts, relief shelter tracking, flood-aware evacuation routing
  - **Citizen app**: area status in plain language, safe route to the nearest open shelter, official alerts, flood reporting

The sensor feed is simulated for now; real IoT hardware is the next phase.

## Run it

Needs Node.js 22.5+. Full setup, demo accounts and a demo walkthrough are in [demo/README.md](demo/README.md).

```bash
cd demo/server && npm install && npm start
cd demo/client && npm install && npm run dev
```

Then open http://localhost:5173.

## Team

Sagnik Sen & Ayush Gupta · Faculty: Dr. Suseela S
