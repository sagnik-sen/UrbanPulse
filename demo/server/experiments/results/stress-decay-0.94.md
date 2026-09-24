# Evacuation policy experiment (stress-decay-0.94)

200 seeds × 4 scenario types × 2 departure modes = 1600 scenario runs. Storm decay per tick: 0.94.
Routes: real OSRM road routes (offline set, `routes.json`). Water: shared simulator. Plans use only information available at t0;
scores use the levels that actually occurred when evacuees passed each point. Values: mean ± 95% CI. Lower is better for every metric.

## All scenarios

| Policy | % without bed | Flooded km / evacuee | Mean travel (min) | Worst travel (min) | % to flooded shelter | En-route flooded km / evacuee (secondary) |
|---|---:|---:|---:|---:|---:|---:|
| Nearest shelter | 31.6 ± 1.0 | 0.155 ± 0.022 | 3.45 ± 0.06 | 4.9 ± 0.1 | 6.35 ± 1.04 | 0.0000 ± 0.0000 |
| Avoid current floods | 32.6 ± 1.0 | 0.163 ± 0.023 | 5.58 ± 0.16 | 7.8 ± 0.2 | 1.25 ± 0.41 | 0.0078 ± 0.0041 |
| Avoid current floods, no warning caution [ablation] | 30.1 ± 1.0 | 0.155 ± 0.022 | 3.90 ± 0.10 | 5.6 ± 0.1 | 2.78 ± 0.64 | 0.0087 ± 0.0037 |
| Forecast-aware | 28.7 ± 1.0 | 0.151 ± 0.021 | 4.44 ± 0.13 | 6.4 ± 0.2 | 0.86 ± 0.32 | 0.0058 ± 0.0032 |
| Avoid current floods + greedy capacity | 0.0 ± 0.0 | 0.176 ± 0.023 | 7.11 ± 0.15 | 12.6 ± 0.3 | 1.68 ± 0.38 | 0.0225 ± 0.0063 |
| Forecast-aware + greedy capacity | 0.0 ± 0.0 | 0.162 ± 0.022 | 6.07 ± 0.13 | 10.6 ± 0.2 | 1.09 ± 0.32 | 0.0153 ± 0.0050 |
| Avoid current floods + optimal capacity | 0.0 ± 0.0 | 0.170 ± 0.022 | 6.74 ± 0.15 | 12.0 ± 0.3 | 1.75 ± 0.38 | 0.0216 ± 0.0057 |
| **Forecast-aware + optimal capacity (proposed)** | 0.0 ± 0.0 | 0.159 ± 0.022 | 5.77 ± 0.13 | 10.2 ± 0.2 | 1.11 ± 0.31 | 0.0157 ± 0.0052 |
| Perfect foresight + optimal capacity [upper bound] | 0.0 ± 0.0 | 0.137 ± 0.020 | 5.23 ± 0.10 | 9.5 ± 0.2 | 0.03 ± 0.05 | 0.0002 ± 0.0002 |

Paired differences (A − B) over identical scenarios, mean ± 95% CI; `w/l` = scenarios where A is better / worse (lower is better for every metric).

