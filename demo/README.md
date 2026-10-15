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
- **Boat Rescue** (staff): open requests sorted by need and waiting time, boats on a rescue, and the volunteer fleet. "Match boats (optimal)" and "Match boats (first-come)" pair requests with free boats; "Mark rescued" closes a request and frees its boat. Officers and admins register boats and set their status
- **Live Map**: zones, relief shelters and citizen reports as toggleable layers with a legend. Map clicks either file a report or plan an evacuation (real road route to the best open shelter, steering around red danger rings)
- **Sensor Grid / Zone Detail**: measured history plus a 2-hour forecast with a 95% band, projected peak, incidents, local reports, shelter occupancy, "Evacuation route" and "Simulate storm here"
- **Incidents**: one incident per danger episode (auto-opens, auto-clears); dispatch a response team, expand a row for the timeline, add field notes, export CSV
- **Citizen Reports**: modal form (issue type, severity, description, optional name, nearest zone auto-detected), open → in progress → resolved workflow, filters, export CSV
- **Broadcasts**: compose SMS/push/siren alerts by zone with templates; history shows automated vs manual alerts and recipient estimates
- **Relief Shelters**: capacity and live occupancy (rises while the linked zone has an active incident, or follows check-ins in live mode), with check-in QR codes for each shelter
- **Citizen app** (`/citizen`, also linked from the sidebar): mobile-first public view with area status in plain language, the forecast, an automatic safe route when your area floods, official alerts, the report form and tap-to-call emergency numbers
- **Live rainfall**: real per-zone rain on the Overview, an hourly 24 h rain chart on Zone Detail, a rain line on sensor cards and in the citizen app
- **Audit Log** (admin): every staff action and sign-in attempt (thresholds, storms, dispatches, notes, report status, broadcasts, evacuation orders, rain link, failed/locked sign-ins), live, searchable, exportable as CSV. It is append-only, kept when demo data is cleared, and anchored to the Shardeum blockchain: **Anchor now** / **Verify on chain** show each entry as verified or tampered
- **Analytics**, **Architecture** (9-layer diagram marking what runs in the demo and what is planned), **Settings** (live thresholds + Storm Simulator)

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
simulator, SQLite storage and sign-in/roles. The shelter assignment solver is successive shortest paths with Bellman-Ford that skips unchanged nodes, which gives plans identical to the old full sweep; the planning timings at 6 to 200 wards are in `server/experiments/results/scale.md`. Zone lookup during route scoring uses a grid index over zone centres (`server/risk.js`), which returns the same zone as a linear scan, and its effect on those timings is also in `scale.md`.

## Citizen report fusion

Each zone's water-level sensor is fused with citizen reports (`server/fusion.js`; the live wiring is in `server/fusion-live.js`). Sensor Grid shows each zone's recent report count and flood likelihood. Reports fade with a 30-second half-life and drop out after two minutes of demo time, so run the steps below quickly.

- An admin can take a zone's sensor offline (Sensor Grid, "Take sensor offline"). The zone then ignores its level and is judged from citizen reports alone. A "Flooding reported by citizens" badge appears at 50% likelihood.
- Each citizen browser has a random id. A reporter starts at 25% trust; reports that are resolved or in progress confirm them, and staff can mark a report "False report" to lower that reporter's trust. Citizen Reports shows each reporter's trust.
- A reporter with no confirmed reports is capped, so a burst from new devices cannot flag a zone (see `NEW_DEVICE_CAP`).
- Incidents, alerts and evacuation planning are still triggered by sensor levels only. Fusion is advisory in this version.

Demo steps (use one browser for the citizen app):

1. Sensor Grid: take one zone's sensor offline.
2. Citizen app: file three high-severity reports for that zone. The likelihood stays low, because a new reporter counts for little.
3. Citizen Reports: set three of those reports to "In progress". The reporter is now trusted, and the likelihood jumps. File three more reports from the citizen app; the zone shows "Flooding reported by citizens".
4. Mark one report "False report". That reporter's trust drops.

Model and experiment: `experiments/fusion.js`, results in `experiments/results/fusion.md`.

## IMD rainfall alerts

A second alert channel, alongside the level-based alerts, works from 24-hour rain totals (`server/imd.js`). Each zone's total over the 24 hours before the current hour is compared with the India Meteorological Department 24 h categories: heavy from 64.5 mm, very heavy from 115.6 mm, extremely heavy from 204.5 mm. The rule runs on every rainfall refresh (every 10 minutes), using fresh data only.

