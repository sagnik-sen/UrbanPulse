# Priority evacuation experiment (priority)

200 seeds × 4 scenario types × 2 departure modes = 1600 scenario runs, each planned both ways. Same scenarios as `results.md` (seeds, water, shelters, routes); storm decay per tick: 0.97.
Plans use only information available at planning time (the same forecast risk model for both). Values: mean ± 95% CI over scenario runs, as in results.md.

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
| Proposed: everyone equal (forecast costs, optimal) [baseline] | 0.01 ± 0.01 | 0.01 ± 0.01 | 46.92 ± 1.33 | 6.18 ± 0.14 | 0.01 ± 0.01 | 6.18 ± 0.14 |
| Vulnerable first (planWithPriority) | 0.01 ± 0.01 | 0.00 ± 0.00 | 100.00 ± 0.00 | 6.08 ± 0.17 | 0.01 ± 0.02 | 6.24 ± 0.14 |

Paired differences (vulnerable first − proposed) over identical scenarios, mean ± 95% CI; `w/l` = scenarios where vulnerable-first is better / worse, judged by each metric's direction.

| Comparison | All: % without bed | Vulnerable: % without bed | Accessible-needing: % in accessible shelter | Vulnerable: mean travel (min) | General: % without bed | General: mean travel (min) |
|---|---:|---:|---:|---:|---:|---:|
| Vulnerable first − proposed | 0.00 ± 0.00 (0/0) | -0.01 ± 0.01 (2/0) | 53.08 ± 1.33 (1509/0) | -0.10 ± 0.08 (884/716) | 0.00 ± 0.00 (0/2) | 0.06 ± 0.01 (514/1086) |

## Departures: immediate

| Policy | All: % without bed | Vulnerable: % without bed | Accessible-needing: % in accessible shelter | Vulnerable: mean travel (min) | General: % without bed | General: mean travel (min) |
|---|---:|---:|---:|---:|---:|---:|
| Proposed: everyone equal (forecast costs, optimal) [baseline] | 0.01 ± 0.02 | 0.01 ± 0.02 | 47.86 ± 1.88 | 5.90 ± 0.18 | 0.01 ± 0.02 | 5.90 ± 0.18 |
| Vulnerable first (planWithPriority) | 0.01 ± 0.02 | 0.00 ± 0.00 | 100.00 ± 0.00 | 5.76 ± 0.23 | 0.01 ± 0.02 | 5.96 ± 0.18 |

Paired differences (vulnerable first − proposed) over identical scenarios, mean ± 95% CI; `w/l` = scenarios where vulnerable-first is better / worse, judged by each metric's direction.

| Comparison | All: % without bed | Vulnerable: % without bed | Accessible-needing: % in accessible shelter | Vulnerable: mean travel (min) | General: % without bed | General: mean travel (min) |
|---|---:|---:|---:|---:|---:|---:|
| Vulnerable first − proposed | 0.00 ± 0.00 (0/0) | -0.01 ± 0.02 (1/0) | 52.14 ± 1.88 (752/0) | -0.14 ± 0.11 (447/353) | 0.00 ± 0.00 (0/1) | 0.06 ± 0.01 (250/550) |

## Departures: staggered

| Policy | All: % without bed | Vulnerable: % without bed | Accessible-needing: % in accessible shelter | Vulnerable: mean travel (min) | General: % without bed | General: mean travel (min) |
|---|---:|---:|---:|---:|---:|---:|
| Proposed: everyone equal (forecast costs, optimal) [baseline] | 0.01 ± 0.02 | 0.01 ± 0.02 | 45.99 ± 1.89 | 6.46 ± 0.20 | 0.01 ± 0.02 | 6.46 ± 0.20 |
| Vulnerable first (planWithPriority) | 0.01 ± 0.02 | 0.00 ± 0.00 | 100.00 ± 0.00 | 6.39 ± 0.25 | 0.01 ± 0.02 | 6.52 ± 0.20 |

Paired differences (vulnerable first − proposed) over identical scenarios, mean ± 95% CI; `w/l` = scenarios where vulnerable-first is better / worse, judged by each metric's direction.

| Comparison | All: % without bed | Vulnerable: % without bed | Accessible-needing: % in accessible shelter | Vulnerable: mean travel (min) | General: % without bed | General: mean travel (min) |
|---|---:|---:|---:|---:|---:|---:|
| Vulnerable first − proposed | 0.00 ± 0.00 (0/0) | -0.01 ± 0.02 (1/0) | 54.01 ± 1.89 (757/0) | -0.06 ± 0.12 (437/363) | 0.00 ± 0.00 (0/1) | 0.06 ± 0.01 (264/536) |

## Appendix: by scenario type and departure mode

### rising, immediate

| Policy | All: % without bed | Vulnerable: % without bed | Accessible-needing: % in accessible shelter | Vulnerable: mean travel (min) | General: % without bed | General: mean travel (min) |
|---|---:|---:|---:|---:|---:|---:|
| Proposed: everyone equal (forecast costs, optimal) [baseline] | 0.04 ± 0.08 | 0.04 ± 0.08 | 43.80 ± 3.73 | 6.35 ± 0.37 | 0.04 ± 0.08 | 6.35 ± 0.37 |
| Vulnerable first (planWithPriority) | 0.04 ± 0.08 | 0.00 ± 0.00 | 100.00 ± 0.00 | 6.45 ± 0.49 | 0.05 ± 0.09 | 6.40 ± 0.37 |