| A vs B | % without bed | Flooded km / evacuee | Mean travel (min) | Worst travel (min) | % to flooded shelter | En-route flooded km / evacuee (secondary) |
|---|---:|---:|---:|---:|---:|---:|
| Forecast vs current-flood avoidance (both independent) | -3.9 ± 0.7 (383/155) | -0.011 ± 0.004 (109/21) | -1.14 ± 0.13 (501/126) | -1.4 ± 0.2 (479/114) | -0.39 ± 0.34 (24/16) | -0.0020 ± 0.0030 (11/3) |
| Ablation: current-flood avoidance without vs with warning caution | -2.5 ± 0.6 (338/180) | -0.007 ± 0.005 (99/39) | -1.68 ± 0.13 (572/48) | -2.2 ± 0.2 (558/48) | 1.52 ± 0.49 (2/57) | 0.0009 ± 0.0042 (5/14) |
| Forecast vs current-flood avoidance without warning caution | -1.4 ± 0.5 (129/66) | -0.004 ± 0.004 (59/36) | 0.54 ± 0.08 (23/231) | 0.8 ± 0.1 (22/224) | -1.92 ± 0.57 (61/4) | -0.0029 ± 0.0034 (17/5) |
| Optimal vs greedy assignment (current-flood costs) | 0.0 ± 0.0 (0/0) | -0.006 ± 0.005 (108/62) | -0.37 ± 0.04 (1078/98) | -0.5 ± 0.2 (538/308) | 0.07 ± 0.15 (28/36) | -0.0010 ± 0.0041 (45/38) |
| Optimal vs greedy assignment (forecast costs) | 0.0 ± 0.0 (0/0) | -0.003 ± 0.003 (65/44) | -0.31 ± 0.03 (1061/57) | -0.4 ± 0.1 (544/268) | 0.01 ± 0.13 (22/23) | 0.0005 ± 0.0027 (23/26) |
| Forecast vs current-flood costs (both optimal assignment) | 0.0 ± 0.0 (0/0) | -0.011 ± 0.006 (146/54) | -0.97 ± 0.11 (713/174) | -1.9 ± 0.2 (674/134) | -0.64 ± 0.31 (61/24) | -0.0058 ± 0.0056 (52/22) |
| Proposed vs perfect foresight (gap to upper bound) | 0.0 ± 0.0 (0/0) | 0.022 ± 0.006 (18/155) | 0.54 ± 0.08 (81/454) | 0.7 ± 0.1 (91/359) | 1.07 ± 0.30 (0/67) | 0.0156 ± 0.0052 (1/61) |

## Departures: immediate

| Policy | % without bed | Flooded km / evacuee | Mean travel (min) | Worst travel (min) | % to flooded shelter | En-route flooded km / evacuee (secondary) |
|---|---:|---:|---:|---:|---:|---:|
| Nearest shelter | 31.6 ± 1.4 | 0.150 ± 0.032 | 3.45 ± 0.08 | 4.9 ± 0.1 | 6.19 ± 1.58 | 0.0000 ± 0.0000 |
| Avoid current floods | 32.6 ± 1.4 | 0.154 ± 0.032 | 5.58 ± 0.23 | 7.8 ± 0.3 | 0.48 ± 0.39 | 0.0062 ± 0.0054 |
| Avoid current floods, no warning caution [ablation] | 30.1 ± 1.4 | 0.147 ± 0.031 | 3.90 ± 0.14 | 5.6 ± 0.2 | 1.34 ± 0.70 | 0.0081 ± 0.0049 |
| Forecast-aware | 29.4 ± 1.4 | 0.143 ± 0.031 | 4.16 ± 0.16 | 5.9 ± 0.2 | 0.33 ± 0.30 | 0.0058 ± 0.0045 |
| Avoid current floods + greedy capacity | 0.0 ± 0.0 | 0.162 ± 0.033 | 7.11 ± 0.22 | 12.6 ± 0.4 | 0.72 ± 0.37 | 0.0162 ± 0.0084 |
| Forecast-aware + greedy capacity | 0.0 ± 0.0 | 0.147 ± 0.031 | 5.78 ± 0.17 | 10.2 ± 0.3 | 0.48 ± 0.34 | 0.0100 ± 0.0062 |
| Avoid current floods + optimal capacity | 0.0 ± 0.0 | 0.156 ± 0.032 | 6.74 ± 0.21 | 12.0 ± 0.4 | 0.81 ± 0.39 | 0.0136 ± 0.0069 |
| **Forecast-aware + optimal capacity (proposed)** | 0.0 ± 0.0 | 0.145 ± 0.030 | 5.48 ± 0.16 | 9.7 ± 0.2 | 0.53 ± 0.36 | 0.0103 ± 0.0062 |
| Perfect foresight + optimal capacity [upper bound] | 0.0 ± 0.0 | 0.132 ± 0.029 | 5.24 ± 0.15 | 9.4 ± 0.2 | 0.05 ± 0.09 | 0.0001 ± 0.0003 |

Paired differences (A − B) over identical scenarios, mean ± 95% CI; `w/l` = scenarios where A is better / worse (lower is better for every metric).

