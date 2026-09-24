# Evacuation policy experiment (results)

200 seeds × 4 scenario types × 2 departure modes = 1600 scenario runs. Storm decay per tick: 0.97.
Routes: real OSRM road routes (offline set, `routes.json`). Water: shared simulator. Plans use only information available at t0;
scores use the levels that actually occurred when evacuees passed each point. Values: mean ± 95% CI. Lower is better for every metric.

## All scenarios

| Policy | % without bed | Flooded km / evacuee | Mean travel (min) | Worst travel (min) | % to flooded shelter | En-route flooded km / evacuee (secondary) |
|---|---:|---:|---:|---:|---:|---:|
| Nearest shelter | 31.7 ± 1.0 | 0.269 ± 0.028 | 3.48 ± 0.06 | 5.0 ± 0.1 | 11.22 ± 1.37 | 0.0000 ± 0.0000 |
| Avoid current floods | 31.6 ± 1.0 | 0.285 ± 0.029 | 6.04 ± 0.17 | 8.4 ± 0.2 | 1.81 ± 0.48 | 0.0112 ± 0.0046 |
| Avoid current floods, no warning caution [ablation] | 29.1 ± 1.0 | 0.271 ± 0.028 | 4.31 ± 0.12 | 6.1 ± 0.2 | 4.58 ± 0.85 | 0.0144 ± 0.0048 |
| Forecast-aware | 27.8 ± 1.0 | 0.268 ± 0.027 | 4.86 ± 0.14 | 6.9 ± 0.2 | 1.66 ± 0.46 | 0.0121 ± 0.0049 |
| Avoid current floods + greedy capacity | 0.0 ± 0.0 | 0.304 ± 0.030 | 7.55 ± 0.16 | 13.2 ± 0.3 | 2.56 ± 0.48 | 0.0297 ± 0.0069 |
| Forecast-aware + greedy capacity | 0.0 ± 0.0 | 0.289 ± 0.029 | 6.50 ± 0.14 | 11.1 ± 0.2 | 1.89 ± 0.42 | 0.0285 ± 0.0075 |
| Avoid current floods + optimal capacity | 0.0 ± 0.0 | 0.290 ± 0.029 | 7.17 ± 0.16 | 12.6 ± 0.3 | 2.57 ± 0.48 | 0.0276 ± 0.0068 |
| **Forecast-aware + optimal capacity (proposed)** | 0.0 ± 0.0 | 0.281 ± 0.028 | 6.18 ± 0.14 | 10.6 ± 0.2 | 1.86 ± 0.41 | 0.0255 ± 0.0070 |
| Perfect foresight + optimal capacity [upper bound] | 0.0 ± 0.0 | 0.246 ± 0.026 | 5.59 ± 0.11 | 10.0 ± 0.2 | 0.04 ± 0.05 | 0.0003 ± 0.0004 |

Paired differences (A − B) over identical scenarios, mean ± 95% CI; `w/l` = scenarios where A is better / worse (lower is better for every metric).

| A vs B | % without bed | Flooded km / evacuee | Mean travel (min) | Worst travel (min) | % to flooded shelter | En-route flooded km / evacuee (secondary) |
|---|---:|---:|---:|---:|---:|---:|
| Forecast vs current-flood avoidance (both independent) | -3.8 ± 0.7 (438/178) | -0.017 ± 0.006 (182/38) | -1.18 ± 0.13 (553/165) | -1.5 ± 0.2 (522/144) | -0.15 ± 0.43 (31/29) | 0.0009 ± 0.0045 (16/14) |
| Ablation: current-flood avoidance without vs with warning caution | -2.5 ± 0.7 (398/210) | -0.014 ± 0.006 (173/56) | -1.73 ± 0.13 (630/88) | -2.3 ± 0.2 (614/84) | 2.77 ± 0.69 (5/86) | 0.0032 ± 0.0047 (8/22) |
| Forecast vs current-flood avoidance without warning caution | -1.4 ± 0.5 (153/78) | -0.003 ± 0.005 (74/64) | 0.56 ± 0.08 (36/255) | 0.8 ± 0.1 (30/249) | -2.92 ± 0.76 (86/11) | -0.0022 ± 0.0047 (25/13) |
| Optimal vs greedy assignment (current-flood costs) | 0.0 ± 0.0 (0/0) | -0.014 ± 0.005 (177/74) | -0.38 ± 0.05 (1046/104) | -0.6 ± 0.1 (534/304) | 0.01 ± 0.17 (46/44) | -0.0021 ± 0.0039 (60/45) |
| Optimal vs greedy assignment (forecast costs) | 0.0 ± 0.0 (0/0) | -0.008 ± 0.004 (111/57) | -0.32 ± 0.03 (1024/67) | -0.5 ± 0.1 (528/256) | -0.03 ± 0.14 (33/26) | -0.0029 ± 0.0031 (40/21) |
| Forecast vs current-flood costs (both optimal assignment) | 0.0 ± 0.0 (0/0) | -0.010 ± 0.007 (198/97) | -0.99 ± 0.11 (767/208) | -2.0 ± 0.2 (710/153) | -0.72 ± 0.41 (79/39) | -0.0021 ± 0.0068 (57/33) |
| Proposed vs perfect foresight (gap to upper bound) | 0.0 ± 0.0 (0/0) | 0.034 ± 0.007 (29/240) | 0.59 ± 0.09 (123/480) | 0.6 ± 0.1 (128/372) | 1.81 ± 0.40 (0/108) | 0.0252 ± 0.0070 (3/86) |

