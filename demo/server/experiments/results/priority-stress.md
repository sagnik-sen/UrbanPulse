# Priority evacuation experiment (priority-stress)

200 seeds × 4 scenario types × 2 departure modes = 1600 scenario runs, each planned both ways. Same scenarios as `results.md` (seeds, water, shelters, routes); storm decay per tick: 0.97.
Plans use only information available at planning time (the same forecast risk model for both). Values: mean ± 95% CI over scenario runs, as in results.md.

**Bed-scale stress variant (`--bed-scale 0.25`).** Every shelter's capacity is multiplied by 0.25 (rounded down, minimum 1), giving 524 beds in total against 2100 unscaled. Occupancy is the unchanged draw from the unscaled capacity, so shelters can start full. The scale 0.25 was chosen before running, so that beds are clearly short; it was not tuned after seeing results. All other assumptions are as in the committed run.

## Assumptions

- **Vulnerable share: 8% of each evacuating zone's people** (ASSUMPTION, Census-style; not measured for Chennai). Split of the registered people: elderly 50%, mobility 25%, medical 15%, infant 10% (rounded per zone; infant takes the remainder).
- Accessible-needing = mobility + medical (40% of the vulnerable, 3.2% of evacuees). Elderly and infants are the priority tier that can use any shelter.
- **Shelter accessibility is ILLUSTRATIVE, not surveyed:** s1 (Velachery), s3 (Sholinganallur) and s5 (Mylapore) are marked accessible; s2, s4 and s6 are not (`accessible` in `simulator.js`).
- Vulnerable first places the tiers in order on the beds left by earlier tiers: accessible-needing people in accessible shelters only, then elderly and infants anywhere, then everyone else. An accessible-needing person with no free accessible bed stays unassigned: there is no fallback to a non-accessible shelter.
- A zone's registered people are shared across its origin groups in proportion to group size, capped at each group's people.
- The proposed policy has no notion of who is vulnerable, so its vulnerable figures assume the vulnerable are a uniform share of each group and get that group's bed and accessible-shelter odds.
- Accessible-needing % = people placed in an accessible shelter ÷ all accessible-needing people (placed or not). Mean travel is over the people assigned.

## All scenarios

| Policy | All: % without bed | Vulnerable: % without bed | Accessible-needing: % in accessible shelter | Vulnerable: mean travel (min) | General: % without bed | General: mean travel (min) |
|---|---:|---:|---:|---:|---:|---:|
| Proposed: everyone equal (forecast costs, optimal) [baseline] | 74.73 ± 1.02 | 74.73 ± 1.02 | 14.36 ± 0.76 | 9.70 ± 0.25 | 74.73 ± 1.02 | 9.70 ± 0.25 |
| Vulnerable first (planWithPriority) | 74.73 ± 1.02 | 15.93 ± 1.36 | 76.31 ± 2.00 | 10.05 ± 0.25 | 79.84 ± 1.06 | 9.21 ± 0.29 |

Paired differences (vulnerable first − proposed) over identical scenarios, mean ± 95% CI; `w/l` = scenarios where vulnerable-first is better / worse, judged by each metric's direction.

| Comparison | All: % without bed | Vulnerable: % without bed | Accessible-needing: % in accessible shelter | Vulnerable: mean travel (min) | General: % without bed | General: mean travel (min) |
|---|---:|---:|---:|---:|---:|---:|
| Vulnerable first − proposed | 0.00 ± 0.00 (0/0) | -58.80 ± 1.25 (1514/2) | 61.94 ± 1.72 (1288/0) | 0.35 ± 0.17 (582/932) | 5.11 ± 0.11 (2/1514) | -0.49 ± 0.18 (485/860) |

## Departures: immediate

| Policy | All: % without bed | Vulnerable: % without bed | Accessible-needing: % in accessible shelter | Vulnerable: mean travel (min) | General: % without bed | General: mean travel (min) |
|---|---:|---:|---:|---:|---:|---:|
| Proposed: everyone equal (forecast costs, optimal) [baseline] | 74.73 ± 1.45 | 74.73 ± 1.45 | 14.37 ± 1.07 | 9.63 ± 0.34 | 74.73 ± 1.45 | 9.63 ± 0.34 |
| Vulnerable first (planWithPriority) | 74.73 ± 1.45 | 15.93 ± 1.92 | 76.31 ± 2.83 | 9.92 ± 0.36 | 79.84 ± 1.50 | 9.19 ± 0.41 |