| A vs B | % without bed | Flooded km / evacuee | Mean travel (min) | Worst travel (min) | % to flooded shelter | En-route flooded km / evacuee (secondary) |
|---|---:|---:|---:|---:|---:|---:|
| Forecast vs current-flood avoidance (both independent) | -3.2 ± 0.9 (182/87) | -0.010 ± 0.005 (53/8) | -1.42 ± 0.19 (273/41) | -1.9 ± 0.3 (262/41) | -0.14 ± 0.37 (6/5) | -0.0004 ± 0.0038 (4/2) |
| Ablation: current-flood avoidance without vs with warning caution | -2.5 ± 0.9 (169/90) | -0.007 ± 0.006 (50/15) | -1.68 ± 0.19 (286/24) | -2.2 ± 0.3 (279/24) | 0.87 ± 0.58 (1/15) | 0.0019 ± 0.0055 (1/7) |
| Forecast vs current-flood avoidance without warning caution | -0.7 ± 0.5 (36/22) | -0.004 ± 0.004 (20/11) | 0.26 ± 0.08 (11/63) | 0.4 ± 0.1 (10/59) | -1.01 ± 0.67 (14/3) | -0.0023 ± 0.0035 (7/1) |
| Optimal vs greedy assignment (current-flood costs) | 0.0 ± 0.0 (0/0) | -0.005 ± 0.005 (37/25) | -0.37 ± 0.06 (539/49) | -0.5 ± 0.2 (269/154) | 0.10 ± 0.13 (5/9) | -0.0026 ± 0.0050 (15/13) |
| Optimal vs greedy assignment (forecast costs) | 0.0 ± 0.0 (0/0) | -0.002 ± 0.002 (21/13) | -0.30 ± 0.03 (548/21) | -0.4 ± 0.1 (280/132) | 0.05 ± 0.08 (3/5) | 0.0003 ± 0.0014 (4/5) |
| Forecast vs current-flood costs (both optimal assignment) | 0.0 ± 0.0 (0/0) | -0.011 ± 0.008 (68/15) | -1.25 ± 0.15 (398/49) | -2.3 ± 0.3 (368/44) | -0.29 ± 0.35 (17/8) | -0.0033 ± 0.0073 (18/7) |
| Proposed vs perfect foresight (gap to upper bound) | 0.0 ± 0.0 (0/0) | 0.013 ± 0.006 (2/47) | 0.24 ± 0.08 (24/139) | 0.3 ± 0.1 (29/110) | 0.48 ± 0.33 (0/13) | 0.0102 ± 0.0062 (1/16) |

## Departures: staggered

| Policy | % without bed | Flooded km / evacuee | Mean travel (min) | Worst travel (min) | % to flooded shelter | En-route flooded km / evacuee (secondary) |
|---|---:|---:|---:|---:|---:|---:|
| Nearest shelter | 31.6 ± 1.4 | 0.159 ± 0.030 | 3.45 ± 0.08 | 4.9 ± 0.1 | 6.51 ± 1.36 | 0.0000 ± 0.0000 |
| Avoid current floods | 32.6 ± 1.4 | 0.172 ± 0.032 | 5.58 ± 0.23 | 7.8 ± 0.3 | 2.03 ± 0.72 | 0.0095 ± 0.0063 |
| Avoid current floods, no warning caution [ablation] | 30.1 ± 1.4 | 0.164 ± 0.030 | 3.90 ± 0.14 | 5.6 ± 0.2 | 4.21 ± 1.07 | 0.0094 ± 0.0055 |
| Forecast-aware | 28.1 ± 1.4 | 0.159 ± 0.029 | 4.72 ± 0.19 | 6.8 ± 0.3 | 1.38 ± 0.55 | 0.0058 ± 0.0046 |
| Avoid current floods + greedy capacity | 0.0 ± 0.0 | 0.191 ± 0.033 | 7.11 ± 0.22 | 12.6 ± 0.4 | 2.64 ± 0.66 | 0.0289 ± 0.0095 |
| Forecast-aware + greedy capacity | 0.0 ± 0.0 | 0.177 ± 0.031 | 6.37 ± 0.19 | 11.0 ± 0.3 | 1.71 ± 0.53 | 0.0206 ± 0.0078 |
| Avoid current floods + optimal capacity | 0.0 ± 0.0 | 0.184 ± 0.031 | 6.74 ± 0.21 | 12.0 ± 0.4 | 2.68 ± 0.66 | 0.0295 ± 0.0091 |
| **Forecast-aware + optimal capacity (proposed)** | 0.0 ± 0.0 | 0.174 ± 0.030 | 6.05 ± 0.19 | 10.6 ± 0.3 | 1.68 ± 0.51 | 0.0212 ± 0.0083 |
| Perfect foresight + optimal capacity [upper bound] | 0.0 ± 0.0 | 0.143 ± 0.027 | 5.22 ± 0.13 | 9.6 ± 0.2 | 0.02 ± 0.04 | 0.0002 ± 0.0002 |