## Departures: immediate

| Policy | % without bed | Flooded km / evacuee | Mean travel (min) | Worst travel (min) | % to flooded shelter | En-route flooded km / evacuee (secondary) |
|---|---:|---:|---:|---:|---:|---:|
| Nearest shelter | 31.7 ± 1.4 | 0.272 ± 0.041 | 3.48 ± 0.09 | 5.0 ± 0.1 | 11.10 ± 2.05 | 0.0000 ± 0.0000 |
| Avoid current floods | 31.6 ± 1.4 | 0.277 ± 0.042 | 6.04 ± 0.24 | 8.4 ± 0.3 | 0.44 ± 0.35 | 0.0047 ± 0.0031 |
| Avoid current floods, no warning caution [ablation] | 29.1 ± 1.4 | 0.264 ± 0.040 | 4.31 ± 0.17 | 6.1 ± 0.2 | 1.99 ± 0.86 | 0.0091 ± 0.0048 |
| Forecast-aware | 28.2 ± 1.4 | 0.260 ± 0.039 | 4.59 ± 0.19 | 6.5 ± 0.3 | 0.67 ± 0.47 | 0.0067 ± 0.0044 |
| Avoid current floods + greedy capacity | 0.0 ± 0.0 | 0.287 ± 0.042 | 7.55 ± 0.22 | 13.2 ± 0.4 | 0.90 ± 0.40 | 0.0150 ± 0.0067 |
| Forecast-aware + greedy capacity | 0.0 ± 0.0 | 0.269 ± 0.040 | 6.22 ± 0.19 | 10.7 ± 0.3 | 0.70 ± 0.39 | 0.0128 ± 0.0067 |
| Avoid current floods + optimal capacity | 0.0 ± 0.0 | 0.273 ± 0.041 | 7.17 ± 0.22 | 12.6 ± 0.4 | 0.90 ± 0.40 | 0.0107 ± 0.0059 |
| **Forecast-aware + optimal capacity (proposed)** | 0.0 ± 0.0 | 0.265 ± 0.040 | 5.90 ± 0.18 | 10.2 ± 0.3 | 0.77 ± 0.42 | 0.0128 ± 0.0068 |
| Perfect foresight + optimal capacity [upper bound] | 0.0 ± 0.0 | 0.245 ± 0.037 | 5.59 ± 0.16 | 9.9 ± 0.3 | 0.05 ± 0.10 | 0.0002 ± 0.0003 |

Paired differences (A − B) over identical scenarios, mean ± 95% CI; `w/l` = scenarios where A is better / worse (lower is better for every metric).