- Observed: an alert fires when a zone's category rises (warning for heavy, danger for very heavy or more). It does not repeat while the category holds, and a drop re-arms the zone.
- Forecast: an alert fires when the next 24 h total reaches very heavy or more (warning).
- Alerts are sent as SMS and push and are sealed like every other alert (verification code, public audit record, blockchain anchoring).

The choice of this rule is backed by `experiments/results/replay.md` (Model B). In the November 2023 control month, assumed flood-free, the 24-hour rule raised no alerts, while the level rule raised 1 to 35 warnings per zone. The trade-off is timing: for the Michaung flood the 24-hour rule's danger alerts came on the flood day itself (4 December), later than the level rule's for Velachery. It is added as a second channel, not a replacement.

## Why this alert?

Every official alert stores a machine-readable `reason` next to its text: which rule fired and the evidence it used. The reason is written into the alert's public audit record, so it is sealed on the blockchain with the alert. Citizens see it under "Why this alert?" on each alert, and the alert check shows it for a verified alert. Alerts sent before this change have no reason and show none.

- `level`: an incident opened because a zone's water level reached the danger line (level, danger line, rain in the last 24 h, forecast when available)
- `imd-observed` / `imd-forecast`: the IMD 24 h rain total and the category cut-off it crossed (`server/imd.js`)
- `manual`: a broadcast from the Broadcasts page (the sender's role only, no username)
- `evacuation-order`: an evacuation order (shelters and the number of people assigned from the zone)
- `reservoir-release`: a reservoir release (reservoir, river, cusecs, duration)

## Flood time machine

An admin can replay a past flood through the live system: Cyclone Michaung (December 2023) or the Chennai floods (November–December 2015). The replay feeds each hour of the event's real rainfall (`server/experiments/data/`) into the same zone model, IMD 24-hour rules and incident and alert paths as live data, and for 2015 it issues the Chembarambakkam release (29,000 cusecs) at its documented time. Open **Time Machine** in the sidebar (admins only), pick an event and a speed, and press **Start replay**. A red banner shows on every staff page while it runs; **Stop replay** ends it early, and it ends by itself at the end of the data.

Each event covers 216 hours, from 00:00 IST two days before the flood day to the end of its data. At each speed a full replay takes: 10 simulated minutes per 2-second tick, 43.2 min; 30, 14.4 min; 60, 7.2 min; 120, 3.6 min.

- Every replay alert is prefixed `[REPLAY <event> <IST time>]` and sent with source `replay`, so it cannot pass for a live alert. Replay alerts, incidents and audit entries are real records: they are anchored on the blockchain like any other, and cannot be removed from it.
- Limits to know before presenting: rainfall is ERA5 reanalysis, which underestimates peak totals (see `experiments/results/replay.md`). The replay runs the live zone model, including its daily sinusoidal base level, so its alert times differ from the experiment's Model A (for Michaung, Velachery's first danger alert is 3 December 21:00 here and 02:00 in Model A). The forecast 24-hour alerts use the observed next 24 hours, so they show what a perfect forecast would have triggered. The 2015 officialWarning time is not modelled. Incidents are not labelled, only alerts and audit entries. A server restart ends a running replay.

## Evacuation experiment

```bash
cd demo/server && node experiments/run.js --seeds 200
```

Compares nine planning policies over 1,600 seeded flood scenarios on real road routes
(`experiments/routes.json`, fetched once with `experiments/fetch-routes.js`) and writes
`experiments/results/results.md`. Plans use only what is known at planning time and are
scored against what the water actually did.

## Volunteer boat rescue

In the 2015 Chennai floods, fishermen's boats and volunteers carried out a large share of the rescues, and the requests were coordinated chaotically over social media. The rescue desk takes that work into one queue. A citizen taps "Need rescue? Request a boat" in the citizen app, gives the number of people, any medical, elderly, child or disability needs, and optionally a note and a phone number. The card then follows the request: waiting for a boat, boat on the way, marked rescued. Volunteer boats register with the control room (a demo fleet of six is seeded on first start). The control room matches boats to requests with the same min-cost assignment solver as the evacuation planner: travel time, with a head start for medical, disabled, elderly and child needs, and older requests first. Each step (request, assignment, completion, cancellation, boat changes) is written to the audit log.