Paired differences (A − B) over identical scenarios, mean ± 95% CI; `w/l` = scenarios where A is better / worse (lower is better for every metric).

| A vs B | % without bed | Flooded km / evacuee | Mean travel (min) | Worst travel (min) | % to flooded shelter | En-route flooded km / evacuee (secondary) |
|---|---:|---:|---:|---:|---:|---:|
| Forecast vs current-flood avoidance (both independent) | -4.5 ± 0.9 (201/68) | -0.012 ± 0.006 (56/13) | -0.86 ± 0.17 (228/85) | -1.0 ± 0.2 (217/73) | -0.65 ± 0.57 (18/11) | -0.0036 ± 0.0048 (7/1) |
| Ablation: current-flood avoidance without vs with warning caution | -2.5 ± 0.9 (169/90) | -0.008 ± 0.007 (49/24) | -1.68 ± 0.19 (286/24) | -2.2 ± 0.3 (279/24) | 2.18 ± 0.78 (1/42) | -0.0001 ± 0.0063 (4/7) |
| Forecast vs current-flood avoidance without warning caution | -2.0 ± 0.8 (93/44) | -0.005 ± 0.006 (39/25) | 0.82 ± 0.13 (12/168) | 1.2 ± 0.2 (12/165) | -2.82 ± 0.92 (47/1) | -0.0036 ± 0.0058 (10/4) |
| Optimal vs greedy assignment (current-flood costs) | 0.0 ± 0.0 (0/0) | -0.007 ± 0.007 (71/37) | -0.37 ± 0.06 (539/49) | -0.5 ± 0.2 (269/154) | 0.04 ± 0.28 (23/27) | 0.0007 ± 0.0065 (30/25) |
| Optimal vs greedy assignment (forecast costs) | 0.0 ± 0.0 (0/0) | -0.003 ± 0.006 (44/31) | -0.31 ± 0.04 (513/36) | -0.4 ± 0.1 (264/136) | -0.03 ± 0.26 (19/18) | 0.0006 ± 0.0053 (19/21) |
| Forecast vs current-flood costs (both optimal assignment) | 0.0 ± 0.0 (0/0) | -0.010 ± 0.009 (78/39) | -0.69 ± 0.16 (315/125) | -1.5 ± 0.3 (306/90) | -1.00 ± 0.52 (44/16) | -0.0083 ± 0.0083 (34/15) |
| Proposed vs perfect foresight (gap to upper bound) | 0.0 ± 0.0 (0/0) | 0.031 ± 0.009 (16/108) | 0.83 ± 0.15 (57/315) | 1.0 ± 0.2 (62/249) | 1.66 ± 0.51 (0/54) | 0.0210 ± 0.0083 (0/45) |

## Appendix: by scenario type and departure mode

### rising, immediate

| Policy | % without bed | Flooded km / evacuee | Mean travel (min) | Worst travel (min) | % to flooded shelter | En-route flooded km / evacuee (secondary) |
|---|---:|---:|---:|---:|---:|---:|
| Nearest shelter | 33.6 ± 2.6 | 0.342 ± 0.091 | 3.63 ± 0.18 | 5.1 ± 0.3 | 14.07 ± 4.53 | 0.0000 ± 0.0000 |
| Avoid current floods | 32.8 ± 2.8 | 0.358 ± 0.094 | 6.05 ± 0.47 | 8.4 ± 0.6 | 1.57 ± 1.40 | 0.0211 ± 0.0209 |
| Avoid current floods, no warning caution [ablation] | 30.3 ± 2.9 | 0.342 ± 0.090 | 4.44 ± 0.34 | 6.2 ± 0.4 | 4.71 ± 2.57 | 0.0243 ± 0.0168 |
| Forecast-aware | 27.7 ± 2.8 | 0.326 ± 0.088 | 5.05 ± 0.40 | 7.0 ± 0.5 | 0.33 ± 0.46 | 0.0153 ± 0.0151 |
| Avoid current floods + greedy capacity | 0.0 ± 0.1 | 0.365 ± 0.095 | 7.77 ± 0.44 | 13.4 ± 0.8 | 2.20 ± 1.26 | 0.0383 ± 0.0288 |
| Forecast-aware + greedy capacity | 0.0 ± 0.1 | 0.327 ± 0.087 | 6.56 ± 0.37 | 11.0 ± 0.5 | 0.65 ± 0.69 | 0.0199 ± 0.0168 |
| Avoid current floods + optimal capacity | 0.0 ± 0.1 | 0.344 ± 0.091 | 7.39 ± 0.43 | 13.1 ± 0.8 | 2.14 ± 1.27 | 0.0248 ± 0.0182 |
| **Forecast-aware + optimal capacity (proposed)** | 0.0 ± 0.1 | 0.321 ± 0.086 | 6.28 ± 0.37 | 10.6 ± 0.5 | 0.68 ± 0.74 | 0.0183 ± 0.0155 |
| Perfect foresight + optimal capacity [upper bound] | 0.0 ± 0.1 | 0.300 ± 0.082 | 5.97 ± 0.34 | 10.3 ± 0.5 | 0.19 ± 0.38 | 0.0006 ± 0.0011 |