Paired differences (vulnerable first − proposed) over identical scenarios, mean ± 95% CI; `w/l` = scenarios where vulnerable-first is better / worse, judged by each metric's direction.

| Comparison | All: % without bed | Vulnerable: % without bed | Accessible-needing: % in accessible shelter | Vulnerable: mean travel (min) | General: % without bed | General: mean travel (min) |
|---|---:|---:|---:|---:|---:|---:|
| Vulnerable first − proposed | 0.00 ± 0.00 (0/0) | -58.80 ± 1.76 (757/1) | 61.94 ± 2.43 (644/0) | 0.28 ± 0.24 (291/466) | 5.11 ± 0.15 (1/757) | -0.45 ± 0.26 (232/440) |

## Departures: staggered

| Policy | All: % without bed | Vulnerable: % without bed | Accessible-needing: % in accessible shelter | Vulnerable: mean travel (min) | General: % without bed | General: mean travel (min) |
|---|---:|---:|---:|---:|---:|---:|
| Proposed: everyone equal (forecast costs, optimal) [baseline] | 74.73 ± 1.45 | 74.73 ± 1.45 | 14.36 ± 1.07 | 9.77 ± 0.35 | 74.73 ± 1.45 | 9.77 ± 0.35 |
| Vulnerable first (planWithPriority) | 74.73 ± 1.45 | 15.93 ± 1.92 | 76.31 ± 2.83 | 10.19 ± 0.36 | 79.84 ± 1.50 | 9.24 ± 0.42 |

Paired differences (vulnerable first − proposed) over identical scenarios, mean ± 95% CI; `w/l` = scenarios where vulnerable-first is better / worse, judged by each metric's direction.

| Comparison | All: % without bed | Vulnerable: % without bed | Accessible-needing: % in accessible shelter | Vulnerable: mean travel (min) | General: % without bed | General: mean travel (min) |
|---|---:|---:|---:|---:|---:|---:|
| Vulnerable first − proposed | 0.00 ± 0.00 (0/0) | -58.80 ± 1.76 (757/1) | 61.94 ± 2.43 (644/0) | 0.42 ± 0.24 (291/466) | 5.11 ± 0.15 (1/757) | -0.54 ± 0.26 (253/420) |

## Appendix: by scenario type and departure mode

### rising, immediate

| Policy | All: % without bed | Vulnerable: % without bed | Accessible-needing: % in accessible shelter | Vulnerable: mean travel (min) | General: % without bed | General: mean travel (min) |
|---|---:|---:|---:|---:|---:|---:|
| Proposed: everyone equal (forecast costs, optimal) [baseline] | 73.95 ± 2.86 | 73.95 ± 2.86 | 15.20 ± 2.17 | 10.04 ± 0.72 | 73.95 ± 2.86 | 10.04 ± 0.72 |
| Vulnerable first (planWithPriority) | 73.95 ± 2.86 | 14.58 ± 3.78 | 79.12 ± 5.38 | 10.23 ± 0.72 | 79.12 ± 2.98 | 9.53 ± 0.82 |

### rising, staggered

| Policy | All: % without bed | Vulnerable: % without bed | Accessible-needing: % in accessible shelter | Vulnerable: mean travel (min) | General: % without bed | General: mean travel (min) |
|---|---:|---:|---:|---:|---:|---:|
| Proposed: everyone equal (forecast costs, optimal) [baseline] | 73.95 ± 2.86 | 73.95 ± 2.86 | 15.19 ± 2.17 | 10.22 ± 0.72 | 73.96 ± 2.86 | 10.22 ± 0.72 |
| Vulnerable first (planWithPriority) | 73.95 ± 2.86 | 14.58 ± 3.78 | 79.12 ± 5.38 | 10.78 ± 0.73 | 79.12 ± 2.98 | 9.60 ± 0.83 |

### receding, immediate