Phone numbers are for the control room only. They are never sent to the public endpoints, the citizen status check returns only the status and boat name, and the live events go to signed-in staff sockets only. Audit entries carry no phone numbers or coordinates.

Assumptions for the matching and the 6-hour dispatch experiment (boat speed 8 km/h, straight-line distances, 10 minutes to load and 5 to unload) are listed in `server/experiments/results/rescue.md`. Reproduce with:

```bash
cd demo/server && node experiments/rescue.js
```

### Vulnerable residents first

A resident can register that someone at home needs help to evacuate (elderly, difficulty walking or using stairs, needs medical support, or an infant), with a head count of 1 to 10. The planner then gives those people first claim on suitable shelter beds.

- **Privacy:** the server stores only the zone, the kind of help and the count, under a random id that the resident keeps to cancel (`POST /api/vulnerable`, `DELETE /api/vulnerable/:id`). No names, phone numbers, addresses or coordinates are stored. Staff see per-zone totals only (`GET /api/vulnerable`). Each registration and cancellation is audited without the id. Registrations sit in one settings row, which suits a demo, not a city-scale registry.
- **Planning:** when a selected zone has registrations, the proposed plan places people in three tiers, each on the beds the earlier tiers left: mobility and medical needs in accessible shelters only, then elderly and infants in any shelter, then everyone else (`planWithPriority` in `server/planner.js`). The Planner shows the tiers. With no registrations the plan is unchanged.
- **Assumptions:** which shelters are accessible is illustrative (`accessible` in `server/simulator.js`), not surveyed. A person with a mobility or medical need who finds no free accessible bed stays unassigned; the planner does not fall back to a shelter they cannot use.
- **Evaluation:** `node experiments/priority.js` compares this with the single-stage plan on the same 1,600 scenarios, assuming 8% of evacuating residents are vulnerable (an assumption, not a measurement). See `experiments/results/priority.md`.

## Shelter check-in

In 2015, some Chennai relief camps overflowed while others nearby sat empty, because nobody knew who was where. Shelter occupancy can now come from real check-ins instead of the simulation.

- **Modes:** the admin switch on the Relief Shelters page sets the occupancy source. *Simulated* keeps the random drift that rises while the linked zone has an incident. *Live check-ins* sets each shelter's occupancy to the people currently checked in. Routing and the planners already read occupancy, so a full shelter drops out of new routes and plans automatically.
- **QR flow:** each shelter has a secret token. Staff open "Check-in QR" on the Relief Shelters page, download the PNG and print it at the shelter. Scanning it opens `/checkin/<shelter>?t=<token>`, where a household enters its size (1 to 15) and checks in. The page shows a household code; leaving, the same device checks out with the same code. A full shelter returns a message with the nearest shelters that have free beds. "Rotate code" (admin) replaces the token, so posters already printed stop working.
- **Privacy:** a household is a random id and a headcount. No names, phone numbers or addresses are stored, and staff see only households and people per shelter. Check-ins and check-outs are audited without the id. Because the token is on the poster, check-ins need physical presence at the shelter.
- **Limits:** the token is printed in the URL, so it can appear in server access logs. A person who has the poster can check in any group until the shelter is full. Check-ins are accepted in either mode; the capacity check uses the check-in count, while the displayed beds follow the selected occupancy mode.
- **Endpoints:** `PUT /api/shelters/mode`, `GET /api/shelters/tokens`, `POST /api/shelters/:id/token`, and the public `POST /api/shelters/:id/checkin` and `POST /api/shelters/:id/checkout`. Logic and tests are in `server/checkin.js` and `server/checkin.test.js`.

## Blockchain audit anchoring

Audit entries are hashed into a Merkle tree in batches, and only the root goes on-chain to the
`AuditAnchor` contract (`server/chain/AuditAnchor.sol`) on the Shardeum Mezame testnet. Entries
stay in SQLite, so no personal data reaches the public ledger. Only whitelisted agency wallets can
anchor, and nothing can be edited once written. The server anchors every 5 minutes when there are
new entries; admins can also anchor immediately.