### rising, staggered

| Policy | % without bed | Flooded km / evacuee | Mean travel (min) | Worst travel (min) | % to flooded shelter | En-route flooded km / evacuee (secondary) |
|---|---:|---:|---:|---:|---:|---:|
| Nearest shelter | 33.6 ± 2.6 | 0.399 ± 0.089 | 3.63 ± 0.18 | 5.1 ± 0.3 | 15.20 ± 3.98 | 0.0000 ± 0.0000 |
| Avoid current floods | 32.8 ± 2.8 | 0.417 ± 0.095 | 6.05 ± 0.47 | 8.4 ± 0.6 | 3.92 ± 1.94 | 0.0206 ± 0.0198 |
| Avoid current floods, no warning caution [ablation] | 30.3 ± 2.9 | 0.405 ± 0.091 | 4.44 ± 0.34 | 6.2 ± 0.4 | 9.10 ± 3.04 | 0.0262 ± 0.0188 |
| Forecast-aware | 26.5 ± 2.8 | 0.386 ± 0.086 | 5.80 ± 0.43 | 7.9 ± 0.5 | 1.16 ± 0.94 | 0.0107 ± 0.0137 |
| Avoid current floods + greedy capacity | 0.0 ± 0.1 | 0.434 ± 0.095 | 7.77 ± 0.44 | 13.4 ± 0.8 | 4.53 ± 1.66 | 0.0451 ± 0.0270 |
| Forecast-aware + greedy capacity | 0.0 ± 0.1 | 0.409 ± 0.087 | 7.48 ± 0.44 | 12.5 ± 0.7 | 1.76 ± 1.09 | 0.0289 ± 0.0185 |
| Avoid current floods + optimal capacity | 0.0 ± 0.1 | 0.407 ± 0.088 | 7.39 ± 0.43 | 13.1 ± 0.8 | 4.25 ± 1.49 | 0.0325 ± 0.0162 |
| **Forecast-aware + optimal capacity (proposed)** | 0.0 ± 0.1 | 0.395 ± 0.085 | 7.12 ± 0.43 | 11.9 ± 0.7 | 1.55 ± 0.87 | 0.0228 ± 0.0168 |
| Perfect foresight + optimal capacity [upper bound] | 0.0 ± 0.1 | 0.352 ± 0.079 | 5.94 ± 0.31 | 10.7 ± 0.5 | 0.08 ± 0.16 | 0.0004 ± 0.0009 |

### receding, immediate