| Policy | All: % without bed | Vulnerable: % without bed | Accessible-needing: % in accessible shelter | Vulnerable: mean travel (min) | General: % without bed | General: mean travel (min) |
|---|---:|---:|---:|---:|---:|---:|
| Proposed: everyone equal (forecast costs, optimal) [baseline] | 71.82 ± 3.25 | 71.81 ± 3.25 | 15.90 ± 2.31 | 10.03 ± 0.66 | 71.82 ± 3.25 | 10.03 ± 0.66 |
| Vulnerable first (planWithPriority) | 71.82 ± 3.25 | 15.16 ± 3.79 | 78.61 ± 5.38 | 10.08 ± 0.72 | 76.73 ± 3.39 | 9.34 ± 0.80 |

### receding, staggered

| Policy | All: % without bed | Vulnerable: % without bed | Accessible-needing: % in accessible shelter | Vulnerable: mean travel (min) | General: % without bed | General: mean travel (min) |
|---|---:|---:|---:|---:|---:|---:|
| Proposed: everyone equal (forecast costs, optimal) [baseline] | 71.82 ± 3.25 | 71.82 ± 3.25 | 15.90 ± 2.31 | 10.09 ± 0.67 | 71.82 ± 3.25 | 10.09 ± 0.67 |
| Vulnerable first (planWithPriority) | 71.82 ± 3.25 | 15.16 ± 3.79 | 78.61 ± 5.38 | 10.22 ± 0.73 | 76.73 ± 3.39 | 9.33 ± 0.81 |

### surprise, immediate

| Policy | All: % without bed | Vulnerable: % without bed | Accessible-needing: % in accessible shelter | Vulnerable: mean travel (min) | General: % without bed | General: mean travel (min) |
|---|---:|---:|---:|---:|---:|---:|
| Proposed: everyone equal (forecast costs, optimal) [baseline] | 75.74 ± 2.83 | 75.74 ± 2.83 | 13.27 ± 2.02 | 9.94 ± 0.71 | 75.74 ± 2.83 | 9.94 ± 0.71 |
| Vulnerable first (planWithPriority) | 75.74 ± 2.83 | 15.35 ± 3.53 | 74.49 ± 5.82 | 10.18 ± 0.75 | 80.99 ± 2.94 | 9.79 ± 0.84 |

### surprise, staggered

| Policy | All: % without bed | Vulnerable: % without bed | Accessible-needing: % in accessible shelter | Vulnerable: mean travel (min) | General: % without bed | General: mean travel (min) |
|---|---:|---:|---:|---:|---:|---:|
| Proposed: everyone equal (forecast costs, optimal) [baseline] | 75.74 ± 2.83 | 75.74 ± 2.83 | 13.27 ± 2.02 | 10.08 ± 0.72 | 75.74 ± 2.83 | 10.08 ± 0.72 |
| Vulnerable first (planWithPriority) | 75.74 ± 2.83 | 15.35 ± 3.53 | 74.49 ± 5.82 | 10.45 ± 0.75 | 80.99 ± 2.94 | 9.76 ± 0.85 |

### calm, immediate

| Policy | All: % without bed | Vulnerable: % without bed | Accessible-needing: % in accessible shelter | Vulnerable: mean travel (min) | General: % without bed | General: mean travel (min) |
|---|---:|---:|---:|---:|---:|---:|
| Proposed: everyone equal (forecast costs, optimal) [baseline] | 77.39 ± 2.56 | 77.40 ± 2.56 | 13.09 ± 2.04 | 8.52 ± 0.65 | 77.39 ± 2.56 | 8.52 ± 0.65 |
| Vulnerable first (planWithPriority) | 77.39 ± 2.56 | 18.62 ± 4.25 | 73.02 ± 6.00 | 9.18 ± 0.66 | 82.50 ± 2.60 | 8.09 ± 0.79 |

### calm, staggered

| Policy | All: % without bed | Vulnerable: % without bed | Accessible-needing: % in accessible shelter | Vulnerable: mean travel (min) | General: % without bed | General: mean travel (min) |
|---|---:|---:|---:|---:|---:|---:|
| Proposed: everyone equal (forecast costs, optimal) [baseline] | 77.39 ± 2.56 | 77.40 ± 2.56 | 13.09 ± 2.04 | 8.70 ± 0.67 | 77.39 ± 2.56 | 8.70 ± 0.67 |
| Vulnerable first (planWithPriority) | 77.39 ± 2.56 | 18.62 ± 4.25 | 73.02 ± 6.00 | 9.33 ± 0.67 | 82.50 ± 2.60 | 8.25 ± 0.82 |