| A vs B | % without bed | Flooded km / evacuee | Mean travel (min) | Worst travel (min) | % to flooded shelter | En-route flooded km / evacuee (secondary) |
|---|---:|---:|---:|---:|---:|---:|
| Forecast vs current-flood avoidance (both independent) | -3.4 ± 1.0 (216/97) | -0.018 ± 0.007 (93/14) | -1.45 ± 0.18 (298/65) | -1.9 ± 0.3 (283/60) | 0.23 ± 0.50 (6/11) | 0.0020 ± 0.0042 (4/6) |
| Ablation: current-flood avoidance without vs with warning caution | -2.5 ± 0.9 (199/105) | -0.013 ± 0.006 (84/20) | -1.73 ± 0.19 (315/44) | -2.3 ± 0.3 (307/42) | 1.55 ± 0.75 (0/21) | 0.0044 ± 0.0034 (0/9) |
| Forecast vs current-flood avoidance without warning caution | -0.9 ± 0.6 (47/26) | -0.004 ± 0.005 (27/19) | 0.29 ± 0.08 (14/79) | 0.4 ± 0.1 (11/76) | -1.32 ± 0.82 (20/5) | -0.0024 ± 0.0040 (9/3) |
| Optimal vs greedy assignment (current-flood costs) | 0.0 ± 0.0 (0/0) | -0.014 ± 0.006 (69/23) | -0.38 ± 0.07 (523/52) | -0.6 ± 0.2 (267/152) | 0.00 ± 0.16 (10/8) | -0.0043 ± 0.0041 (21/9) |
| Optimal vs greedy assignment (forecast costs) | 0.0 ± 0.0 (0/0) | -0.003 ± 0.003 (34/23) | -0.32 ± 0.04 (531/22) | -0.5 ± 0.1 (278/121) | 0.07 ± 0.09 (3/6) | 0.0000 ± 0.0017 (8/5) |
| Forecast vs current-flood costs (both optimal assignment) | 0.0 ± 0.0 (0/0) | -0.008 ± 0.008 (98/33) | -1.27 ± 0.15 (424/68) | -2.4 ± 0.3 (392/49) | -0.13 ± 0.39 (20/13) | 0.0021 ± 0.0079 (15/13) |
| Proposed vs perfect foresight (gap to upper bound) | 0.0 ± 0.0 (0/0) | 0.020 ± 0.007 (4/81) | 0.31 ± 0.09 (37/153) | 0.3 ± 0.1 (46/113) | 0.71 ± 0.40 (0/19) | 0.0126 ± 0.0068 (2/20) |

## Departures: staggered

| Policy | % without bed | Flooded km / evacuee | Mean travel (min) | Worst travel (min) | % to flooded shelter | En-route flooded km / evacuee (secondary) |
|---|---:|---:|---:|---:|---:|---:|
| Nearest shelter | 31.7 ± 1.4 | 0.267 ± 0.038 | 3.48 ± 0.09 | 5.0 ± 0.1 | 11.34 ± 1.83 | 0.0000 ± 0.0000 |
| Avoid current floods | 31.6 ± 1.4 | 0.293 ± 0.041 | 6.04 ± 0.24 | 8.4 ± 0.3 | 3.18 ± 0.88 | 0.0178 ± 0.0086 |
| Avoid current floods, no warning caution [ablation] | 29.1 ± 1.4 | 0.278 ± 0.039 | 4.31 ± 0.17 | 6.1 ± 0.2 | 7.17 ± 1.46 | 0.0197 ± 0.0082 |
| Forecast-aware | 27.3 ± 1.4 | 0.277 ± 0.039 | 5.13 ± 0.21 | 7.3 ± 0.3 | 2.64 ± 0.78 | 0.0176 ± 0.0088 |
| Avoid current floods + greedy capacity | 0.0 ± 0.0 | 0.322 ± 0.042 | 7.55 ± 0.22 | 13.2 ± 0.4 | 4.22 ± 0.85 | 0.0444 ± 0.0121 |
| Forecast-aware + greedy capacity | 0.0 ± 0.0 | 0.310 ± 0.041 | 6.77 ± 0.21 | 11.5 ± 0.3 | 3.07 ± 0.73 | 0.0442 ± 0.0132 |
| Avoid current floods + optimal capacity | 0.0 ± 0.0 | 0.307 ± 0.040 | 7.17 ± 0.22 | 12.6 ± 0.4 | 4.25 ± 0.86 | 0.0445 ± 0.0122 |
| **Forecast-aware + optimal capacity (proposed)** | 0.0 ± 0.0 | 0.296 ± 0.040 | 6.46 ± 0.20 | 11.1 ± 0.3 | 2.94 ± 0.70 | 0.0383 ± 0.0122 |
| Perfect foresight + optimal capacity [upper bound] | 0.0 ± 0.0 | 0.247 ± 0.035 | 5.60 ± 0.15 | 10.1 ± 0.3 | 0.03 ± 0.05 | 0.0004 ± 0.0008 |

Paired differences (A − B) over identical scenarios, mean ± 95% CI; `w/l` = scenarios where A is better / worse (lower is better for every metric).