- Contract address, RPC and explorer: `server/chain/deployment.json`
- Signing key: `SHARDEUM_PRIVATE_KEY` in `server/.env` (git-ignored). Without it the app still runs, entries stay "pending", and verification still works read-only
- Change the contract: edit the `.sol`, then `node chain/compile.js` and `node chain/deploy.js` (deploying starts a fresh, empty ledger)
- Benchmark: `node chain/bench.js --anchors 20` measures anchor latency, gas and cost on Shardeum. It deploys its own throwaway `AuditAnchor`, so the audit ledger is untouched, and costs roughly deploy + anchors × ~90 test SHM. Results go to `server/experiments/results/chain-bench.md`; add `--eth-gwei`/`--eth-usd` and `--polygon-gwei`/`--pol-usd` for Ethereum and Polygon estimates

**Second agency (Water Resources Department).** The Reservoir Desk's releases are signed by a
separate wallet, `SHARDEUM_WRD_PRIVATE_KEY` in `server/.env`, so the ledger shows two independent
agencies: reservoir releases are anchored by WRD and everything else by GCC. Register the WRD
wallet once with the contract admin key: `node chain/add-agency.js <address> "UrbanPulse demo: WRD reservoir desk"`.
The Audit Log marks WRD batches with "· WRD" and the release log shows "Sealed by WRD" for admins.

**Citizen alert check (fake forwarded messages).** Every broadcast, manual or automated, ends
with a code such as `Verify: UP-1A2B3C4D` (inside the text, so forwarded copies keep it) and gets a public audit record with no staff identity in it. In the citizen
app, "Got a forwarded flood message?" (paste the message or the code, or open a link like `/citizen?verify=UP-1A2B3C4D`) shows whether
the alert is genuine and unchanged: verified, pending (sealed within 5 minutes), altered, or not an
official alert. "Download proof" saves the entry with its Merkle inclusion proof, which anyone can
check against the contract without trusting the UrbanPulse server (the script pins the contract
address from `deployment.json`, so a proof pointing at another contract is rejected):

```bash
node chain/verify-proof.js urbanpulse-alert-UP-1A2B3C4D.json
```

Tamper demo: anchor, then run `node chain/tamper-demo.js` in `demo/server` (it edits the newest
anchored entry directly in SQLite, as an insider would), then press **Verify on chain**. That row
turns red. `node chain/tamper-demo.js --alert` instead rewrites the newest anchored public alert
into a hoax ("Chembarambakkam lake breached…"); checking its code in the citizen app then shows
"Record altered". `node chain/tamper-demo.js --undo` restores either.

Tamper experiment (offline, no gas): `node experiments/tamper.js --seeds 200` applies ten kinds
of insider tampering to seeded logs and runs the server's own verification; it writes
`experiments/results/tamper.md` (detection and precision per attack, verification time up to
100,000 entries, inclusion-proof sizes).

Measured on Mezame: deploy 537k gas (~620 test SHM); the first batch 93k gas (~107 test SHM, it
initialises the batch list), later batches ~76k gas (~88 test SHM) whether they hold 1, 50 or 500
entries (gas estimates), since only the root is stored. Confirmation took ~3 s.

Limits: both agency keys still live on one demo server; in deployment each agency would run its own
signer. Entries are protected from the moment they are anchored, not before,
so the up-to-5-minute pending window is unprotected. The server holds both the database and the
signing key: whoever compromises it cannot rewrite anchored history, but can anchor false new
entries from then on; independent agency keys on separate machines would limit that. Being append-only, the log also grows without
a cap (failed sign-ins from unknown users included).

Poster QR: in the Broadcasts page, a sealed alert has a **Poster QR** button. The QR encodes a link
to `verify.html` (in `demo/verifier/`) with the alert's entry, its Merkle siblings and the sealing
transaction hash in the URL fragment. Scanning it opens that page, which recomputes the fingerprint
(Merkle root) on the viewer's phone, with no UrbanPulse server involved, and links to the Shardeum
explorer transaction where the same fingerprint is stored. The page's contract and explorer
address are fixed in the file. Host `verify.html` on any static site and put its public URL in `client/.env.local` as
`VITE_VERIFIER_URL=...` (git-ignored); until then the QR is generated but flagged as not yet pointing anywhere.

## Offline and SMS

The citizen app (`/citizen`) can be installed to a phone's home screen and keeps working when the
network fails, as it did in the December 2015 Chennai floods. The service worker is
`client/public/sw.js` and runs only in production builds.

