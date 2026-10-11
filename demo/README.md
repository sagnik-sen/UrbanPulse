# UrbanPulse Chennai — Flood Command Center (demo)

Multi-page admin console for GCC staff plus a public citizen app. The sensor feed
is simulated (stands in for IoT hardware) and the forecast is damped-trend
exponential smoothing (stands in for the LSTM in the deck). Reports, incidents, broadcasts and
thresholds are saved in SQLite (`demo/server/data/urbanpulse.db`) and survive
restarts; clear them from Settings → Demo Data before a presentation.

**Live rainfall is real:** every zone's current rain and 24-hour rain forecast come from
[Open-Meteo](https://open-meteo.com) (free, no key), refreshed every 10 minutes. With
Settings → Live rainfall linked (the default), each zone's real rain rate adds water to its
simulated drains, about +5 level points per mm/h, so heavy rain floods zones on its own.

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
- **Evacuation Planner**: pick zones (flooding ones are suggested) and a head count; it assigns every group to a shelter and road using the live forecast and optimal capacity-aware assignment, and compares that with a conventional current-conditions, first-come plan. Admins and officers can issue the plan as an evacuation order (holds shelter seats, alerts each zone, logs it on the incident)
- **Live Map**: zones, relief shelters and citizen reports as toggleable layers with a legend. Map clicks either file a report or plan an evacuation (real road route to the best open shelter, steering around red danger rings)
- **Sensor Grid / Zone Detail**: measured history plus a 2-hour forecast with a 95% band, projected peak, incidents, local reports, shelter occupancy, "Evacuation route" and "Simulate storm here"
- **Incidents**: one incident per danger episode (auto-opens, auto-clears); dispatch a response team, expand a row for the timeline, add field notes, export CSV
- **Citizen Reports**: modal form (issue type, severity, description, optional name, nearest zone auto-detected), open → in progress → resolved workflow, filters, export CSV
- **Broadcasts**: compose SMS/push/siren alerts by zone with templates; history shows automated vs manual alerts and recipient estimates
- **Relief Shelters**: capacity and live occupancy (rises while the linked zone has an active incident)
- **Citizen app** (`/citizen`, also linked from the sidebar): mobile-first public view with area status in plain language, the forecast, an automatic safe route when your area floods, official alerts, the report form and tap-to-call emergency numbers
- **Live rainfall**: real per-zone rain on the Overview, an hourly 24 h rain chart on Zone Detail, a rain line on sensor cards and in the citizen app
- **Audit Log** (admin): every staff action and sign-in attempt (thresholds, storms, dispatches, notes, report status, broadcasts, evacuation orders, rain link, failed/locked sign-ins), live, searchable, exportable as CSV. It is append-only, kept when demo data is cleared, and anchored to the Shardeum blockchain: **Anchor now** / **Verify on chain** show each entry as verified or tampered
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
9. **Evacuation Planner**: Velachery is suggested; set 600 people per zone, compare the proposed plan with the conventional one (shorter worst-case trip), then **Issue evacuation order**.
10. **Zone Detail → Velachery**: the forecast chart shows the spike and the projection draining back down. Click **Evacuation route** for the road route to a dry shelter.
11. **Citizen app** (open it on your phone or in a narrow window): pick Velachery. It flips to "Flooding in your area" and shows the safe route automatically.
12. After ~1 minute the level recedes and the incident auto-clears.

## Tests

```bash
cd demo/server && npm test
```

Covers the forecast model, forecast-based flood risk, route scoring and detours, optimal
shelter assignment (checked against brute force), the shared group planner, the seeded
simulator, SQLite storage and sign-in/roles.

## Evacuation experiment

```bash
cd demo/server && node experiments/run.js --seeds 200
```

Compares nine planning policies over 1,600 seeded flood scenarios on real road routes
(`experiments/routes.json`, fetched once with `experiments/fetch-routes.js`) and writes
`experiments/results/results.md`. Plans use only what is known at planning time and are
scored against what the water actually did.

## Blockchain audit anchoring

Audit entries are hashed into a Merkle tree in batches, and only the root goes on-chain to the
`AuditAnchor` contract (`server/chain/AuditAnchor.sol`) on the Shardeum Mezame testnet. Entries
stay in SQLite, so no personal data reaches the public ledger. Only whitelisted agency wallets can
anchor, and nothing can be edited once written. The server anchors every 5 minutes when there are
new entries; admins can also anchor immediately.

- Contract address, RPC and explorer: `server/chain/deployment.json`
- Signing key: `SHARDEUM_PRIVATE_KEY` in `server/.env` (git-ignored). Without it the app still runs, entries stay "pending", and verification still works read-only
- Change the contract: edit the `.sol`, then `node chain/compile.js` and `node chain/deploy.js` (deploying starts a fresh, empty ledger)

Tamper demo: anchor, then run `node chain/tamper-demo.js` in `demo/server` (it edits the newest
anchored entry directly in SQLite, as an insider would), then press **Verify on chain**. That row
turns red. `node chain/tamper-demo.js --undo` restores it.

Measured on Mezame: deploy 537k gas (~620 test SHM); the first batch 93k gas (~107 test SHM, it
initialises the batch list), later batches ~76k gas (~88 test SHM) whether they hold 1, 50 or 500
entries (gas estimates), since only the root is stored. Confirmation took ~3 s.

Limits: the demo has one key, so multi-agency signing is simulated (the contract supports more
agencies via `setAgency`). Entries are protected from the moment they are anchored, not before,
so the up-to-5-minute pending window is unprotected. Being append-only, the log also grows without
a cap (failed sign-ins from unknown users included).

## Talking points

- Swap `stepZones()` in `server/simulator.js` for real sensor ingestion and `server/forecast.js` for the trained LSTM once hardware/data exist. The rest of the app only reads the forecast path it returns
- Forecast: damped-trend exponential smoothing with a drainage term and a robust (median-based) 95% band. Demo time runs at 1 s = 1 min
- Routing: OSRM (public server) returns road routes; the planner adds detours around flooded zones, scores every candidate by drive time plus km through floodwater, and avoids shelters inside active floods. Falls back to a straight line if OSRM is unreachable. Needs internet, same as the map tiles
- Incidents use hysteresis (clear only 10 points below danger) and a 4-second debounce so sensor noise doesn't spam alerts
- Thresholds are live and global: changing them re-classifies every zone in real time
- Security: staff sign-in with scrypt-hashed passwords, database-backed sessions in an httpOnly cookie, lockout after 10 failed attempts. Roles are enforced on the server (the UI just hides what you can't use). The citizen app reads a separate public endpoint with no reporter names or dispatch details
- Accountability: an audit trail in SQLite records who did what and when; it is append-only, survives "clear demo data", and is anchored to the Shardeum blockchain so any later edit or deletion is detectable
- Persistence: Node's built-in SQLite, write-through from the in-memory working set, no native dependencies