| A vs B | % without bed | Flooded km / evacuee | Mean travel (min) | Worst travel (min) | % to flooded shelter | En-route flooded km / evacuee (secondary) |
|---|---:|---:|---:|---:|---:|---:|
| Forecast vs current-flood avoidance (both independent) | -4.3 ± 1.0 (222/81) | -0.016 ± 0.010 (89/24) | -0.91 ± 0.17 (255/100) | -1.1 ± 0.2 (239/84) | -0.54 ± 0.71 (25/18) | -0.0002 ± 0.0080 (12/8) |
| Ablation: current-flood avoidance without vs with warning caution | -2.5 ± 0.9 (199/105) | -0.014 ± 0.010 (89/36) | -1.73 ± 0.19 (315/44) | -2.3 ± 0.3 (307/42) | 3.99 ± 1.15 (5/65) | 0.0019 ± 0.0087 (8/13) |
| Forecast vs current-flood avoidance without warning caution | -1.8 ± 0.8 (106/52) | -0.002 ± 0.009 (47/45) | 0.83 ± 0.14 (22/176) | 1.2 ± 0.2 (19/173) | -4.52 ± 1.27 (66/6) | -0.0021 ± 0.0086 (16/10) |
| Optimal vs greedy assignment (current-flood costs) | 0.0 ± 0.0 (0/0) | -0.014 ± 0.009 (108/51) | -0.38 ± 0.07 (523/52) | -0.6 ± 0.2 (267/152) | 0.03 ± 0.29 (36/36) | 0.0001 ± 0.0067 (39/36) |
| Optimal vs greedy assignment (forecast costs) | 0.0 ± 0.0 (0/0) | -0.014 ± 0.007 (77/34) | -0.31 ± 0.04 (493/45) | -0.4 ± 0.1 (250/135) | -0.13 ± 0.26 (30/20) | -0.0059 ± 0.0060 (32/16) |
| Forecast vs current-flood costs (both optimal assignment) | 0.0 ± 0.0 (0/0) | -0.011 ± 0.012 (100/64) | -0.71 ± 0.16 (343/140) | -1.6 ± 0.3 (318/104) | -1.31 ± 0.72 (59/26) | -0.0063 ± 0.0111 (42/20) |
| Proposed vs perfect foresight (gap to upper bound) | 0.0 ± 0.0 (0/0) | 0.049 ± 0.013 (25/159) | 0.86 ± 0.16 (86/327) | 0.9 ± 0.2 (82/259) | 2.91 ± 0.69 (0/89) | 0.0378 ± 0.0123 (1/66) |

## Appendix: by scenario type and departure mode

### rising, immediate

| Policy | % without bed | Flooded km / evacuee | Mean travel (min) | Worst travel (min) | % to flooded shelter | En-route flooded km / evacuee (secondary) |
|---|---:|---:|---:|---:|---:|---:|
| Nearest shelter | 33.4 ± 2.6 | 0.396 ± 0.094 | 3.60 ± 0.18 | 5.1 ± 0.3 | 17.20 ± 4.86 | 0.0000 ± 0.0000 |
| Avoid current floods | 31.6 ± 2.8 | 0.401 ± 0.095 | 6.40 ± 0.48 | 8.8 ± 0.6 | 1.13 ± 1.18 | 0.0112 ± 0.0101 |
| Avoid current floods, no warning caution [ablation] | 30.0 ± 2.8 | 0.392 ± 0.092 | 4.47 ± 0.35 | 6.3 ± 0.5 | 6.75 ± 3.15 | 0.0234 ± 0.0156 |
| Forecast-aware | 27.2 ± 2.8 | 0.372 ± 0.089 | 5.12 ± 0.40 | 7.2 ± 0.5 | 1.51 ± 1.47 | 0.0146 ± 0.0134 |
| Avoid current floods + greedy capacity | 0.0 ± 0.1 | 0.411 ± 0.096 | 7.95 ± 0.44 | 13.7 ± 0.8 | 2.70 ± 1.35 | 0.0322 ± 0.0208 |
| Forecast-aware + greedy capacity | 0.0 ± 0.1 | 0.379 ± 0.090 | 6.64 ± 0.38 | 11.2 ± 0.6 | 1.16 ± 0.93 | 0.0217 ± 0.0169 |
| Avoid current floods + optimal capacity | 0.0 ± 0.1 | 0.382 ± 0.092 | 7.60 ± 0.44 | 13.2 ± 0.7 | 2.33 ± 1.30 | 0.0162 ± 0.0132 |
| **Forecast-aware + optimal capacity (proposed)** | 0.0 ± 0.1 | 0.371 ± 0.088 | 6.35 ± 0.37 | 10.7 ± 0.5 | 1.14 ± 0.96 | 0.0190 ± 0.0160 |
| Perfect foresight + optimal capacity [upper bound] | 0.0 ± 0.1 | 0.346 ± 0.085 | 6.09 ± 0.35 | 10.5 ± 0.5 | 0.19 ± 0.38 | 0.0006 ± 0.0011 |