| Policy | % without bed | Flooded km / evacuee | Mean travel (min) | Worst travel (min) | % to flooded shelter | En-route flooded km / evacuee (secondary) |
|---|---:|---:|---:|---:|---:|---:|
| Nearest shelter | 30.9 ± 2.9 | 0.119 ± 0.055 | 3.31 ± 0.16 | 4.7 ± 0.3 | 4.46 ± 2.62 | 0.0000 ± 0.0000 |
| Avoid current floods | 32.6 ± 2.9 | 0.121 ± 0.054 | 5.68 ± 0.48 | 7.9 ± 0.6 | 0.00 ± 0.00 | 0.0016 ± 0.0031 |
| Avoid current floods, no warning caution [ablation] | 29.7 ± 2.9 | 0.120 ± 0.055 | 3.87 ± 0.31 | 5.5 ± 0.4 | 0.17 ± 0.33 | 0.0060 ± 0.0091 |
| Forecast-aware | 29.3 ± 2.9 | 0.121 ± 0.056 | 4.03 ± 0.33 | 5.8 ± 0.5 | 0.33 ± 0.46 | 0.0060 ± 0.0091 |
| Avoid current floods + greedy capacity | 0.0 ± 0.0 | 0.125 ± 0.055 | 7.09 ± 0.45 | 12.1 ± 0.8 | 0.02 ± 0.03 | 0.0044 ± 0.0060 |
| Forecast-aware + greedy capacity | 0.0 ± 0.0 | 0.121 ± 0.055 | 5.53 ± 0.34 | 9.7 ± 0.6 | 0.33 ± 0.46 | 0.0060 ± 0.0091 |
| Avoid current floods + optimal capacity | 0.0 ± 0.0 | 0.127 ± 0.055 | 6.73 ± 0.43 | 11.5 ± 0.7 | 0.26 ± 0.37 | 0.0073 ± 0.0089 |
| **Forecast-aware + optimal capacity (proposed)** | 0.0 ± 0.0 | 0.119 ± 0.055 | 5.31 ± 0.34 | 9.2 ± 0.5 | 0.33 ± 0.46 | 0.0060 ± 0.0091 |
| Perfect foresight + optimal capacity [upper bound] | 0.0 ± 0.0 | 0.108 ± 0.050 | 4.99 ± 0.29 | 8.8 ± 0.5 | 0.00 ± 0.00 | 0.0000 ± 0.0000 |

### receding, staggered

| Policy | % without bed | Flooded km / evacuee | Mean travel (min) | Worst travel (min) | % to flooded shelter | En-route flooded km / evacuee (secondary) |
|---|---:|---:|---:|---:|---:|---:|
| Nearest shelter | 30.9 ± 2.9 | 0.043 ± 0.024 | 3.31 ± 0.16 | 4.7 ± 0.3 | 1.99 ± 1.26 | 0.0000 ± 0.0000 |
| Avoid current floods | 32.6 ± 2.9 | 0.048 ± 0.028 | 5.68 ± 0.48 | 7.9 ± 0.6 | 0.54 ± 0.62 | 0.0016 ± 0.0031 |
| Avoid current floods, no warning caution [ablation] | 29.7 ± 2.9 | 0.046 ± 0.026 | 3.87 ± 0.31 | 5.5 ± 0.4 | 0.94 ± 0.90 | 0.0016 ± 0.0031 |
| Forecast-aware | 28.6 ± 2.9 | 0.047 ± 0.027 | 4.62 ± 0.40 | 6.7 ± 0.5 | 0.17 ± 0.33 | 0.0016 ± 0.0031 |
| Avoid current floods + greedy capacity | 0.0 ± 0.0 | 0.059 ± 0.031 | 7.09 ± 0.45 | 12.1 ± 0.8 | 0.60 ± 0.58 | 0.0119 ± 0.0125 |
| Forecast-aware + greedy capacity | 0.0 ± 0.0 | 0.047 ± 0.027 | 6.14 ± 0.41 | 10.6 ± 0.6 | 0.21 ± 0.34 | 0.0024 ± 0.0035 |
| Avoid current floods + optimal capacity | 0.0 ± 0.0 | 0.058 ± 0.031 | 6.73 ± 0.43 | 11.5 ± 0.7 | 0.67 ± 0.59 | 0.0112 ± 0.0120 |
| **Forecast-aware + optimal capacity (proposed)** | 0.0 ± 0.0 | 0.054 ± 0.030 | 5.88 ± 0.39 | 10.0 ± 0.6 | 0.35 ± 0.42 | 0.0069 ± 0.0084 |
| Perfect foresight + optimal capacity [upper bound] | 0.0 ± 0.0 | 0.039 ± 0.023 | 4.78 ± 0.23 | 8.7 ± 0.4 | 0.00 ± 0.00 | 0.0000 ± 0.0000 |

### surprise, immediate

