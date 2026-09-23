# UrbanPulse Chennai — Flood Command Center (demo)

Multi-page admin console for the status review. The sensor feed is simulated
(stands in for IoT hardware) and the forecast is a rule-based extrapolation
(stands in for the LSTM in the deck). Reports, incidents, broadcasts and
thresholds are saved in SQLite (`demo/server/data/urbanpulse.db`) and survive
restarts; clear them from Settings → Demo Data before a presentation.

Requires Node.js 22.5 or newer (uses the built-in `node:sqlite` module).

## Run

```bash
# terminal 1
cd demo/server && npm install && npm start

# terminal 2
cd demo/client && npm install && npm run dev
```

Open http://localhost:5173 and sign in. The citizen app at
http://localhost:5173/citizen needs no login.

| Account | Password | Role |
|---|---|---|
| `admin` | `admin123` | Everything: thresholds, Storm Simulator, broadcasts, clearing demo data |
| `officer` | `officer123` | Dispatch teams, add incident notes, update report status |
| `viewer` | `viewer123` | Read-only monitoring |

Override the demo passwords with `UP_ADMIN_PASSWORD`, `UP_OFFICER_PASSWORD` and
`UP_VIEWER_PASSWORD` before the first start (accounts are created once, in the database).

## Pages

- **Overview**: KPIs (active incidents, residents at risk, open reports, people sheltered), map, unified activity feed, "unassigned incident" banner
- **Live Map**: zones, relief shelters and citizen reports as toggleable layers with a legend. Map clicks either file a report or plan an evacuation (real road route to the best open shelter, steering around red danger rings)
- **Sensor Grid / Zone Detail**: measured history plus a 2-hour forecast with a 95% band, projected peak, incidents, local reports, shelter occupancy, "Evacuation route" and "Simulate storm here"
- **Incidents**: one incident per danger episode (auto-opens, auto-clears); dispatch a response team, expand a row for the timeline, add field notes, export CSV
- **Citizen Reports**: modal form (issue type, severity, description, optional name, nearest zone auto-detected), open → in progress → resolved workflow, filters, export CSV
- **Broadcasts**: compose SMS/push/siren alerts by zone with templates; history shows automated vs manual alerts and recipient estimates
- **Relief Shelters**: capacity and live occupancy (rises while the linked zone has an active incident)
- **Citizen app** (`/citizen`, also linked from the sidebar): mobile-first public view with area status in plain language, the forecast, an automatic safe route when your area floods, official alerts, the report form and tap-to-call emergency numbers
- **Analytics**, **Architecture** (8-layer diagram marking what's prototyped), **Settings** (live thresholds + Storm Simulator)

## Demo script (about 3 minutes)

0. **Sign in as admin** (click the demo account on the login page). Clear old data in Settings → Demo Data if needed.
1. **Overview**: "This is the GCC control room view: six sensor zones, live levels, shelters."
2. **Settings → Storm Simulator**: target Velachery, intensity 50, **Trigger storm**.
3. Within ~5s: a toast appears, the Incidents badge turns red, and the Overview shows the "no team assigned" banner.
4. **Broadcasts**: point out the AUTOMATED SMS that went out on its own (the deck's automated alert system).
5. **Incidents**: dispatch "NDRF Battalion 4", expand the row, add a note ("Pumps deployed"). Status becomes Responding.
6. **Live Map**: click near Velachery, file a High-severity "Rescue needed" report. It shows on the map and a toast fires.
7. **Relief Shelters**: occupancy climbing for the Velachery shelter.
8. **Architecture**: "Layers 6–8 are prototyped here; sensors, MQTT and Kafka are the next phase."
9. **Zone Detail → Velachery**: the forecast chart shows the spike and the projection draining back down. Click **Evacuation route** for the road route to a dry shelter.
10. **Citizen app** (open it on your phone or in a narrow window): pick Velachery. It flips to "Flooding in your area" and shows the safe route automatically.
11. After ~1 minute the level recedes and the incident auto-clears.

## Tests

```bash
cd demo/server && npm test
```

Covers the forecast model (breach detection, post-storm recession, band width) and the evacuation planner (flood exposure, detours, avoiding shelters inside floods, offline fallback).

## Talking points

- Swap `tick()` in `server/index.js` for real sensor ingestion and `server/forecast.js` for the trained LSTM once hardware/data exist. The rest of the app only reads the `forecast` path it returns
- Forecast: damped-trend exponential smoothing with a drainage term and a robust (median-based) 95% band. Demo time runs at 1 s = 1 min
- Routing: OSRM (public server) returns road routes; the planner adds detours around flooded zones, scores every candidate by drive time plus km through floodwater, and avoids shelters inside active floods. Falls back to a straight line if OSRM is unreachable. Needs internet, same as the map tiles
- Incidents use hysteresis (clear only 10 points below danger) and a 4-second debounce so sensor noise doesn't spam alerts
- Thresholds are live and global: changing them re-classifies every zone in real time
- Security: staff sign-in with scrypt-hashed passwords, database-backed sessions in an httpOnly cookie, lockout after 10 failed attempts. Roles are enforced on the server (the UI just hides what you can't use). The citizen app reads a separate public endpoint with no reporter names or dispatch details
- Persistence: Node's built-in SQLite, write-through from the in-memory working set, no native dependencies