### rising, staggered

| Policy | % without bed | Flooded km / evacuee | Mean travel (min) | Worst travel (min) | % to flooded shelter | En-route flooded km / evacuee (secondary) |
|---|---:|---:|---:|---:|---:|---:|
| Nearest shelter | 33.4 ± 2.6 | 0.615 ± 0.103 | 3.60 ± 0.18 | 5.1 ± 0.3 | 26.40 ± 5.19 | 0.0000 ± 0.0000 |
| Avoid current floods | 31.6 ± 2.8 | 0.639 ± 0.108 | 6.40 ± 0.48 | 8.8 ± 0.6 | 5.99 ± 2.39 | 0.0127 ± 0.0101 |
| Avoid current floods, no warning caution [ablation] | 30.0 ± 2.8 | 0.627 ± 0.106 | 4.47 ± 0.35 | 6.3 ± 0.5 | 18.06 ± 4.41 | 0.0377 ± 0.0221 |
| Forecast-aware | 25.9 ± 2.8 | 0.606 ± 0.103 | 6.14 ± 0.45 | 8.4 ± 0.6 | 2.80 ± 1.67 | 0.0168 ± 0.0169 |
| Avoid current floods + greedy capacity | 0.0 ± 0.1 | 0.690 ± 0.110 | 7.95 ± 0.44 | 13.7 ± 0.8 | 8.42 ± 2.27 | 0.0636 ± 0.0258 |
| Forecast-aware + greedy capacity | 0.0 ± 0.1 | 0.657 ± 0.105 | 7.78 ± 0.45 | 12.9 ± 0.8 | 3.63 ± 1.51 | 0.0541 ± 0.0263 |
| Avoid current floods + optimal capacity | 0.0 ± 0.1 | 0.653 ± 0.105 | 7.60 ± 0.44 | 13.2 ± 0.7 | 7.82 ± 2.20 | 0.0530 ± 0.0228 |
| **Forecast-aware + optimal capacity (proposed)** | 0.0 ± 0.1 | 0.634 ± 0.103 | 7.45 ± 0.44 | 12.3 ± 0.7 | 3.20 ± 1.32 | 0.0424 ± 0.0231 |
| Perfect foresight + optimal capacity [upper bound] | 0.0 ± 0.1 | 0.569 ± 0.096 | 6.66 ± 0.36 | 11.7 ± 0.6 | 0.11 ± 0.22 | 0.0017 ± 0.0033 |

### receding, immediate

| Policy | % without bed | Flooded km / evacuee | Mean travel (min) | Worst travel (min) | % to flooded shelter | En-route flooded km / evacuee (secondary) |
|---|---:|---:|---:|---:|---:|---:|
| Nearest shelter | 31.3 ± 2.8 | 0.553 ± 0.105 | 3.47 ± 0.18 | 4.8 ± 0.3 | 20.97 ± 5.24 | 0.0000 ± 0.0000 |
| Avoid current floods | 29.9 ± 2.9 | 0.573 ± 0.106 | 7.15 ± 0.50 | 9.9 ± 0.7 | 0.28 ± 0.39 | 0.0054 ± 0.0062 |
| Avoid current floods, no warning caution [ablation] | 26.1 ± 3.0 | 0.539 ± 0.100 | 5.46 ± 0.44 | 7.5 ± 0.6 | 0.71 ± 0.63 | 0.0109 ± 0.0100 |
| Forecast-aware | 25.2 ± 3.0 | 0.541 ± 0.100 | 5.70 ± 0.47 | 7.9 ± 0.6 | 0.51 ± 0.52 | 0.0101 ± 0.0105 |
| Avoid current floods + greedy capacity | 0.0 ± 0.0 | 0.581 ± 0.108 | 8.68 ± 0.48 | 14.3 ± 0.8 | 0.23 ± 0.34 | 0.0058 ± 0.0060 |
| Forecast-aware + greedy capacity | 0.0 ± 0.0 | 0.555 ± 0.103 | 7.20 ± 0.46 | 11.7 ± 0.7 | 0.73 ± 0.63 | 0.0153 ± 0.0135 |
| Avoid current floods + optimal capacity | 0.0 ± 0.0 | 0.556 ± 0.102 | 8.25 ± 0.46 | 13.7 ± 0.8 | 0.41 ± 0.44 | 0.0031 ± 0.0043 |
| **Forecast-aware + optimal capacity (proposed)** | 0.0 ± 0.0 | 0.551 ± 0.102 | 6.90 ± 0.44 | 11.0 ± 0.6 | 0.84 ± 0.78 | 0.0153 ± 0.0139 |
| Perfect foresight + optimal capacity [upper bound] | 0.0 ± 0.0 | 0.516 ± 0.096 | 6.28 ± 0.39 | 10.6 ± 0.6 | 0.03 ± 0.05 | 0.0001 ± 0.0003 |

