# Volunteer boat rescue: dispatch policy experiment

200 seeds, each a 6-hour event with 8 volunteer boats. Values: mean ± 95% CI over seeds (n = seeds with a value). Lower is better for every metric.
Runtime: 0.6 s on this machine.

## Results

Load: on average 179 requests arrive per run (about 30 an hour). Reached per run: 37 greedy, 67 optimal. Demand exceeds what 8 boats can serve in 6 hours, so the queue grows and most requests stay unreached under both policies; the rates are set by the pre-declared scenario, not tuned.

| Policy | Mean wait to boat (min) | p90 wait to boat (min) | Mean wait, medical need (min) | % not reached within 6 h | Boat-km per person rescued | Boat-km per person, reached legs only (secondary) |
|---|---:|---:|---:|---:|---:|---:|
| Greedy first-come (matchGreedy, on each arrival or boat free) | 136.8 ± 1.6 (n=200) | 254.3 ± 2.3 (n=200) | 132.2 ± 7.6 (n=197) | 79.22 ± 0.33 (n=200) | 3.113 ± 0.064 (n=200) | 2.540 ± 0.045 (n=200) |
| Optimal batch (matchOptimal, every 5 min) | 110.7 ± 1.4 (n=200) | 206.0 ± 2.7 (n=200) | 73.7 ± 2.8 (n=200) | 62.33 ± 0.44 (n=200) | 1.179 ± 0.018 (n=200) | 1.119 ± 0.016 (n=200) |

Paired difference, optimal minus greedy, over identical draws: mean ± 95% CI, then `w/l` = seeds where optimal is better / worse (lower is better for every metric).

| Metric | Optimal − greedy |
|---|---:|
| Mean wait to boat (min) | -26.2 ± 1.2 (200/0) |
| p90 wait to boat (min) | -48.3 ± 2.7 (197/3) |
| Mean wait, medical need (min) | -58.9 ± 8.0 (164/33) |
| % not reached within 6 h | -16.89 ± 0.34 (200/0) |
| Boat-km per person rescued | -1.934 ± 0.061 (200/0) |
| Boat-km per person, reached legs only (secondary) | -1.421 ± 0.040 (200/0) |

## Assumptions

- Time: 1-minute steps over a 6-hour event (360 minutes). A request is stamped with the minute it arrives.
- Requests: per minute, a Poisson(0.5) count (a Poisson process at 0.5 per minute overall).
- Location: uniform over the disc of radius 1.5 km (ZONE_RADIUS_KM) around a uniformly chosen demo zone centre.
- People: 1 + Poisson(2), capped at 12. Needs: medical 0.1, elderly 0.2, child 0.2, disabled 0.05, each independent.
- Boats: 8, capacity uniform integer 4 to 12, each starting at a uniformly chosen zone centre.
- Speed: 8 km/h (BOAT_KMH) on straight-line distance, for every leg. No road network, no flood effects on speed (assumption).
- Service: 10 minutes loading at the request, carry to the nearest demo shelter (straight line from the request), 5 minutes unloading. The boat is free at that shelter afterwards.
- Shelter capacity is not modelled: boats carry people to the nearest shelter whatever its occupancy. No boat breakdowns, fuel or daylight limits, and no cancellations.
- Greedy: matchGreedy runs in the minute a request arrives or a boat becomes free. Requests take the nearest free boat that can carry them, in arrival order.
- Optimal: matchOptimal runs every 5 minutes. Cost = travel minutes less priority minutes (medical 30, disabled 20, elderly 15, child 15; largest need counts) less 0.5 per minute waited.
- Matching takes no time. Waits are measured from the arrival minute to the minute the boat reaches the request.
- Reached: boat arrives at the request within the 6 hours. Mean wait, p90 wait and medical mean wait use reached requests only, so requests still waiting at the horizon are excluded from them; read them with the % not reached.
- Boat-km (primary): straight-line km of every leg (to the request and on to the shelter) of assignments made within the 6 hours, divided by the people on reached requests. Assignments whose pickup falls after the horizon add km but no rescued people, which overstates the figure for a policy that leaves many pickups late.
- Boat-km (secondary, added after the first run): the same divided by people, counting only the legs of reached requests. It removes that overstatement, so it is the better comparison of travel per person.
- Pairing: each seed's requests and boats are drawn once and both policies run on that draw. CI: mean ± 1.96 sd / sqrt(n) across seeds; a seed with no value for a metric is skipped (n shows the count).

## Parameters

Priority minutes {"medical":30,"disabled":20,"elderly":15,"child":15}; boat speed 8 km/h; horizon 360 min; optimal batch every 5 min; loading 10 min; unloading 5 min.