- **Cached:** the app's code and styles (after the first online visit), the citizen page, and the last
  levels, alerts, shelters and rainfall. The saved copy also sits in the browser under
  `urbanpulse.citizen.snapshot`, written at most every 10 seconds.
- **Not cached:** map tiles (the map is blank offline), route planning, reports, sign-in, the
  blockchain check and live socket updates. These always go to the network.

When the server cannot be reached the page shows the saved data with the time it was saved, and the
alert check compares a pasted code with the alerts saved on that phone.

Demo:

```bash
cd demo/server && npm start              # terminal 1
cd demo/client && npm run demo:offline   # terminal 2: production build on http://localhost:4173
```

Open http://localhost:4173/citizen while online, so the app is cached. Then stop the server
(Ctrl-C in terminal 1) and reload. The page shows the saved data with the offline banner.

**Simulated SMS.** For areas with no data, the citizen page has a "No internet? Use SMS" card that
posts to `POST /api/sms/inbound` (`sms.js`). This stands in for a telecom SMS gateway: nothing is
sent over a real network and the sender's number is not stored. Commands are case-insensitive:

- `VERIFY UP-1A2B3C4D`, or forward the whole alert text: replies GENUINE, PENDING, ALTERED or NOT an official alert.
- `SHELTER <area>` (`முகாம்`): the nearest shelter with free beds.
- `STATUS <area>` (`நிலை`): water level, risk, and the IMD 24 h rain category when there is one.
- `HELP` (`உதவி`), or anything else: the command menu.

Area names match an exact name, a prefix, or any part of a zone name, so `SHELTER mar` finds Pallikaranai Marshland.

## Abuse protection

Public routes (no sign-in) write data or cost a blockchain read, so each one has a fixed-window limit per client IP (`server/ratelimit.js`). A request over the limit gets `429` with a `Retry-After` header.

| Route | Limit |
|---|---|
| `POST /api/auth/login` | 20 per 10 min (on top of the per-account lockout) |
| `POST /api/citizen-report` | 10 per 10 min |
| `POST /api/rescue` | 5 per 10 min |
| `POST /api/rescue/:id/cancel` | 20 per 10 min |
| `GET /api/rescue/:id` | 120 per min |
| `POST /api/vulnerable`, `DELETE /api/vulnerable/:id` | 10 per hour, shared |
| `POST /api/sms/inbound` | 30 per min |
| `GET /api/alerts/verify/:code` | 60 per min |
| `GET /api/evacuation-route` | 30 per min |

Caps that stop slower spam, checked in the handlers:

- **Vulnerable registrations:** 409 once an area has 2,000 registrations; the stored list holds at most 20,000 entries in total.
- **Rescue requests:** 409 while 500 requests are open (status `open`, not yet assigned).
- **Citizen reports:** 409 when the same text (case-insensitive, trimmed) was filed in the same area in the last 10 minutes.

Limits are in memory: they reset on restart and are not shared between server processes. In development the Vite dev proxy makes every request come from one IP, so the limits apply to the proxy as a whole. A deployment behind a gateway should set `app.set("trust proxy", ...)` so that `req.ip` is the client.

## Talking points

- Swap `stepZones()` in `server/simulator.js` for real sensor ingestion and `server/forecast.js` for the trained LSTM once hardware/data exist. The rest of the app only reads the forecast path it returns
- Forecast: damped-trend exponential smoothing with a drainage term and a robust (median-based) 95% band. Demo time runs at 1 s = 1 min
- Routing: OSRM (public server) returns road routes; the planner adds detours around flooded zones, scores every candidate by drive time plus km through floodwater, and avoids shelters inside active floods. Falls back to a straight line if OSRM is unreachable. Needs internet, same as the map tiles
- Incidents use hysteresis (clear only 10 points below danger) and a 4-second debounce so sensor noise doesn't spam alerts
- Thresholds are live and global: changing them re-classifies every zone in real time
- Security: staff sign-in with scrypt-hashed passwords, database-backed sessions in an httpOnly cookie, lockout after 10 failed attempts. Roles are enforced on the server (the UI just hides what you can't use). The citizen app reads a separate public endpoint with no reporter names or dispatch details
- Accountability: an audit trail in SQLite records who did what and when; it is append-only, survives "clear demo data", and is anchored to the Shardeum blockchain so any later edit or deletion is detectable
- Persistence: Node's built-in SQLite, write-through from the in-memory working set, no native dependencies