### receding, staggered

| Policy | % without bed | Flooded km / evacuee | Mean travel (min) | Worst travel (min) | % to flooded shelter | En-route flooded km / evacuee (secondary) |
|---|---:|---:|---:|---:|---:|---:|
| Nearest shelter | 31.3 ± 2.8 | 0.228 ± 0.064 | 3.47 ± 0.18 | 4.8 ± 0.3 | 8.35 ± 2.95 | 0.0000 ± 0.0000 |
| Avoid current floods | 29.9 ± 2.9 | 0.258 ± 0.071 | 7.15 ± 0.50 | 9.9 ± 0.7 | 0.77 ± 0.68 | 0.0229 ± 0.0176 |
| Avoid current floods, no warning caution [ablation] | 26.1 ± 3.0 | 0.243 ± 0.068 | 5.46 ± 0.44 | 7.5 ± 0.6 | 1.38 ± 1.26 | 0.0214 ± 0.0163 |
| Forecast-aware | 26.1 ± 3.0 | 0.255 ± 0.071 | 5.94 ± 0.46 | 8.3 ± 0.6 | 1.28 ± 1.16 | 0.0305 ± 0.0252 |
| Avoid current floods + greedy capacity | 0.0 ± 0.0 | 0.260 ± 0.071 | 8.68 ± 0.48 | 14.3 ± 0.8 | 0.77 ± 0.67 | 0.0215 ± 0.0167 |
| Forecast-aware + greedy capacity | 0.0 ± 0.0 | 0.256 ± 0.070 | 7.45 ± 0.46 | 12.2 ± 0.8 | 1.07 ± 1.03 | 0.0276 ± 0.0229 |
| Avoid current floods + optimal capacity | 0.0 ± 0.0 | 0.247 ± 0.068 | 8.25 ± 0.46 | 13.7 ± 0.8 | 0.80 ± 0.67 | 0.0194 ± 0.0162 |
| **Forecast-aware + optimal capacity (proposed)** | 0.0 ± 0.0 | 0.246 ± 0.068 | 7.18 ± 0.46 | 11.5 ± 0.7 | 1.20 ± 1.06 | 0.0250 ± 0.0213 |
| Perfect foresight + optimal capacity [upper bound] | 0.0 ± 0.0 | 0.212 ± 0.059 | 5.42 ± 0.28 | 9.6 ± 0.5 | 0.00 ± 0.00 | 0.0000 ± 0.0001 |

### surprise, immediate

