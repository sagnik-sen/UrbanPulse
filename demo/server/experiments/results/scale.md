# City-scale benchmark (scale)

Machine: Apple M5, 10 CPU cores, Node v24.19.0, darwin arm64.
Benchmark runtime: 13.8 s. Median of 7 runs after 2 warm-up runs (performance.now); heap is the heapUsed change over one pass of all four steps, with a forced GC before the first reading and none after. Heap is a single sample, so it is noisy across N and is not a trend.

Data: `experiments/data/chennai-wards.json`, 200 Greater Chennai Corporation wards. Source: Chennai Wards.geojson, DataMeet Municipal_Spatial_Data (data from Transparent Chennai), https://github.com/datameet/Municipal_Spatial_Data/tree/master/Chennai. Licence: CC BY-SA 2.5 India (derived centroids and areas). Ward centroids and areas come from that file.

## Assumptions

- Population: Census 2011 Greater Chennai Corporation population (4,646,732) is split across wards in proportion to ward area. ASSUMPTION: actual ward populations differ; this is an area proxy only.
- Shelters are SYNTHETIC: one per two zones (ceil(N/2)), at every other selected ward's centroid, offset +0.003 deg latitude, capacity 300, occupancy 0. Locations and capacities are not real. Exception: N=6 uses the six real demo shelters.
- Zones for N=6 are the real demo zones (ZONE_DEFS). Larger N sample wards with a fixed seed (7).
- Citizen reports are SYNTHETIC: 500 reports, random zone, severity (low/medium/high) and status (open/in_progress/resolved/rejected), 300 devices, timestamps within two minutes of a fixed clock. No offline sensors.
- Tick: one simulator step plus the forecast for every zone, as index.js computes the snapshot. Rain feed, incidents and socket emits are left out. Fusion is a separate column; a live tick also runs it, so the full cost is roughly tick + fusion.
- Plan: one request = snapshot + forecastRisk + planGroups (optimal). Groups are the first max(1, floor(0.2 x N)) zones of the snapshot, each with round(population / 100) people. Pairs = groups x shelters. The endpoint also runs a conventional greedy plan and two summaries; those are not timed.
- Routes: one straight-line route per (zone, shelter) pair at 25 km/h, from evacuation.js straightLine(). No OSRM, so travel times and road exposure are not road-realistic.
- Audit entries per simulated day = 50 + 5 x N. ASSUMPTION: the true rate is unknown. Batches of 500; the chain is an in-memory stand-in, so network and gas time are excluded.

## Results

| Zones (N) | Groups | Shelters | Tick ms (% of 2,000 ms) | Fusion ms (% of 2,000 ms) | Plan ms per request (pairs) | Anchor ms + verify ms (entries) | Heap MB (one pass) |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 6 (demo) | 1 | 6 | 0.19 (0.01%) | 0.73 (0.04%) | 0.39 (6) | 2.88 + 2.73 (80) | 1.8 |
| 50 | 10 | 25 | 1.51 (0.08%) | 0.92 (0.05%) | 16.5 (250) | 10.5 + 10.1 (300) | 9.3 |
| 100 | 20 | 50 | 2.89 (0.14%) | 1.17 (0.06%) | 122.7 (1,000) | 19.1 + 18.2 (550) | 23.9 |
| 200 | 40 | 100 | 5.94 (0.30%) | 1.59 (0.08%) | 923.0 (4,000) | 36.1 + 34.8 (1,050) | 17.8 |

Tick and fusion are compared with the 2,000 ms budget of one live tick (the server ticks every 2 s). Plan is per request.

Fastest growth from N=50 to N=200 (zones x4): plan, x55.8. Others: tick x3.9, fusion x1.7, anchor+verify x3.5.
