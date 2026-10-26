# UrbanPulse Chennai: Technical Documentation

Smart flood monitoring and response system for Chennai.
BCSE355L Design of Smart Cities, VIT Chennai. Team: Sagnik Sen and Ayush Gupta. Faculty: Dr. Suseela S.

This document is the single reference for the project: what it does, how it is built, how to run and
configure it, every API route, the algorithms, the blockchain layer, the experiments and their results,
the security model and the known limits. `demo/README.md` keeps the short run guide and feature notes.

## Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Repository layout](#3-repository-layout)
4. [Setup and running](#4-setup-and-running)
5. [Configuration](#5-configuration)
6. [Users and roles](#6-users-and-roles)
7. [Features](#7-features)
8. [API reference](#8-api-reference)
9. [Real-time events](#9-real-time-events)
10. [Data model](#10-data-model)
11. [Algorithms](#11-algorithms)
12. [Blockchain audit layer](#12-blockchain-audit-layer)
13. [Experiments and results](#13-experiments-and-results)
14. [Paper figures](#14-paper-figures)
15. [Testing](#15-testing)
16. [Security and privacy](#16-security-and-privacy)
17. [Data sources and licences](#17-data-sources-and-licences)
18. [Limitations](#18-limitations)
19. [Troubleshooting](#19-troubleshooting)
20. [Demo walkthrough](#20-demo-walkthrough)

---

## 1. Overview

### Problem

Chennai floods in most Northeast Monsoon seasons (the December 2015 floods, Cyclone Michaung in
December 2023). Response is still mostly reactive: alerts arrive late, shelters overflow while others
nearby stay empty, rescue requests are coordinated over social media, relief is collected in long
queues, and forwarded fake alerts spread faster than official ones.

### What UrbanPulse does

UrbanPulse is a working prototype of the application side of a city flood system. It has three parts:

- **Command center** for Greater Chennai Corporation (GCC) staff: live risk map and forecasts, IMD
  rainfall alerts, incidents and dispatch, citizen reports fused with sensor readings, broadcasts,
  shelters with QR check-in, capacity-aware evacuation planning with vulnerable residents first,
  volunteer boat rescue, a reservoir release desk, a flood relief ledger, response-time accountability,
  and a time machine that replays real past floods through the live system.
- **Citizen app** (English and Tamil, works offline): area status, safe route to an open shelter,
  official alerts with explanations and read-aloud, a check for forwarded alert messages, flood and
  water-depth reports, rescue requests, relief tokens, and an SMS command service.
- **Trust layer**: the audit log is sealed on the Shardeum blockchain by two agencies (GCC and the
  Water Resources Department), so any later edit or deletion is detectable and anyone can verify an
  official alert without trusting the UrbanPulse server.

### What is real and what is simulated

| Part | Status |
|---|---|
| Rainfall (current and 24 h forecast, per zone) | Real, Open-Meteo, refreshed every 10 min |
| Historical rainfall (2015, 2023) | Real, ERA5 reanalysis via Open-Meteo |
| Road routes | Real, OSRM on OpenStreetMap |
| Ward geometry (200 wards) | Real, DataMeet / Transparent Chennai |
| Blockchain anchoring | Real, Shardeum Mezame testnet |
| Water-level sensors | Simulated (stand-in for IoT hardware) |
| SMS gateway | Simulated (no message leaves the server) |
| Shelters, accessibility, boats, ration shops | Illustrative, not surveyed |
| Water-level forecast | Damped-trend exponential smoothing (stand-in for a trained model) |
| Heavy-rain risk model | Real: XGBoost trained on 25 years of ERA5 weather; live inputs from Open-Meteo |

The system is a prototype for six Chennai zones: Pallikaranai Marshland, Velachery, OMR
(Sholinganallur), T Nagar, Adyar and Mylapore. The scale benchmark runs the same code on all 200 GCC
wards.

---

## 2. Architecture

### Nine-layer design

| # | Layer | In this prototype |
|---|---|---|
| 1 | Physical environment | Roads, stormwater drains, lakes (the city itself) |
| 2 | Data collection | Partly: live rainfall, citizen flood and water-depth reports, shelter check-ins; water-level sensors simulated |
| 3 | Communication | Partly: offline-capable citizen app and simulated SMS service; MQTT, 5G, LoRaWAN planned |
| 4 | Processing | Planned: Apache Kafka, PostgreSQL |
| 5 | Cloud infrastructure | Planned: AWS / Azure |
| 6 | Forecasting and planning | Built: XGBoost heavy-rain risk on real ERA5 data, damped-trend level forecast, IMD 24 h rules, sensor + report fusion, capacity-aware evacuation, vulnerable-first planning, optimal boat matching |
| 7 | Application | Built: GCC command center, Tamil / English citizen app, flood time machine, public trust ledger |
| 8 | Decision and action | Built: alerts with explanations, evacuation orders, dispatch, boat rescue, reservoir releases, relief distribution |
| 9 | Trust and accountability | Built: two-agency blockchain-sealed audit log, public trust ledger anyone can verify, citizen alert verification, public relief ledger |

The app's Architecture page shows a data-flow diagram (sources, models, decisions, people, trust) and, for each layer, what runs in the demo and what comes next.

### Runtime components

```
 Open-Meteo (rain)     OSRM (roads)        Shardeum Mezame (AuditAnchor contract)
        |                   |                          ^
        v                   v                          | Merkle roots every 5 min
 +------------------------------------------------------------------+
 |  Node.js server (Express 5 + Socket.IO + node:sqlite)            |
 |  2 s tick: simulator -> forecast -> risk -> incidents -> alerts  |
 |  fusion, planners, rescue, relief, check-in, SMS, audit, anchor  |
 +------------------------------------------------------------------+
        |  REST /api/*                  |  Socket.IO (staff / admin / responder rooms)
        v                               v
 +------------------------------------------------------------------+
 |  React + Vite client                                             |
 |  staff command center (signed in)  |  citizen PWA (/citizen)     |
 +------------------------------------------------------------------+
        |
        v
 demo/verifier/verify.html (static page, checks a sealed alert from a QR code with no server)
```

- One server tick every 2 seconds is 2 simulated minutes. Each tick steps the zone model, runs the
  forecast for each zone, updates fusion, opens or clears incidents, and pushes the new state over
  Socket.IO.
- Rainfall and weather refresh every 10 minutes. The IMD 24 h rule and the XGBoost heavy-rain model run on each refresh.
- The audit anchor runs every 5 minutes when there are new entries.

---

## 3. Repository layout

```
README.md                    project summary
docs/DOCUMENTATION.md        this document
UrbanPulse Chennai.pptx      project presentation
demo/
  README.md                  run guide and feature notes
  client/                    React + Vite app
    public/sw.js             service worker (offline citizen app, production builds only)
    src/pages/               one file per page (see Features)
    src/*.jsx, *.js          shared components, contexts, i18n (English / Tamil), offline cache
  server/
    index.js                 Express app, routes, sockets, tick loop
    *.js                     one module per feature (table below)
    *.test.js                unit tests (node --test)
    chain/                   AuditAnchor contract and chain scripts
    experiments/             experiment scripts, input data, results
    data/urbanpulse.db       SQLite database (created on first start, git-ignored)
    models/                  trained heavy-rain model (XGBoost JSON) and its parity fixture
  ml/                        fetch_era5.py and train.py for the heavy-rain model (Python)
  verifier/                  static verify.html + payload.js for poster QR codes
  figures/                   make_figures.py and generated paper figures
```

### Server modules

| Module | Role |
|---|---|
| `index.js` | HTTP routes, roles, sockets, tick loop, rainfall refresh, anchoring timer |
| `simulator.js` | Zones, shelters, seeded water-level model, storm injection |
| `forecast.js` | Damped-trend forecast with drainage term and 95% band |
| `risk.js` | Forecast-based flood probability per point and time; grid index over zones |
| `evacuation.js` | OSRM routes, detours around flooded zones, route scoring |
| `assignment.js` | Min-cost max-flow shelter assignment; optimal and greedy matching |
| `planner.js` | Group planner shared by the app and experiments; `planWithPriority` |
| `fusion.js`, `fusion-live.js` | Sensor + citizen-report fusion model and its live wiring |
| `imd.js` | IMD 24 h rainfall categories and alert rules |
| `rainfall.js` | Open-Meteo client (rain, pressure, humidity, cloud, wind; 3 past days) |
| `heavyrain.js` | Heavy-rain features and XGBoost tree walk (no ML runtime in Node) |
| `reservoirs.js` | Chembarambakkam and Porur release desk |
| `rescue.js` | Boat rescue requests, fleet, matching |
| `vulnerable.js` | Privacy-preserving vulnerable resident register |
| `checkin.js` | Shelter tokens, check-in and check-out |
| `relief.js` | Relief tokens, slot scheduling, HMAC card keys, payments |
| `sms.js` | Simulated SMS command service |
| `timemachine.js` | Replays 2015 and 2023 rainfall through the live system |
| `accountability.js` | Response-time metrics from the audit log |
| `auth.js` | scrypt passwords, sessions, lockout |
| `ratelimit.js` | Fixed-window per-IP limits (this machine itself is not limited) |
| `db.js` | SQLite schema, write-through persistence, append-only audit log |
| `anchor.js` | Merkle batching, anchoring and verification |

### Client pages

Staff: Overview, LiveMap, SensorGrid, ZoneDetail, Incidents, CitizenReports, Broadcasts, Shelters,
Planner, Rescue, Reservoirs, Relief, Accountability, Analytics, Audit, TimeMachine, Architecture,
Settings. Public: Citizen, CheckIn, ReliefLedger, Trust (`/trust`).

---

## 4. Setup and running

### Requirements

- Node.js 22.5 or newer (uses the built-in `node:sqlite` module). Developed on Node 24.
- Internet access for map tiles, live rainfall and road routes. The app still starts without it;
  routes fall back to straight lines.
- Python 3.9+ only to retrain the heavy-rain model or rebuild the paper figures.

### Start

```bash
cd demo/server && npm install && npm start      # API on http://localhost:4000
cd demo/client && npm install && npm run dev    # app on http://localhost:5173
```

Open http://localhost:5173 and sign in, or open http://localhost:5173/citizen for the citizen app
(no sign-in).

### Offline build

The service worker only runs in production builds:

```bash
cd demo/client && npm run demo:offline          # build + preview on http://localhost:4173
```

Open http://localhost:4173/citizen once online, stop the server, reload: the page shows saved data
with an offline banner.

### Resetting

- Settings → Demo Data clears reports, incidents, broadcasts and rescues, resets thresholds and starts a
  new relief round (the old round's totals are sealed as `relief_round_closed`). The audit log is kept.
- A relief round runs 7 days from its first token. After that no token can be issued until a new round
  is started by clearing demo data.
- Deleting `demo/server/data/urbanpulse.db` starts from scratch (accounts are recreated on start).
  Batches already anchored stay on the blockchain, and verification then reports them as missing.
  Never run two copies of the server with the same keys and different databases.

---

## 5. Configuration

All server settings are environment variables, read from `demo/server/.env` (git-ignored) or the shell.
Never commit `.env`; it holds private keys.

| Variable | Purpose | Default |
|---|---|---|
| `SHARDEUM_PRIVATE_KEY` | GCC agency wallet that signs anchors | none: entries stay "pending", verification still works read-only |
| `SHARDEUM_WRD_PRIVATE_KEY` | Water Resources Department wallet, signs reservoir release batches | none: releases are anchored by GCC |
| `SHARDEUM_RPC` | RPC endpoint | `rpc` in `chain/deployment.json` |
| `SHARDEUM_EXPLORER` | Explorer base URL for links | `explorer` in `chain/deployment.json` |
| `RELIEF_PEPPER` | HMAC key for ration card numbers | generated once and stored in the settings table |
| `UP_ADMIN_PASSWORD`, `UP_OFFICER_PASSWORD`, `UP_VIEWER_PASSWORD` | Demo account passwords, read only when accounts are first created | `admin123`, `officer123`, `viewer123` |

Client (`demo/client/.env.local`, git-ignored):

| Variable | Purpose |
|---|---|
| `VITE_VERIFIER_URL` | Public URL of a hosted `demo/verifier/verify.html`, used by the Poster QR button. Unset: the QR is generated but flagged as not pointing anywhere. |

Contract address, chain id, RPC and explorer are in `demo/server/chain/deployment.json`.
Thresholds (warning 40, danger 70 on a 0–100 level scale), the live rainfall link and the shelter
occupancy mode are changed at runtime from Settings and Relief Shelters, and stored in SQLite.

---

## 6. Users and roles

| Account | Role | Can do |
|---|---|---|
| `admin` | admin | Everything: thresholds, storm simulator, sensors, broadcasts, time machine, shelter mode and tokens, audit log, anchoring, clearing demo data |
| `officer` | officer | Responder actions: dispatch, notes, report status, boats and rescue, relief payments, evacuation orders, reservoir releases |
| `viewer` | viewer | Read-only monitoring; rescue contact numbers are hidden |
| (none) | public | Citizen app, check-in, relief ledger, alert verification, SMS |

Roles are enforced on the server. The UI hides controls a role cannot use, but the server rejects the
request regardless. In the API reference, **staff** means any signed-in user, **responders** means
officer or admin.

---

## 7. Features

### 7.1 Monitoring and forecasting

- **Overview**: KPIs (active incidents, residents at risk, open reports, people sheltered), a
  "Sealed on Shardeum" strip (records sealed, waiting, last seal, signing agencies; links to the trust
  ledger), map, activity feed, live rainfall per zone, banner for incidents with no team assigned.
- **Heavy-rain risk (XGBoost)**: Sensor Grid cards and Zone Detail show each zone's probability of
  64.5 mm or more in the next 24 h, and whether it is above the model's alert line (Section 11.7).
  It is advisory: it never opens incidents or sends alerts.
- **Live Map**: zones, shelters and reports as layers. Clicking the map files a report or plans a
  road route to the best open shelter, steering around danger zones.
- **Sensor Grid / Zone Detail**: measured history, 2-hour forecast with a 95% band, projected peak,
  24 h rain chart, local incidents and reports, "Evacuation route", "Simulate storm here".
- **Live rainfall link**: each zone's real rain rate adds water to its simulated drains (about +5
  level points per mm/h at steady state), so heavy real rain floods zones on its own.

### 7.2 Alerts

- **Level alerts**: an incident opens when a zone reaches the danger line and an automated SMS/push
  alert goes out. Hysteresis (clears only 10 points below danger) and a 4-second debounce stop noise
  from spamming alerts.
- **IMD 24 h rainfall alerts**: a second channel from 24-hour rain totals: heavy ≥ 64.5 mm
  (warning), very heavy ≥ 115.6 mm and extremely heavy ≥ 204.5 mm (danger). Fires when the category
  rises; a drop re-arms the zone. A forecast alert fires when the next 24 h total reaches very heavy.
- **Why this alert?**: every alert stores a machine-readable `reason` (`level`, `imd-observed`,
  `imd-forecast`, `manual`, `evacuation-order`, `reservoir-release`) with the evidence used. The
  reason is part of the alert's public audit record, so it is sealed on-chain with the alert.
- **Broadcasts**: staff compose SMS/push/siren alerts by zone with templates; history separates
  automated and manual alerts.
- **Verification code**: every alert ends with `Verify: UP-XXXXXXXX` inside the text, so forwarded
  copies keep it.

### 7.3 Incidents and citizen reports

- **Incidents**: one per danger episode, auto-open and auto-clear; dispatch a team, timeline, field
  notes, CSV export.
- **Citizen reports**: issue type, severity, water depth (ankle ~10 cm, knee ~50 cm, waist ~100 cm,
  chest ~130 cm, not sure), description, optional name; zone auto-detected. Workflow open → in
  progress → resolved, or "False report". CSV export.
- **Fusion**: each zone's sensor is fused with citizen reports into a flood likelihood (Section 11.3).
  An admin can take a sensor offline to show the zone judged from reports alone. Fusion is advisory:
  incidents and alerts are still triggered by sensor levels.

### 7.4 Evacuation

- **Evacuation Planner**: choose zones and head counts. The planner assigns every group to a shelter
  and road route with the live forecast and optimal capacity-aware assignment, and compares this with
  a conventional current-conditions, first-come plan. Responders can issue it as an evacuation order
  (holds beds, alerts each zone, logs it on the incident).
- **Vulnerable residents first**: citizens register that someone at home needs help (elderly,
  mobility, medical, infant; 1 to 10 people). Only zone, kind and count are stored. The planner
  then places mobility and medical needs in accessible shelters first, then elderly and infants, then
  everyone else.
- **Citizen safe route**: when the citizen's area floods, the app shows a road route to an open dry
  shelter automatically.

### 7.5 Shelters

- Capacity and live occupancy. Two occupancy modes: *Simulated* (drifts up while the linked zone has
  an incident) and *Live check-ins* (people currently checked in).
- **QR check-in**: each shelter has a secret token on a printable QR poster. Scanning opens
  `/checkin/<shelter>?t=<token>`; a household enters its size (1 to 15) and gets a household code to
  check out later. A full shelter answers with the nearest shelters that have free beds. Admins can
  rotate the token, which invalidates printed posters.
- A full shelter drops out of new routes and plans automatically.

### 7.6 Volunteer boat rescue

- Citizens tap "Need rescue? Request a boat": number of people, medical / elderly / child / disability
  needs, optional note and phone. The card follows the request (waiting, boat on the way, rescued).
- Staff register volunteer boats (a demo fleet of six is seeded) and match them to requests with the
  same min-cost solver as the planner, or first-come for comparison. Medical and other needs get a head
  start; older requests come first.
- Phone numbers are visible to responders only, and never sent to public endpoints or viewers.

### 7.7 Reservoir release desk

Chembarambakkam Lake (downstream Adyar, T Nagar, Mylapore) and Porur Lake (downstream Velachery,
Pallikaranai). A responder issues a release (cusecs, duration); downstream zones get an alert with the
release as its reason, and the release raises downstream storm levels. Releases are anchored by the
WRD wallet when it is configured.

### 7.8 Flood relief ledger

Modelled on the Rs 6,000 per ration card payment after Cyclone Michaung.

- A citizen enters a ration card number and area and gets a token: shop, day and one-hour slot
  (`RF-` + six characters). Asking again returns the same token.
- Slots fill each shop's hourly rate (40 to 80 households an hour), earliest first, balancing the
  zone's two shops.
- Shop staff press **Check token** first: it shows the shop, slot (and whether now is before, in or
  after it), paid or not, and whether the entered card and chosen shop match, without paying. Then
  they record the payment; each token is paid once.
- A round runs 7 days from its first token. Clearing demo data starts a new round and seals the old
  round's totals (`relief_round_closed`).
- Card numbers are never stored: each card is keyed by `HMAC-SHA256(pepper, normalised card)`.
- The public ledger (`/relief-ledger`) shows per-shop and total counts and amounts for the current
  round. Every token and payment is a sealed audit entry, so the round's total equals its sealed
  payments × Rs 6,000.

### 7.9 Flood time machine

Admins replay Cyclone Michaung (December 2023) or the Chennai floods (2015) through the live system.
Each hour of real rainfall feeds the same zone model, IMD rules, incidents and alerts; the 2015
replay issues the Chembarambakkam release (29,000 cusecs) at its documented time. Each event covers
216 hours. Speeds of 10, 30, 60 and 120 simulated minutes per 2-second tick take 43.2, 14.4, 7.2 and
3.6 minutes. Replay alerts are prefixed `[REPLAY <event> <IST time>]` and sent with source `replay`.

### 7.10 Citizen app extras

- **English and Tamil** interface (Tamil is a draft awaiting proofreading).
- **Offline**: installable PWA; caches the app, the citizen page and the last levels, alerts,
  shelters and rainfall. Map tiles, routes, reports and live updates still need the network.
- **Forwarded message check**: paste a message or code (or open `/citizen?verify=UP-...`) to see
  verified, pending, altered, or not official. "Download proof" saves the entry with its Merkle proof.
- **Spoken alerts**: "Listen" reads an alert with the browser's Web Speech API; an opt-in switch reads
  new danger alerts for the citizen's area once. In Tamil a short Tamil preamble is spoken before the
  English text.
- **SMS service** (simulated gateway): `VERIFY <code>` or a forwarded alert, `SHELTER <area>`
  (`முகாம்`), `STATUS <area>` (`நிலை`), `HELP` (`உதவி`). Area names match by exact name, prefix
  or substring.

### 7.11 Accountability, audit and analytics

- **Audit Log** (admin): every staff action, sign-in attempt and public action, append-only, kept
  when demo data is cleared, exportable as CSV. **Anchor now** and **Verify on chain** mark each
  entry verified, pending or tampered.
- **Accountability**: one response timeline per incident (opened, alert, dispatch, evacuation order,
  cleared) built from audit entries, with each step's sealed status.
- **Analytics**: current water level by zone and the city-wide level trend.
- **Trust ledger** (`/trust`, public, also in the sidebar and linked from the citizen app): the
  contract and both agency wallets with explorer links, records sealed and waiting, the latest seals
  with their transactions, and a **Verify everything now** button anyone can press. It reports records
  changed or deleted after sealing, and on-chain seals from our agencies that have no records on this
  server.

---

## 8. API reference

Base path `/api`. JSON in and out. Staff routes need the session cookie from `POST /api/auth/login`.
Errors return `{ "error": "..." }` with 400 (bad input), 401 (not signed in), 403 (wrong role), 404,
409 (conflict or cap reached) or 429 (rate limit, with `Retry-After`).

### Public

| Method | Route | Purpose | Limit per IP |
|---|---|---|---|
| POST | `/auth/login` | Sign in | 20 / 10 min, plus lockout after 10 failures |
| POST | `/auth/logout` | Sign out | |
| GET | `/auth/me` | Current user | |
| GET | `/public-state` | Citizen view: zones, forecast, alerts, shelters, rain (no names or dispatch details) | |
| POST | `/citizen-report` | File a flood report | 10 / 10 min |
| POST | `/rescue` | Request a boat | 5 / 10 min |
| POST | `/rescue/:id/cancel` | Cancel own request | 20 / 10 min |
| GET | `/rescue/:id` | Status and boat name only | 120 / min |
| POST | `/vulnerable` | Register people needing help | 10 / hour (shared with delete) |
| DELETE | `/vulnerable/:id` | Cancel a registration | 10 / hour (shared) |
| POST | `/shelters/:id/checkin` | Household check-in (needs the shelter token) | 30 / 10 min (shared with checkout) |
| POST | `/shelters/:id/checkout` | Household check-out | 30 / 10 min (shared) |
| GET | `/evacuation-route` | Road route from a point to the best open shelter | 30 / min |
| POST | `/relief/token` | Get or recall a relief token | 10 / 10 min |
| POST | `/relief/token/lookup` | Look up a token by card | 20 / 10 min |
| GET | `/relief/ledger` | Public relief totals | |
| GET | `/alerts/verify/:code` | Check an alert code against the sealed record | 60 / min |
| GET | `/public/chain` | Trust ledger: contract, agencies, totals, latest seals (database reads only) | |
| POST | `/public/chain/verify` | Re-check every sealed record against the chain; summary only, one shared result for 30 s | 6 / min |
| POST | `/sms/inbound` | Simulated SMS command | 30 / min |

Caps checked in handlers: 2,000 vulnerable registrations per area and 20,000 in total; 500 open rescue
requests; a citizen report with the same text in the same area within 10 minutes is rejected (409).

Limits count per client address. The Vite proxy forwards each browser's address (`xfwd`) and the
server trusts that header only from loopback (`trust proxy` = `loopback`), so other devices cannot
spoof it. Requests from the server's own machine, such as the presenter's browser, are not limited.
A limited request gets 429 with `Retry-After`, and the app shows the server's message.

### Staff (any signed-in user)

| Method | Route | Purpose |
|---|---|---|
| GET | `/state` | Full command-center state |
| GET | `/timemachine` | Replay status and events |
| GET | `/rescue` | Rescue queue and fleet (contact numbers stripped for viewers) |
| GET | `/vulnerable` | Per-zone registration totals |
| POST | `/evacuation-plan` | Plan proposed vs conventional evacuation |
| GET | `/reservoirs` | Reservoir state and releases |
| GET | `/accountability` | Per-incident response timelines |

### Responders (officer, admin)

| Method | Route | Purpose |
|---|---|---|
| PATCH | `/citizen-report/:id` | Change status, mark false report |
| PATCH | `/incidents/:id` | Dispatch team, add notes |
| POST | `/boats` | Register a boat |
| PATCH | `/boats/:id` | Update boat status |
| POST | `/rescue/match` | Match free boats to requests (optimal or first-come) |
| POST | `/rescue/:id/rescued` | Close a request, free the boat |
| POST | `/relief/check` | Check a token without paying: slot, timing, paid status, card and shop match |
| POST | `/relief/pay` | Record a relief payment |
| GET | `/relief` | Staff relief view with slot loads |
| GET | `/shelters/tokens` | Shelter check-in tokens and counts |
| POST | `/evacuation-plan/execute` | Issue an evacuation order |
| POST | `/reservoirs/release` | Issue a reservoir release |

### Admin

| Method | Route | Purpose |
|---|---|---|
| PUT | `/thresholds` | Warning and danger lines |
| PUT | `/settings/rain-link` | Link or unlink live rainfall |
| POST | `/timemachine/start`, `/timemachine/stop` | Start or stop a replay |
| POST | `/simulate/storm` | Inject a storm into a zone |
| PUT | `/sensors/:zoneId` | Take a sensor offline or online |
| POST | `/broadcasts` | Send a manual alert |
| POST | `/admin/clear-data` | Clear demo data and start a new relief round (audit log kept) |
| PUT | `/shelters/mode` | Simulated or live check-in occupancy |
| POST | `/shelters/:id/token` | Rotate a shelter token |
| GET | `/audit` | Audit log |
| GET | `/audit/chain` | Anchored batches |
| POST | `/audit/anchor` | Anchor now |
| GET | `/audit/verify` | Verify every entry against the chain |

---

## 9. Real-time events

Socket.IO pushes state to clients. Every client gets public state. Signed-in sockets join a `staff`
room; admins also join `admins`, and officers and admins join `responders`. Rescue events with phone
numbers go only to `responders`; audit events only to `admins`. Rooms are assigned from the session
cookie at connection time.

---

## 10. Data model

SQLite at `demo/server/data/urbanpulse.db`, written through from the in-memory working set.

| Table | Contents |
|---|---|
| `reports` | Citizen reports (zone, type, severity, depth, status, reporter device id) |
| `incidents` | Danger episodes, team, notes, timeline |
| `broadcasts` | Alerts with verification code and `reason` |
| `rescues`, `boats` | Rescue requests and volunteer fleet |
| `settings` | Thresholds, rain link, shelter mode and tokens, vulnerable register, relief state, relief pepper |
| `users`, `sessions` | Staff accounts (scrypt hashes) and sessions |
| `audit` | Append-only audit log with per-entry hash |
| `anchor_batches`, `audit_anchor` | Anchored Merkle batches (root, tx hash, agency) and entry-to-batch map |

---

## 11. Algorithms

### 11.1 Forecast

Damped-trend (Holt) exponential smoothing with a drainage term (`forecast.js`): level smoothing
α = 0.5, trend smoothing β = 0.3, damping φ = 0.9, drainage 0.99 per step toward the recent baseline.
The 95% band uses a robust (median-based) error estimate, minimum σ = 2, widening for up to 25 steps.
Horizon: 2 hours.

### 11.2 Flood risk and route scoring

`risk.js` turns each zone's forecast into a probability that a point is flooded at a given time.
`evacuation.js` asks OSRM for alternatives plus detours around zones the route is predicted to cross
(1.2 km clearance, up to 2 detour zones, 3 shelters), walks each route in 200 m pieces evaluated at the
time the evacuee reaches them, and scores it:

```
cost = T + 20·E + 15·[load ≥ 0.9] + 120·p_s
```

T is drive time (min), E the expected km through floodwater, load the shelter's expected occupancy
share, and p_s the flood probability at the shelter on arrival.

### 11.3 Shelter assignment

`assignment.js` solves capacity-aware assignment as min-cost max-flow (successive shortest paths,
Bellman-Ford that skips unchanged nodes), checked against brute force in tests. `planWithPriority`
runs it in three tiers on the beds left by earlier tiers: accessible-needing people to accessible
shelters only, then elderly and infants anywhere, then everyone else. Boat rescue uses the same solver
with travel time plus need and waiting-time terms.

### 11.4 Sensor and report fusion

Log-odds fusion (`fusion.js`) per zone: prior 0.05; an online sensor contributes the probability that
the true level is above the danger line, P = Φ((reading − danger) / 3); each report adds a severity log-likelihood ratio (low 0.6, medium 1.2,
high 2) weighted by its reporter's trust, a Beta(a, b) record starting at Beta(1, 3). New reporters are
capped at 1.5, all reports together at 4. Reports fade with a half-life of 15 ticks and drop out after
4 half-lives. A zone is declared flooded at probability ≥ 0.5. Water depth maps to severity: ankle low,
knee medium, waist and chest high.

### 11.5 IMD rules

24-hour sum of hourly rain per zone, compared with IMD categories (heavy 64.5 mm, very heavy
115.6 mm, extremely heavy 204.5 mm). Rising-edge alerting with re-arm on drop (`imd.js`).

### 11.6 Relief scheduling

`schedule()` in `relief.js` fills each shop's hourly capacity earliest first and balances the two
shops of a zone over a seven-day scheme starting on the IST date of the first token.

### 11.7 Heavy-rain risk (XGBoost)

Predicts the probability that the next 24 hours bring at least 64.5 mm of rain (IMD "heavy rain").

- **Training** (`demo/ml/train.py`, Python): ERA5 hourly weather 2000–2024 from the Open-Meteo archive
  for the 3 × 3 block of 0.25° cells around Chennai (all six zones are in the centre cell). Split by
  year: train 2000–2016, validation 2017–2019, test 2020–2024. Depth (2, 3 or 4) chosen by validation
  average precision, trees by early stopping; chosen depth 3, 171 trees. Alert line 8.1%, the best
  F1 on validation.
- **Features** (20, completed hours only, IST): rain over the last 1, 3, 6, 12, 24, 48 and 72 h, the
  wettest hour of the last 24 h, sea-level pressure and its 3 h and 24 h change, humidity, cloud cover
  now and over 6 h, wind as u/v, and time of year and day as sin/cos.
- **Running in Node** (`heavyrain.js`): rebuilds the same features from the Open-Meteo forecast API's
  past hours and walks the exported trees (XGBoost JSON), comparing in float32 as XGBoost does. A test
  checks features and probabilities against Python on six fixture cases.
- **Honest result**: logistic regression on the same features did as well or better on the test years
  (Section 13). XGBoost was the pre-declared model and is kept; the test set was not used to choose.

---

## 12. Blockchain audit layer

### Design

- Each audit entry's leaf is `keccak256(keccak256(JSON of the entry's stored columns))`.
- Entries are batched into a Merkle tree with sorted-pair keccak-256 hashing; only the root goes
  on-chain.
- The `AuditAnchor` contract (`server/chain/AuditAnchor.sol`) stores roots, accepts them only from
  whitelisted agency wallets, and has no edit or delete.
- Two agencies: GCC signs everything except reservoir releases, which the WRD wallet signs. The Audit
  Log marks WRD batches.
- No personal data goes on-chain; entries stay in SQLite.

### Deployment

| Item | Value |
|---|---|
| Network | Shardeum Mezame testnet, chain id 8119 |
| RPC | https://api-mezame.shardeum.org |
| Explorer | https://explorer-mezame.shardeum.org |
| Contract | `0x7C4Bc679f261158Acb2De9F3c42Ec9A219F3b9bf` |
| GCC agency | `0x5BE3DAcdD4695Bbb7B5C170f870718aE138583C6` |
| WRD agency | `0x4623C2F0F9BEe556761bC7c9Ae62eEDda458763f` |

### Scripts (run in `demo/server`)

| Command | Purpose |
|---|---|
| `node chain/compile.js` | Compile `AuditAnchor.sol` to `AuditAnchor.json` |
| `node chain/deploy.js` | Deploy a new contract (starts an empty ledger) and update `deployment.json` |
| `node chain/add-agency.js <address> "<label>"` | Whitelist an agency wallet (admin key) |
| `node chain/bench.js --anchors 20` | Latency, gas and cost benchmark on a throwaway contract |
| `node chain/tamper-demo.js [--alert] [--undo]` | Edit the newest anchored entry (or alert) in SQLite to show detection; `--undo` restores |
| `node chain/verify-proof.js <proof.json>` | Check a downloaded alert proof against the contract with no UrbanPulse server |

### Verification paths

1. **Admin**: Audit Log → Verify on chain recomputes every leaf and root and compares with the
   contract.
2. **Citizen**: alert code check in the app or by SMS.
3. **Independent**: "Download proof" + `verify-proof.js` (pins the contract address, rejects proofs for
   other contracts).
4. **Poster QR**: `demo/verifier/verify.html` recomputes the root on the viewer's phone from the entry
   and siblings in the URL fragment and links to the explorer transaction.

### Measured cost

Deploy 537k gas. First anchor 93k gas (initialises storage), later anchors ~76k gas whatever the batch
size (1 to 500 entries), since only the root is stored. 20 of 20 anchors succeeded; send-to-receipt
latency 2.3 to 8.0 s. Details in `experiments/results/chain-bench.md`.

---

## 13. Experiments and results

All experiments are seeded and offline (routes are pre-fetched), use the server's own modules, and
write a Markdown report and CSV to `demo/server/experiments/results/`. Assumptions are declared in
each report before results. Values are mean ± 95% CI.

| Script | Question | Report |
|---|---|---|
| `run.js --seeds 200` | Which evacuation policy? 9 policies, 1,600 scenarios on real OSRM routes | `results.md` |
| `fusion.js --seeds 200` | Does fusing reports with sensors help when sensors fail? | `fusion.md` |
| `tamper.js --seeds 200` | Does anchoring detect insider edits? 10 attacks | `tamper.md` |
| `replay.js` | Would the alert rules have fired for Michaung 2023 and Chennai 2015? | `replay.md` |
| `scale.js` | Does it scale from 6 zones to 200 wards? | `scale.md` |
| `chain/bench.js` | Real anchoring cost and latency | `chain-bench.md` |
| `priority.js` | Does vulnerable-first planning help? | `priority.md` |
| `priority.js --bed-scale 0.25 --out priority-stress` | Same, when beds are short | `priority-stress.md` |
| `rescue.js` | Optimal vs first-come boat dispatch | `rescue.md` |
| `relief.js` | Scheduled slots vs walk-in queues | `relief.md` |
| `demo/ml/train.py` (Python) | Can past weather predict heavy rain in the next 24 h? | `xgboost.md` |
| `fetch-routes.js` | One-time OSRM download for `routes.json` | |

### Headline results

- **Evacuation** (1,600 runs): forecast-aware + optimal capacity sends 0.0% of evacuees without a bed
  (nearest shelter: 31.7%) and 1.86% to a flooded shelter (nearest: 11.22%), with mean travel 6.18 min
  against 7.17 min for current-conditions + optimal capacity.
- **Fusion**: with half the sensors offline, danger-episode recall is 48.0% for sensors alone and
  61.9% fused (no false reports); 72.1% fused at a 20% false-report rate. With all sensors online,
  fused recall is 100%.
- **Tamper**: all 10 attacks on anchored entries detected in 200 of 200 trials, zero false alarms.
  Edits made before anchoring are not detected (the known blind spot).
- **Replay**: for Michaung, the level rule's first danger alert for Velachery came 22 h before the
  documented flood day; the IMD rule fired on the flood day. In the flood-free November 2023 control
  window the IMD rule raised no alerts.
- **Scale**: at 200 wards a tick takes 5.96 ms (0.30% of the 2 s budget) and a full evacuation plan
  207 ms.
- **Priority** (beds × 0.25): vulnerable residents without a bed fall from 74.73% to 15.93%;
  accessible-needing people in an accessible shelter rise from 14.36% to 76.31%; the general
  population's rate rises from 74.73% to 79.84%. The total without a bed is unchanged.
- **Rescue** (8 boats, 6 h, ~179 requests): optimal batch matching cuts mean wait from 136.8 to
  110.7 min, medical-need wait from 132.2 to 73.7 min, and not-reached from 79.2% to 62.3%.
- **Relief** (2,000 households, 2 shops): scheduled slots cut mean queue wait from 217.0 to 10.8 min
  and the longest queue from 658.5 to 21.4 people; first-visit service rises from 36.0% to 97.9%.
- **Heavy-rain risk** (Chennai cell, test 2020–2024, 9 heavy-rain episodes): XGBoost ROC-AUC 0.989,
  PR-AUC 0.312 (95% CI 0.186–0.458), all 9 episodes alerted, 14.6 false-alarm runs a year. Logistic
  regression: PR-AUC 0.418 (0.276–0.568), 9 of 9 episodes, 9.0 false-alarm runs a year. Monthly
  climatology 0.034 and persistence 0.059. Both learned models far outperform the simple baselines;
  XGBoost does not beat logistic regression. The label is ERA5 rain, not IMD-observed rain, and no
  comparison with a numerical weather forecast was made.

Read each report's assumptions before quoting a number: several inputs (vulnerable share, shelter
accessibility, report rates, shop rates, boat speeds) are assumptions, not measurements.

---

## 14. Paper figures

`demo/figures/make_figures.py` draws 9 figures (PDF and 300-dpi PNG in `demo/figures/out/`) from the
experiment CSVs and cross-checks them against the Markdown reports. Setup and the full list are in
`demo/figures/README.md`:

```bash
python3 -m venv demo/figures/.venv
demo/figures/.venv/bin/pip install -r demo/figures/requirements.txt
demo/figures/.venv/bin/python demo/figures/make_figures.py
```

---

## 15. Testing

```bash
cd demo/server && npm test
```

188 tests (`node --test`) cover the forecast, the heavy-rain model (features and probabilities
against Python), risk model, route scoring and detours, shelter
assignment (against brute force), the group and priority planners, fusion, IMD rules, the simulator,
storage and audit hashing, Merkle anchoring and verification, sign-in and roles, rate limits, rescue,
vulnerable register, check-in, relief scheduling, token checks and HMAC keys, SMS commands and the
time machine.

Client lint: `cd demo/client && npm run lint`.

---

## 16. Security and privacy

- **Sign-in**: scrypt-hashed passwords, database-backed sessions in an httpOnly cookie, account
  lockout after 10 failed attempts, per-IP login limit.
- **Roles** enforced on the server for every route.
- **Public endpoints** are rate-limited per IP and capped (Section 8).
- **Personal data minimisation**:
  - Vulnerable register: zone, kind and count only, under a random id.
  - Shelter check-in: random household id and headcount only.
  - Relief: card numbers never stored, only HMAC keys; the pepper should live in a secrets manager.
  - Rescue phone numbers: responders only; never in public responses, viewer responses or audit
    entries.
  - Public alert audit records carry no staff identity.
  - SMS sender numbers are not stored.
- **Integrity**: append-only audit log anchored on-chain by two agencies (Section 12).
- **Secrets**: private keys and the pepper only in git-ignored `.env`; never commit them.

---

## 17. Data sources and licences

| Data | Source | Licence |
|---|---|---|
| Live and historical rainfall and weather (pressure, humidity, cloud, wind) | Open-Meteo (Forecast API, Historical Weather API / ERA5) | CC BY 4.0 |
| Road routes | OSRM public server on OpenStreetMap data | ODbL (OpenStreetMap) |
| Map tiles | OpenStreetMap | ODbL |
| GCC ward boundaries | DataMeet Municipal_Spatial_Data (Transparent Chennai) | CC BY-SA 2.5 India |
| Population | Census 2011, Greater Chennai Corporation | Public |
| Flood timeline | Government press releases and news reports cited in `experiments/data/flood-timeline.json` | Cited per item |
| IMD categories | India Meteorological Department 24 h rainfall categories | Public |

---

## 18. Limitations

- Water-level sensors and the SMS gateway are simulated; shelters, accessibility, boats and ration
  shops are illustrative.
- The water-level forecast is a statistical stand-in, not a trained hydrological model.
- The heavy-rain model learns ERA5 rain, which understates local extremes, and runs live on Open-Meteo
  forecast-API inputs rather than ERA5. It does not beat logistic regression and was not compared with
  a numerical weather forecast. It is advisory and never triggers alerts.
- ERA5 reanalysis underestimates peak rainfall; documented flooding is day-resolution only.
- Fusion is advisory; alerts are still driven by sensor levels.
- Audit entries are protected only once anchored: the up-to-5-minute pending window is not.
- Both agency keys live on one demo server; a real deployment needs a separate signer per agency.
  Whoever controls the server cannot rewrite anchored history but could anchor false new entries.
- Rate limits are in memory and reset on restart. Requests from the server's own machine are not
  limited, which suits a presenter's laptop; a public deployment behind its own proxy must set
  `trust proxy` for that proxy.
- The relief lookup tells anyone whether a card holds a token; the demo cannot validate ration cards.
- Shelter check-in tokens appear in URLs and can show up in access logs.
- Vulnerable register, relief and shelter state each sit in a settings row: fine for a demo, not for
  city scale.
- Tamil is a draft; alert text is English, so speech in Tamil mode is only a short Tamil preamble.
- Route planning, map tiles and on-chain checks need the internet.

---

## 19. Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `node:sqlite` not found | Node older than 22.5; upgrade |
| Requests return 429 | Rate limit hit from another device; wait for `Retry-After` or restart the server (limits are in memory). The server's own machine is never limited |
| "This relief round has ended" | The 7-day round is over; clear demo data to start a new round |
| Trust ledger or Verify shows "missing" transactions | Batches were sealed with your keys by another copy of the server (another laptop or database). They stay on the chain; use one database with one set of keys |
| Heavy-rain risk not shown | `server/models/heavy-rain-xgb.json` missing, or fewer than 72 past hours from Open-Meteo |
| Audit entries stay "pending" | No `SHARDEUM_PRIVATE_KEY`, or wallet out of test SHM; check the server log for "anchoring failed" |
| Reservoir releases anchored by GCC, not WRD | `SHARDEUM_WRD_PRIVATE_KEY` unset, wallet not registered (`add-agency.js`) or unfunded |
| Routes are straight lines | OSRM unreachable; check internet |
| Map blank | No internet for tiles (expected offline) |
| Offline mode does nothing | Service worker runs only in a production build: use `npm run demo:offline` |
| Poster QR flagged as not pointing anywhere | Set `VITE_VERIFIER_URL` in `client/.env.local` and rebuild |
| Time machine stopped | A server restart ends a running replay; start it again |
| Old demo data on screen | Settings → Demo Data → clear |

---

## 20. Demo walkthrough

About 5 minutes, signed in as `admin`.

1. **Overview**: six zones, live levels and rainfall, shelters, and the "Sealed on Shardeum" strip.
2. **Settings → Storm Simulator**: Velachery, intensity 50, trigger. Within seconds a toast, a red
   Incidents badge and the "no team assigned" banner appear.
3. **Broadcasts**: the automated alert with its verification code and "why this alert?" reason.
4. **Incidents**: dispatch a team, add a note.
5. **Evacuation Planner**: Velachery suggested; compare proposed and conventional plans; issue the order.
6. **Citizen app** (narrow window): pick Velachery, see "Flooding in your area" and the safe route;
   press Listen on the alert; paste the alert into "Got a forwarded flood message?" to see it verified.
7. **Boat rescue**: request a boat from the citizen app, then match boats (optimal) in Boat Rescue.
8. **Relief**: get a token in the citizen app; on the Relief page press **Check token** (slot, shop,
   card match), then record the payment; open the public ledger.
9. **Audit Log**: Anchor now, Verify on chain; then run `node chain/tamper-demo.js` and verify again
   to show the tampered row; `--undo` to restore.
10. **Time Machine**: replay Michaung at speed 120 and watch alerts fire on real 2023 rainfall.
11. **Zone Detail**: the XGBoost heavy-rain risk next to the rain forecast.
12. **Trust ledger** (`/trust`): press **Verify everything now**.
13. **Architecture**: the data flow, and what is built and planned in each layer.