| Policy | % without bed | Flooded km / evacuee | Mean travel (min) | Worst travel (min) | % to flooded shelter | En-route flooded km / evacuee (secondary) |
|---|---:|---:|---:|---:|---:|---:|
| Nearest shelter | 30.2 ± 2.8 | 0.088 ± 0.051 | 3.44 ± 0.16 | 4.9 ± 0.3 | 4.24 ± 2.74 | 0.0000 ± 0.0000 |
| Avoid current floods | 31.6 ± 2.9 | 0.086 ± 0.049 | 5.43 ± 0.45 | 7.6 ± 0.6 | 0.00 ± 0.00 | 0.0021 ± 0.0041 |
| Avoid current floods, no warning caution [ablation] | 29.1 ± 2.8 | 0.079 ± 0.046 | 3.79 ± 0.27 | 5.3 ± 0.4 | 0.00 ± 0.00 | 0.0021 ± 0.0041 |
| Forecast-aware | 29.5 ± 2.8 | 0.080 ± 0.046 | 3.89 ± 0.28 | 5.5 ± 0.4 | 0.17 ± 0.33 | 0.0021 ± 0.0041 |
| Avoid current floods + greedy capacity | 0.0 ± 0.0 | 0.091 ± 0.051 | 6.98 ± 0.43 | 12.6 ± 0.8 | 0.16 ± 0.22 | 0.0064 ± 0.0066 |
| Forecast-aware + greedy capacity | 0.0 ± 0.0 | 0.084 ± 0.048 | 5.64 ± 0.31 | 10.0 ± 0.5 | 0.22 ± 0.34 | 0.0026 ± 0.0042 |
| Avoid current floods + optimal capacity | 0.0 ± 0.0 | 0.089 ± 0.050 | 6.59 ± 0.43 | 12.0 ± 0.8 | 0.30 ± 0.36 | 0.0079 ± 0.0072 |
| **Forecast-aware + optimal capacity (proposed)** | 0.0 ± 0.0 | 0.080 ± 0.046 | 5.29 ± 0.29 | 9.6 ± 0.5 | 0.31 ± 0.43 | 0.0035 ± 0.0049 |
| Perfect foresight + optimal capacity [upper bound] | 0.0 ± 0.0 | 0.077 ± 0.044 | 5.10 ± 0.27 | 9.2 ± 0.4 | 0.00 ± 0.00 | 0.0000 ± 0.0000 |

### surprise, staggered

| Policy | % without bed | Flooded km / evacuee | Mean travel (min) | Worst travel (min) | % to flooded shelter | En-route flooded km / evacuee (secondary) |
|---|---:|---:|---:|---:|---:|---:|
| Nearest shelter | 30.2 ± 2.8 | 0.190 ± 0.061 | 3.44 ± 0.16 | 4.9 ± 0.3 | 9.57 ± 3.22 | 0.0000 ± 0.0000 |
| Avoid current floods | 31.6 ± 2.9 | 0.236 ± 0.076 | 5.43 ± 0.45 | 7.6 ± 0.6 | 5.79 ± 2.36 | 0.0354 ± 0.0276 |
| Avoid current floods, no warning caution [ablation] | 29.1 ± 2.8 | 0.209 ± 0.065 | 3.79 ± 0.27 | 5.3 ± 0.4 | 8.83 ± 2.97 | 0.0196 ± 0.0177 |
| Forecast-aware | 27.6 ± 2.9 | 0.212 ± 0.065 | 4.43 ± 0.34 | 6.4 ± 0.5 | 6.26 ± 2.29 | 0.0230 ± 0.0178 |
| Avoid current floods + greedy capacity | 0.0 ± 0.0 | 0.291 ± 0.082 | 6.98 ± 0.43 | 12.6 ± 0.8 | 7.17 ± 2.18 | 0.0852 ± 0.0355 |
| Forecast-aware + greedy capacity | 0.0 ± 0.0 | 0.291 ± 0.080 | 6.14 ± 0.36 | 10.6 ± 0.6 | 7.24 ± 2.10 | 0.0930 ± 0.0387 |
| Avoid current floods + optimal capacity | 0.0 ± 0.0 | 0.280 ± 0.077 | 6.59 ± 0.43 | 12.0 ± 0.8 | 7.76 ± 2.27 | 0.0922 ± 0.0367 |
| **Forecast-aware + optimal capacity (proposed)** | 0.0 ± 0.0 | 0.264 ± 0.076 | 5.80 ± 0.34 | 10.3 ± 0.6 | 6.82 ± 2.05 | 0.0805 ± 0.0361 |
| Perfect foresight + optimal capacity [upper bound] | 0.0 ± 0.0 | 0.176 ± 0.055 | 5.47 ± 0.30 | 10.0 ± 0.5 | 0.00 ± 0.00 | 0.0000 ± 0.0000 |

### calm, immediate