### rising, staggered

| Policy | All: % without bed | Vulnerable: % without bed | Accessible-needing: % in accessible shelter | Vulnerable: mean travel (min) | General: % without bed | General: mean travel (min) |
|---|---:|---:|---:|---:|---:|---:|
| Proposed: everyone equal (forecast costs, optimal) [baseline] | 0.04 ± 0.08 | 0.04 ± 0.08 | 42.34 ± 3.80 | 7.44 ± 0.44 | 0.04 ± 0.08 | 7.45 ± 0.44 |
| Vulnerable first (planWithPriority) | 0.04 ± 0.08 | 0.00 ± 0.00 | 100.00 ± 0.00 | 7.68 ± 0.53 | 0.05 ± 0.09 | 7.50 ± 0.44 |

### receding, immediate

| Policy | All: % without bed | Vulnerable: % without bed | Accessible-needing: % in accessible shelter | Vulnerable: mean travel (min) | General: % without bed | General: mean travel (min) |
|---|---:|---:|---:|---:|---:|---:|
| Proposed: everyone equal (forecast costs, optimal) [baseline] | 0.00 ± 0.00 | 0.00 ± 0.00 | 45.27 ± 4.03 | 6.90 ± 0.44 | 0.00 ± 0.00 | 6.90 ± 0.44 |
| Vulnerable first (planWithPriority) | 0.00 ± 0.00 | 0.00 ± 0.00 | 100.00 ± 0.00 | 6.99 ± 0.55 | 0.00 ± 0.00 | 6.96 ± 0.44 |

### receding, staggered

| Policy | All: % without bed | Vulnerable: % without bed | Accessible-needing: % in accessible shelter | Vulnerable: mean travel (min) | General: % without bed | General: mean travel (min) |
|---|---:|---:|---:|---:|---:|---:|
| Proposed: everyone equal (forecast costs, optimal) [baseline] | 0.00 ± 0.00 | 0.00 ± 0.00 | 44.87 ± 3.98 | 7.18 ± 0.46 | 0.00 ± 0.00 | 7.18 ± 0.46 |
| Vulnerable first (planWithPriority) | 0.00 ± 0.00 | 0.00 ± 0.00 | 100.00 ± 0.00 | 7.23 ± 0.55 | 0.00 ± 0.00 | 7.24 ± 0.46 |

### surprise, immediate

| Policy | All: % without bed | Vulnerable: % without bed | Accessible-needing: % in accessible shelter | Vulnerable: mean travel (min) | General: % without bed | General: mean travel (min) |
|---|---:|---:|---:|---:|---:|---:|
| Proposed: everyone equal (forecast costs, optimal) [baseline] | 0.00 ± 0.00 | 0.00 ± 0.00 | 50.94 ± 3.80 | 5.29 ± 0.29 | 0.00 ± 0.00 | 5.29 ± 0.29 |
| Vulnerable first (planWithPriority) | 0.00 ± 0.00 | 0.00 ± 0.00 | 100.00 ± 0.00 | 4.94 ± 0.34 | 0.00 ± 0.00 | 5.36 ± 0.29 |

### surprise, staggered

| Policy | All: % without bed | Vulnerable: % without bed | Accessible-needing: % in accessible shelter | Vulnerable: mean travel (min) | General: % without bed | General: mean travel (min) |
|---|---:|---:|---:|---:|---:|---:|
| Proposed: everyone equal (forecast costs, optimal) [baseline] | 0.00 ± 0.00 | 0.00 ± 0.00 | 48.27 ± 3.84 | 5.79 ± 0.34 | 0.00 ± 0.00 | 5.80 ± 0.34 |
| Vulnerable first (planWithPriority) | 0.00 ± 0.00 | 0.00 ± 0.00 | 100.00 ± 0.00 | 5.53 ± 0.40 | 0.00 ± 0.00 | 5.86 ± 0.34 |

### calm, immediate

| Policy | All: % without bed | Vulnerable: % without bed | Accessible-needing: % in accessible shelter | Vulnerable: mean travel (min) | General: % without bed | General: mean travel (min) |
|---|---:|---:|---:|---:|---:|---:|
| Proposed: everyone equal (forecast costs, optimal) [baseline] | 0.00 ± 0.00 | 0.00 ± 0.00 | 51.41 ± 3.32 | 5.06 ± 0.26 | 0.00 ± 0.00 | 5.06 ± 0.26 |
| Vulnerable first (planWithPriority) | 0.00 ± 0.00 | 0.00 ± 0.00 | 100.00 ± 0.00 | 4.69 ± 0.29 | 0.00 ± 0.00 | 5.13 ± 0.27 |

### calm, staggered

| Policy | All: % without bed | Vulnerable: % without bed | Accessible-needing: % in accessible shelter | Vulnerable: mean travel (min) | General: % without bed | General: mean travel (min) |
|---|---:|---:|---:|---:|---:|---:|
| Proposed: everyone equal (forecast costs, optimal) [baseline] | 0.00 ± 0.00 | 0.00 ± 0.00 | 48.49 ± 3.41 | 5.40 ± 0.30 | 0.00 ± 0.00 | 5.41 ± 0.31 |
| Vulnerable first (planWithPriority) | 0.00 ± 0.00 | 0.00 ± 0.00 | 100.00 ± 0.00 | 5.12 ± 0.35 | 0.00 ± 0.00 | 5.47 ± 0.31 |