| Policy | % without bed | Flooded km / evacuee | Mean travel (min) | Worst travel (min) | % to flooded shelter | En-route flooded km / evacuee (secondary) |
|---|---:|---:|---:|---:|---:|---:|
| Nearest shelter | 30.2 ± 2.8 | 0.088 ± 0.051 | 3.44 ± 0.16 | 4.9 ± 0.3 | 4.24 ± 2.74 | 0.0000 ± 0.0000 |
| Avoid current floods | 31.6 ± 2.9 | 0.086 ± 0.049 | 5.43 ± 0.45 | 7.6 ± 0.6 | 0.00 ± 0.00 | 0.0021 ± 0.0041 |
| Avoid current floods, no warning caution [ablation] | 29.1 ± 2.8 | 0.079 ± 0.046 | 3.79 ± 0.27 | 5.3 ± 0.4 | 0.00 ± 0.00 | 0.0021 ± 0.0041 |
| Forecast-aware | 29.5 ± 2.8 | 0.080 ± 0.046 | 3.89 ± 0.28 | 5.5 ± 0.4 | 0.17 ± 0.33 | 0.0021 ± 0.0041 |
| Avoid current floods + greedy capacity | 0.0 ± 0.0 | 0.091 ± 0.051 | 6.98 ± 0.43 | 12.6 ± 0.8 | 0.15 ± 0.22 | 0.0063 ± 0.0066 |
| Forecast-aware + greedy capacity | 0.0 ± 0.0 | 0.084 ± 0.048 | 5.64 ± 0.31 | 10.0 ± 0.5 | 0.22 ± 0.34 | 0.0026 ± 0.0042 |
| Avoid current floods + optimal capacity | 0.0 ± 0.0 | 0.088 ± 0.050 | 6.59 ± 0.43 | 12.0 ± 0.8 | 0.30 ± 0.36 | 0.0067 ± 0.0066 |
| **Forecast-aware + optimal capacity (proposed)** | 0.0 ± 0.0 | 0.080 ± 0.046 | 5.29 ± 0.29 | 9.6 ± 0.5 | 0.31 ± 0.43 | 0.0035 ± 0.0049 |
| Perfect foresight + optimal capacity [upper bound] | 0.0 ± 0.0 | 0.077 ± 0.044 | 5.10 ± 0.27 | 9.2 ± 0.4 | 0.00 ± 0.00 | 0.0000 ± 0.0000 |

### surprise, staggered

| Policy | % without bed | Flooded km / evacuee | Mean travel (min) | Worst travel (min) | % to flooded shelter | En-route flooded km / evacuee (secondary) |
|---|---:|---:|---:|---:|---:|---:|
| Nearest shelter | 30.2 ± 2.8 | 0.161 ± 0.058 | 3.44 ± 0.16 | 4.9 ± 0.3 | 7.80 ± 3.00 | 0.0000 ± 0.0000 |
| Avoid current floods | 31.6 ± 2.9 | 0.184 ± 0.065 | 5.43 ± 0.45 | 7.6 ± 0.6 | 3.49 ± 1.94 | 0.0156 ± 0.0149 |
| Avoid current floods, no warning caution [ablation] | 29.1 ± 2.8 | 0.170 ± 0.060 | 3.79 ± 0.27 | 5.3 ± 0.4 | 6.40 ± 2.64 | 0.0098 ± 0.0109 |
| Forecast-aware | 27.6 ± 2.9 | 0.171 ± 0.059 | 4.43 ± 0.34 | 6.4 ± 0.5 | 3.97 ± 1.89 | 0.0111 ± 0.0120 |
| Avoid current floods + greedy capacity | 0.0 ± 0.0 | 0.226 ± 0.069 | 6.98 ± 0.43 | 12.6 ± 0.8 | 4.91 ± 1.85 | 0.0510 ± 0.0219 |
| Forecast-aware + greedy capacity | 0.0 ± 0.0 | 0.217 ± 0.067 | 6.14 ± 0.36 | 10.6 ± 0.6 | 4.56 ± 1.70 | 0.0492 ± 0.0239 |
| Avoid current floods + optimal capacity | 0.0 ± 0.0 | 0.221 ± 0.065 | 6.59 ± 0.43 | 12.0 ± 0.8 | 5.21 ± 1.92 | 0.0609 ± 0.0262 |
| **Forecast-aware + optimal capacity (proposed)** | 0.0 ± 0.0 | 0.207 ± 0.066 | 5.80 ± 0.34 | 10.3 ± 0.6 | 4.29 ± 1.67 | 0.0498 ± 0.0261 |
| Perfect foresight + optimal capacity [upper bound] | 0.0 ± 0.0 | 0.148 ± 0.052 | 5.30 ± 0.27 | 9.7 ± 0.5 | 0.00 ± 0.00 | 0.0002 ± 0.0004 |

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