| Policy | % without bed | Flooded km / evacuee | Mean travel (min) | Worst travel (min) | % to flooded shelter | En-route flooded km / evacuee (secondary) |
|---|---:|---:|---:|---:|---:|---:|
| Nearest shelter | 31.8 ± 2.6 | 0.051 ± 0.041 | 3.40 ± 0.17 | 5.0 ± 0.3 | 2.00 ± 1.95 | 0.0000 ± 0.0000 |
| Avoid current floods | 33.4 ± 2.8 | 0.050 ± 0.040 | 5.18 ± 0.42 | 7.3 ± 0.5 | 0.33 ± 0.65 | 0.0000 ± 0.0000 |
| Avoid current floods, no warning caution [ablation] | 31.2 ± 2.6 | 0.046 ± 0.036 | 3.51 ± 0.20 | 5.2 ± 0.3 | 0.50 ± 0.98 | 0.0000 ± 0.0000 |
| Forecast-aware | 30.9 ± 2.6 | 0.046 ± 0.036 | 3.67 ± 0.24 | 5.4 ± 0.3 | 0.50 ± 0.98 | 0.0000 ± 0.0000 |
| Avoid current floods + greedy capacity | 0.0 ± 0.0 | 0.066 ± 0.042 | 6.59 ± 0.39 | 12.2 ± 0.7 | 0.49 ± 0.70 | 0.0158 ± 0.0142 |
| Forecast-aware + greedy capacity | 0.0 ± 0.0 | 0.057 ± 0.039 | 5.41 ± 0.28 | 10.0 ± 0.5 | 0.70 ± 1.05 | 0.0115 ± 0.0154 |
| Avoid current floods + optimal capacity | 0.0 ± 0.0 | 0.065 ± 0.043 | 6.25 ± 0.38 | 11.6 ± 0.7 | 0.55 ± 0.73 | 0.0157 ± 0.0174 |
| **Forecast-aware + optimal capacity (proposed)** | 0.0 ± 0.0 | 0.059 ± 0.039 | 5.06 ± 0.26 | 9.5 ± 0.4 | 0.78 ± 1.04 | 0.0135 ± 0.0161 |
| Perfect foresight + optimal capacity [upper bound] | 0.0 ± 0.0 | 0.043 ± 0.035 | 4.89 ± 0.24 | 9.3 ± 0.4 | 0.00 ± 0.00 | 0.0000 ± 0.0000 |

### calm, staggered

| Policy | % without bed | Flooded km / evacuee | Mean travel (min) | Worst travel (min) | % to flooded shelter | En-route flooded km / evacuee (secondary) |
|---|---:|---:|---:|---:|---:|---:|
| Nearest shelter | 31.8 ± 2.6 | 0.035 ± 0.027 | 3.40 ± 0.17 | 5.0 ± 0.3 | 1.05 ± 0.96 | 0.0000 ± 0.0000 |
| Avoid current floods | 33.4 ± 2.8 | 0.037 ± 0.028 | 5.18 ± 0.42 | 7.3 ± 0.5 | 0.17 ± 0.32 | 0.0000 ± 0.0000 |
| Avoid current floods, no warning caution [ablation] | 31.2 ± 2.6 | 0.035 ± 0.027 | 3.51 ± 0.20 | 5.2 ± 0.3 | 0.39 ± 0.54 | 0.0000 ± 0.0000 |
| Forecast-aware | 29.7 ± 2.6 | 0.034 ± 0.027 | 4.03 ± 0.30 | 6.0 ± 0.4 | 0.24 ± 0.35 | 0.0000 ± 0.0000 |
| Avoid current floods + greedy capacity | 0.0 ± 0.0 | 0.045 ± 0.029 | 6.59 ± 0.39 | 12.2 ± 0.7 | 0.52 ± 0.48 | 0.0074 ± 0.0078 |
| Forecast-aware + greedy capacity | 0.0 ± 0.0 | 0.036 ± 0.027 | 5.70 ± 0.30 | 10.3 ± 0.5 | 0.33 ± 0.39 | 0.0019 ± 0.0037 |
| Avoid current floods + optimal capacity | 0.0 ± 0.0 | 0.050 ± 0.031 | 6.25 ± 0.38 | 11.6 ± 0.7 | 0.61 ± 0.57 | 0.0136 ± 0.0140 |
| **Forecast-aware + optimal capacity (proposed)** | 0.0 ± 0.0 | 0.040 ± 0.028 | 5.41 ± 0.31 | 10.1 ± 0.5 | 0.55 ± 0.55 | 0.0052 ± 0.0075 |
| Perfect foresight + optimal capacity [upper bound] | 0.0 ± 0.0 | 0.032 ± 0.025 | 4.84 ± 0.22 | 9.3 ± 0.4 | 0.00 ± 0.00 | 0.0000 ± 0.0000 |
