# Evacuation policy experiment (stress-decay-0.99)

200 seeds × 4 scenario types × 2 departure modes = 1600 scenario runs. Storm decay per tick: 0.99.
Routes: real OSRM road routes (offline set, `routes.json`). Water: shared simulator. Plans use only information available at t0;
scores use the levels that actually occurred when evacuees passed each point. Values: mean ± 95% CI. Lower is better for every metric.

## All scenarios

| Policy | % without bed | Flooded km / evacuee | Mean travel (min) | Worst travel (min) | % to flooded shelter | En-route flooded km / evacuee (secondary) |
|---|---:|---:|---:|---:|---:|---:|
| Nearest shelter | 32.0 ± 1.0 | 0.487 ± 0.035 | 3.50 ± 0.06 | 5.0 ± 0.1 | 22.38 ± 1.84 | 0.0000 ± 0.0000 |
| Avoid current floods | 30.6 ± 1.0 | 0.501 ± 0.036 | 6.53 ± 0.17 | 9.1 ± 0.2 | 2.49 ± 0.59 | 0.0139 ± 0.0059 |
| Avoid current floods, no warning caution [ablation] | 27.9 ± 1.0 | 0.479 ± 0.034 | 5.00 ± 0.14 | 7.0 ± 0.2 | 6.03 ± 0.99 | 0.0171 ± 0.0053 |
| Forecast-aware | 26.6 ± 1.0 | 0.472 ± 0.034 | 5.61 ± 0.15 | 7.9 ± 0.2 | 1.97 ± 0.49 | 0.0125 ± 0.0045 |
| Avoid current floods + greedy capacity | 0.0 ± 0.0 | 0.534 ± 0.037 | 8.10 ± 0.17 | 14.1 ± 0.3 | 3.39 ± 0.56 | 0.0369 ± 0.0081 |
| Forecast-aware + greedy capacity | 0.0 ± 0.0 | 0.509 ± 0.035 | 7.19 ± 0.15 | 12.1 ± 0.3 | 2.33 ± 0.44 | 0.0337 ± 0.0077 |
| Avoid current floods + optimal capacity | 0.0 ± 0.0 | 0.512 ± 0.035 | 7.74 ± 0.17 | 13.4 ± 0.3 | 3.63 ± 0.58 | 0.0351 ± 0.0081 |
| **Forecast-aware + optimal capacity (proposed)** | 0.0 ± 0.0 | 0.493 ± 0.034 | 6.88 ± 0.15 | 11.7 ± 0.2 | 2.51 ± 0.46 | 0.0313 ± 0.0074 |
| Perfect foresight + optimal capacity [upper bound] | 0.0 ± 0.0 | 0.455 ± 0.033 | 6.37 ± 0.14 | 11.1 ± 0.2 | 0.12 ± 0.09 | 0.0009 ± 0.0005 |

Paired differences (A − B) over identical scenarios, mean ± 95% CI; `w/l` = scenarios where A is better / worse (lower is better for every metric).

| A vs B | % without bed | Flooded km / evacuee | Mean travel (min) | Worst travel (min) | % to flooded shelter | En-route flooded km / evacuee (secondary) |
|---|---:|---:|---:|---:|---:|---:|
| Forecast vs current-flood avoidance (both independent) | -4.0 ± 0.6 (415/144) | -0.029 ± 0.007 (236/40) | -0.93 ± 0.12 (488/164) | -1.2 ± 0.2 (448/139) | -0.52 ± 0.48 (40/29) | -0.0014 ± 0.0049 (19/20) |
| Ablation: current-flood avoidance without vs with warning caution | -2.6 ± 0.6 (386/192) | -0.022 ± 0.008 (234/69) | -1.53 ± 0.13 (588/98) | -2.1 ± 0.2 (560/84) | 3.54 ± 0.80 (7/108) | 0.0032 ± 0.0060 (10/26) |
| Forecast vs current-flood avoidance without warning caution | -1.4 ± 0.5 (155/84) | -0.007 ± 0.005 (91/75) | 0.61 ± 0.09 (31/282) | 0.9 ± 0.1 (24/270) | -4.06 ± 0.86 (112/8) | -0.0046 ± 0.0048 (32/18) |
| Optimal vs greedy assignment (current-flood costs) | 0.0 ± 0.0 (0/0) | -0.023 ± 0.006 (285/105) | -0.36 ± 0.05 (992/114) | -0.6 ± 0.2 (512/278) | 0.24 ± 0.18 (48/65) | -0.0018 ± 0.0044 (78/60) |
| Optimal vs greedy assignment (forecast costs) | 0.0 ± 0.0 (0/0) | -0.015 ± 0.005 (207/79) | -0.32 ± 0.03 (975/93) | -0.5 ± 0.1 (497/253) | 0.18 ± 0.17 (38/47) | -0.0024 ± 0.0036 (63/32) |
| Forecast vs current-flood costs (both optimal assignment) | 0.0 ± 0.0 (0/0) | -0.018 ± 0.008 (275/118) | -0.86 ± 0.11 (716/217) | -1.8 ± 0.2 (653/152) | -1.12 ± 0.46 (102/45) | -0.0038 ± 0.0070 (69/43) |
| Proposed vs perfect foresight (gap to upper bound) | 0.0 ± 0.0 (0/0) | 0.038 ± 0.008 (48/275) | 0.51 ± 0.09 (166/495) | 0.5 ± 0.2 (159/389) | 2.39 ± 0.44 (0/154) | 0.0304 ± 0.0074 (8/110) |

## Departures: immediate

| Policy | % without bed | Flooded km / evacuee | Mean travel (min) | Worst travel (min) | % to flooded shelter | En-route flooded km / evacuee (secondary) |
|---|---:|---:|---:|---:|---:|---:|
| Nearest shelter | 32.0 ± 1.4 | 0.486 ± 0.051 | 3.50 ± 0.09 | 5.0 ± 0.1 | 22.01 ± 2.69 | 0.0000 ± 0.0000 |
| Avoid current floods | 30.6 ± 1.5 | 0.483 ± 0.051 | 6.53 ± 0.24 | 9.1 ± 0.3 | 0.61 ± 0.42 | 0.0037 ± 0.0027 |
| Avoid current floods, no warning caution [ablation] | 27.9 ± 1.4 | 0.465 ± 0.049 | 5.00 ± 0.20 | 7.0 ± 0.3 | 2.41 ± 0.93 | 0.0082 ± 0.0046 |
| Forecast-aware | 26.9 ± 1.4 | 0.458 ± 0.049 | 5.34 ± 0.21 | 7.5 ± 0.3 | 0.46 ± 0.35 | 0.0058 ± 0.0042 |
| Avoid current floods + greedy capacity | 0.0 ± 0.0 | 0.504 ± 0.053 | 8.10 ± 0.24 | 14.1 ± 0.4 | 1.22 ± 0.47 | 0.0156 ± 0.0061 |
| Forecast-aware + greedy capacity | 0.0 ± 0.0 | 0.480 ± 0.051 | 6.92 ± 0.21 | 11.8 ± 0.4 | 0.81 ± 0.40 | 0.0141 ± 0.0071 |
| Avoid current floods + optimal capacity | 0.0 ± 0.0 | 0.481 ± 0.050 | 7.74 ± 0.24 | 13.4 ± 0.4 | 1.23 ± 0.48 | 0.0099 ± 0.0055 |
| **Forecast-aware + optimal capacity (proposed)** | 0.0 ± 0.0 | 0.467 ± 0.049 | 6.61 ± 0.21 | 11.3 ± 0.3 | 0.88 ± 0.41 | 0.0117 ± 0.0066 |
| Perfect foresight + optimal capacity [upper bound] | 0.0 ± 0.0 | 0.450 ± 0.048 | 6.36 ± 0.20 | 11.0 ± 0.3 | 0.13 ± 0.13 | 0.0005 ± 0.0005 |

Paired differences (A − B) over identical scenarios, mean ± 95% CI; `w/l` = scenarios where A is better / worse (lower is better for every metric).

| A vs B | % without bed | Flooded km / evacuee | Mean travel (min) | Worst travel (min) | % to flooded shelter | En-route flooded km / evacuee (secondary) |
|---|---:|---:|---:|---:|---:|---:|
| Forecast vs current-flood avoidance (both independent) | -3.7 ± 0.9 (208/80) | -0.025 ± 0.007 (110/13) | -1.20 ± 0.17 (268/67) | -1.6 ± 0.3 (248/60) | -0.15 ± 0.47 (9/9) | 0.0021 ± 0.0039 (3/6) |
| Ablation: current-flood avoidance without vs with warning caution | -2.6 ± 0.9 (193/96) | -0.017 ± 0.007 (102/24) | -1.53 ± 0.18 (294/49) | -2.1 ± 0.3 (280/42) | 1.80 ± 0.79 (0/25) | 0.0045 ± 0.0033 (0/8) |
| Forecast vs current-flood avoidance without warning caution | -1.1 ± 0.5 (50/29) | -0.007 ± 0.005 (31/16) | 0.34 ± 0.09 (11/91) | 0.5 ± 0.1 (9/85) | -1.95 ± 0.86 (28/3) | -0.0024 ± 0.0035 (9/3) |
| Optimal vs greedy assignment (current-flood costs) | 0.0 ± 0.0 (0/0) | -0.023 ± 0.007 (118/30) | -0.36 ± 0.07 (496/57) | -0.6 ± 0.2 (256/139) | 0.01 ± 0.12 (11/9) | -0.0057 ± 0.0044 (29/10) |
| Optimal vs greedy assignment (forecast costs) | 0.0 ± 0.0 (0/0) | -0.013 ± 0.005 (81/21) | -0.31 ± 0.05 (498/44) | -0.5 ± 0.1 (259/126) | 0.07 ± 0.09 (5/8) | -0.0024 ± 0.0025 (20/3) |
| Forecast vs current-flood costs (both optimal assignment) | 0.0 ± 0.0 (0/0) | -0.014 ± 0.009 (126/37) | -1.13 ± 0.14 (396/73) | -2.2 ± 0.3 (361/53) | -0.36 ± 0.44 (24/13) | 0.0018 ± 0.0075 (16/12) |
| Proposed vs perfect foresight (gap to upper bound) | 0.0 ± 0.0 (0/0) | 0.016 ± 0.007 (12/73) | 0.24 ± 0.08 (41/163) | 0.3 ± 0.1 (46/126) | 0.75 ± 0.37 (0/26) | 0.0112 ± 0.0065 (4/19) |

## Departures: staggered

| Policy | % without bed | Flooded km / evacuee | Mean travel (min) | Worst travel (min) | % to flooded shelter | En-route flooded km / evacuee (secondary) |
|---|---:|---:|---:|---:|---:|---:|
| Nearest shelter | 32.0 ± 1.4 | 0.488 ± 0.047 | 3.50 ± 0.09 | 5.0 ± 0.1 | 22.75 ± 2.53 | 0.0000 ± 0.0000 |
| Avoid current floods | 30.6 ± 1.5 | 0.520 ± 0.051 | 6.53 ± 0.24 | 9.1 ± 0.3 | 4.38 ± 1.09 | 0.0241 ± 0.0115 |
| Avoid current floods, no warning caution [ablation] | 27.9 ± 1.4 | 0.494 ± 0.048 | 5.00 ± 0.20 | 7.0 ± 0.3 | 9.64 ± 1.71 | 0.0260 ± 0.0096 |
| Forecast-aware | 26.2 ± 1.4 | 0.487 ± 0.047 | 5.88 ± 0.22 | 8.3 ± 0.3 | 3.48 ± 0.90 | 0.0191 ± 0.0079 |
| Avoid current floods + greedy capacity | 0.0 ± 0.0 | 0.564 ± 0.052 | 8.10 ± 0.24 | 14.1 ± 0.4 | 5.56 ± 1.00 | 0.0581 ± 0.0148 |
| Forecast-aware + greedy capacity | 0.0 ± 0.0 | 0.537 ± 0.049 | 7.47 ± 0.22 | 12.5 ± 0.4 | 3.85 ± 0.78 | 0.0534 ± 0.0136 |
| Avoid current floods + optimal capacity | 0.0 ± 0.0 | 0.542 ± 0.050 | 7.74 ± 0.24 | 13.4 ± 0.4 | 6.02 ± 1.03 | 0.0603 ± 0.0150 |
| **Forecast-aware + optimal capacity (proposed)** | 0.0 ± 0.0 | 0.520 ± 0.048 | 7.15 ± 0.22 | 12.0 ± 0.4 | 4.15 ± 0.80 | 0.0510 ± 0.0132 |
| Perfect foresight + optimal capacity [upper bound] | 0.0 ± 0.0 | 0.460 ± 0.045 | 6.38 ± 0.19 | 11.3 ± 0.3 | 0.12 ± 0.12 | 0.0014 ± 0.0009 |

Paired differences (A − B) over identical scenarios, mean ± 95% CI; `w/l` = scenarios where A is better / worse (lower is better for every metric).

| A vs B | % without bed | Flooded km / evacuee | Mean travel (min) | Worst travel (min) | % to flooded shelter | En-route flooded km / evacuee (secondary) |
|---|---:|---:|---:|---:|---:|---:|
| Forecast vs current-flood avoidance (both independent) | -4.3 ± 0.9 (207/64) | -0.033 ± 0.011 (126/27) | -0.66 ± 0.16 (220/97) | -0.8 ± 0.2 (200/79) | -0.90 ± 0.82 (31/20) | -0.0049 ± 0.0089 (16/14) |
| Ablation: current-flood avoidance without vs with warning caution | -2.6 ± 0.9 (193/96) | -0.026 ± 0.014 (132/45) | -1.53 ± 0.18 (294/49) | -2.1 ± 0.3 (280/42) | 5.27 ± 1.37 (7/83) | 0.0019 ± 0.0116 (10/18) |
| Forecast vs current-flood avoidance without warning caution | -1.7 ± 0.7 (105/55) | -0.007 ± 0.009 (60/59) | 0.88 ± 0.14 (20/191) | 1.3 ± 0.2 (15/185) | -6.17 ± 1.48 (84/5) | -0.0069 ± 0.0089 (23/15) |
| Optimal vs greedy assignment (current-flood costs) | 0.0 ± 0.0 (0/0) | -0.022 ± 0.010 (167/75) | -0.36 ± 0.07 (496/57) | -0.6 ± 0.2 (256/139) | 0.46 ± 0.33 (37/56) | 0.0022 ± 0.0076 (49/50) |
| Optimal vs greedy assignment (forecast costs) | 0.0 ± 0.0 (0/0) | -0.017 ± 0.009 (126/58) | -0.32 ± 0.05 (477/49) | -0.5 ± 0.2 (238/127) | 0.30 ± 0.32 (33/39) | -0.0024 ± 0.0067 (43/29) |
| Forecast vs current-flood costs (both optimal assignment) | 0.0 ± 0.0 (0/0) | -0.022 ± 0.013 (149/81) | -0.59 ± 0.15 (320/144) | -1.4 ± 0.3 (292/99) | -1.87 ± 0.80 (78/32) | -0.0093 ± 0.0118 (53/31) |
| Proposed vs perfect foresight (gap to upper bound) | 0.0 ± 0.0 (0/0) | 0.060 ± 0.014 (36/202) | 0.78 ± 0.17 (125/332) | 0.8 ± 0.3 (113/263) | 4.03 ± 0.78 (0/128) | 0.0496 ± 0.0131 (4/91) |

## Appendix: by scenario type and departure mode

### rising, immediate

| Policy | % without bed | Flooded km / evacuee | Mean travel (min) | Worst travel (min) | % to flooded shelter | En-route flooded km / evacuee (secondary) |
|---|---:|---:|---:|---:|---:|---:|
| Nearest shelter | 33.0 ± 2.6 | 0.432 ± 0.095 | 3.61 ± 0.18 | 5.1 ± 0.3 | 20.46 ± 5.05 | 0.0000 ± 0.0000 |
| Avoid current floods | 30.8 ± 2.8 | 0.431 ± 0.096 | 6.52 ± 0.48 | 9.0 ± 0.6 | 2.01 ± 1.53 | 0.0109 ± 0.0096 |
| Avoid current floods, no warning caution [ablation] | 29.1 ± 2.7 | 0.430 ± 0.094 | 4.56 ± 0.35 | 6.5 ± 0.5 | 8.80 ± 3.41 | 0.0228 ± 0.0154 |
| Forecast-aware | 26.2 ± 2.8 | 0.399 ± 0.091 | 5.26 ± 0.40 | 7.5 ± 0.6 | 1.00 ± 0.92 | 0.0153 ± 0.0138 |
| Avoid current floods + greedy capacity | 0.0 ± 0.1 | 0.436 ± 0.097 | 8.02 ± 0.44 | 13.8 ± 0.8 | 3.34 ± 1.59 | 0.0265 ± 0.0167 |
| Forecast-aware + greedy capacity | 0.0 ± 0.1 | 0.410 ± 0.092 | 6.69 ± 0.38 | 11.3 ± 0.6 | 1.18 ± 0.90 | 0.0249 ± 0.0192 |
| Avoid current floods + optimal capacity | 0.0 ± 0.1 | 0.411 ± 0.093 | 7.70 ± 0.44 | 13.3 ± 0.7 | 3.12 ± 1.60 | 0.0127 ± 0.0094 |
| **Forecast-aware + optimal capacity (proposed)** | 0.0 ± 0.1 | 0.397 ± 0.089 | 6.40 ± 0.37 | 10.9 ± 0.6 | 1.20 ± 0.94 | 0.0184 ± 0.0156 |
| Perfect foresight + optimal capacity [upper bound] | 0.0 ± 0.1 | 0.373 ± 0.087 | 6.22 ± 0.36 | 10.8 ± 0.6 | 0.19 ± 0.38 | 0.0014 ± 0.0020 |

### rising, staggered

| Policy | % without bed | Flooded km / evacuee | Mean travel (min) | Worst travel (min) | % to flooded shelter | En-route flooded km / evacuee (secondary) |
|---|---:|---:|---:|---:|---:|---:|
| Nearest shelter | 33.0 ± 2.6 | 0.746 ± 0.107 | 3.61 ± 0.18 | 5.1 ± 0.3 | 34.71 ± 5.81 | 0.0000 ± 0.0000 |
| Avoid current floods | 30.8 ± 2.8 | 0.785 ± 0.114 | 6.52 ± 0.48 | 9.0 ± 0.6 | 8.23 ± 2.95 | 0.0188 ± 0.0149 |
| Avoid current floods, no warning caution [ablation] | 29.1 ± 2.7 | 0.763 ± 0.110 | 4.56 ± 0.35 | 6.5 ± 0.5 | 24.45 ± 5.19 | 0.0417 ± 0.0238 |
| Forecast-aware | 25.5 ± 2.8 | 0.736 ± 0.106 | 6.35 ± 0.45 | 8.8 ± 0.6 | 4.39 ± 2.09 | 0.0183 ± 0.0153 |
| Avoid current floods + greedy capacity | 0.0 ± 0.1 | 0.851 ± 0.115 | 8.02 ± 0.44 | 13.8 ± 0.8 | 11.00 ± 2.70 | 0.0807 ± 0.0324 |
| Forecast-aware + greedy capacity | 0.0 ± 0.1 | 0.808 ± 0.108 | 7.95 ± 0.45 | 13.1 ± 0.8 | 5.09 ± 1.73 | 0.0718 ± 0.0278 |
| Avoid current floods + optimal capacity | 0.0 ± 0.1 | 0.810 ± 0.109 | 7.70 ± 0.44 | 13.3 ± 0.7 | 10.99 ± 2.65 | 0.0748 ± 0.0309 |
| **Forecast-aware + optimal capacity (proposed)** | 0.0 ± 0.1 | 0.784 ± 0.106 | 7.58 ± 0.43 | 12.5 ± 0.7 | 5.03 ± 1.67 | 0.0641 ± 0.0278 |
| Perfect foresight + optimal capacity [upper bound] | 0.0 ± 0.1 | 0.703 ± 0.101 | 7.26 ± 0.40 | 12.6 ± 0.7 | 0.29 ± 0.43 | 0.0010 ± 0.0012 |

### receding, immediate

| Policy | % without bed | Flooded km / evacuee | Mean travel (min) | Worst travel (min) | % to flooded shelter | En-route flooded km / evacuee (secondary) |
|---|---:|---:|---:|---:|---:|---:|
| Nearest shelter | 33.2 ± 2.9 | 1.373 ± 0.084 | 3.56 ± 0.18 | 5.1 ± 0.3 | 61.36 ± 5.97 | 0.0000 ± 0.0000 |
| Avoid current floods | 26.5 ± 3.2 | 1.364 ± 0.083 | 9.01 ± 0.39 | 12.6 ± 0.7 | 0.09 ± 0.17 | 0.0019 ± 0.0026 |
| Avoid current floods, no warning caution [ablation] | 22.3 ± 2.9 | 1.306 ± 0.079 | 8.15 ± 0.35 | 11.1 ± 0.5 | 0.35 ± 0.41 | 0.0079 ± 0.0089 |
| Forecast-aware | 21.0 ± 2.8 | 1.307 ± 0.079 | 8.53 ± 0.36 | 11.7 ± 0.6 | 0.18 ± 0.25 | 0.0060 ± 0.0084 |
| Avoid current floods + greedy capacity | 0.0 ± 0.0 | 1.424 ± 0.087 | 10.79 ± 0.45 | 17.8 ± 1.0 | 0.86 ± 0.61 | 0.0124 ± 0.0085 |
| Forecast-aware + greedy capacity | 0.0 ± 0.0 | 1.369 ± 0.084 | 9.93 ± 0.39 | 15.8 ± 0.9 | 1.08 ± 0.72 | 0.0162 ± 0.0132 |
| Avoid current floods + optimal capacity | 0.0 ± 0.0 | 1.357 ± 0.082 | 10.43 ± 0.44 | 16.9 ± 0.9 | 0.97 ± 0.64 | 0.0016 ± 0.0022 |
| **Forecast-aware + optimal capacity (proposed)** | 0.0 ± 0.0 | 1.329 ± 0.081 | 9.68 ± 0.37 | 15.1 ± 0.8 | 1.21 ± 0.75 | 0.0098 ± 0.0115 |
| Perfect foresight + optimal capacity [upper bound] | 0.0 ± 0.0 | 1.309 ± 0.080 | 9.23 ± 0.39 | 14.6 ± 0.8 | 0.33 ± 0.34 | 0.0006 ± 0.0007 |

### receding, staggered

| Policy | % without bed | Flooded km / evacuee | Mean travel (min) | Worst travel (min) | % to flooded shelter | En-route flooded km / evacuee (secondary) |
|---|---:|---:|---:|---:|---:|---:|
| Nearest shelter | 33.2 ± 2.9 | 0.955 ± 0.093 | 3.56 ± 0.18 | 5.1 ± 0.3 | 43.71 ± 5.76 | 0.0000 ± 0.0000 |
| Avoid current floods | 26.5 ± 3.2 | 0.978 ± 0.099 | 9.01 ± 0.39 | 12.6 ± 0.7 | 1.03 ± 0.81 | 0.0254 ± 0.0180 |
| Avoid current floods, no warning caution [ablation] | 22.3 ± 2.9 | 0.941 ± 0.095 | 8.15 ± 0.35 | 11.1 ± 0.5 | 2.78 ± 1.49 | 0.0410 ± 0.0236 |
| Forecast-aware | 22.1 ± 2.9 | 0.934 ± 0.094 | 8.70 ± 0.37 | 11.9 ± 0.6 | 0.95 ± 0.84 | 0.0264 ± 0.0193 |
| Avoid current floods + greedy capacity | 0.0 ± 0.0 | 1.004 ± 0.101 | 10.79 ± 0.45 | 17.8 ± 1.0 | 1.19 ± 0.73 | 0.0250 ± 0.0158 |
| Forecast-aware + greedy capacity | 0.0 ± 0.0 | 0.961 ± 0.096 | 10.09 ± 0.39 | 15.9 ± 0.9 | 1.13 ± 0.76 | 0.0215 ± 0.0156 |
| Avoid current floods + optimal capacity | 0.0 ± 0.0 | 0.965 ± 0.098 | 10.43 ± 0.44 | 16.9 ± 0.9 | 1.65 ± 0.88 | 0.0226 ± 0.0156 |
| **Forecast-aware + optimal capacity (proposed)** | 0.0 ± 0.0 | 0.937 ± 0.094 | 9.83 ± 0.37 | 15.2 ± 0.8 | 1.27 ± 0.80 | 0.0216 ± 0.0156 |
| Perfect foresight + optimal capacity [upper bound] | 0.0 ± 0.0 | 0.905 ± 0.092 | 7.76 ± 0.40 | 13.0 ± 0.7 | 0.11 ± 0.15 | 0.0035 ± 0.0030 |

### surprise, immediate

| Policy | % without bed | Flooded km / evacuee | Mean travel (min) | Worst travel (min) | % to flooded shelter | En-route flooded km / evacuee (secondary) |
|---|---:|---:|---:|---:|---:|---:|
| Nearest shelter | 30.2 ± 2.8 | 0.088 ± 0.051 | 3.44 ± 0.16 | 4.9 ± 0.3 | 4.24 ± 2.74 | 0.0000 ± 0.0000 |
| Avoid current floods | 31.6 ± 2.9 | 0.086 ± 0.049 | 5.43 ± 0.45 | 7.6 ± 0.6 | 0.00 ± 0.00 | 0.0021 ± 0.0041 |
| Avoid current floods, no warning caution [ablation] | 29.1 ± 2.8 | 0.079 ± 0.046 | 3.79 ± 0.27 | 5.3 ± 0.4 | 0.00 ± 0.00 | 0.0021 ± 0.0041 |
| Forecast-aware | 29.5 ± 2.8 | 0.080 ± 0.046 | 3.89 ± 0.28 | 5.5 ± 0.4 | 0.17 ± 0.33 | 0.0021 ± 0.0041 |
| Avoid current floods + greedy capacity | 0.0 ± 0.0 | 0.092 ± 0.051 | 6.98 ± 0.43 | 12.6 ± 0.8 | 0.21 ± 0.24 | 0.0077 ± 0.0070 |
| Forecast-aware + greedy capacity | 0.0 ± 0.0 | 0.085 ± 0.048 | 5.64 ± 0.31 | 10.0 ± 0.5 | 0.27 ± 0.35 | 0.0038 ± 0.0048 |
| Avoid current floods + optimal capacity | 0.0 ± 0.0 | 0.091 ± 0.050 | 6.59 ± 0.43 | 12.0 ± 0.8 | 0.30 ± 0.36 | 0.0095 ± 0.0088 |
| **Forecast-aware + optimal capacity (proposed)** | 0.0 ± 0.0 | 0.082 ± 0.046 | 5.29 ± 0.29 | 9.6 ± 0.5 | 0.31 ± 0.43 | 0.0051 ± 0.0071 |
| Perfect foresight + optimal capacity [upper bound] | 0.0 ± 0.0 | 0.077 ± 0.044 | 5.10 ± 0.27 | 9.2 ± 0.4 | 0.00 ± 0.00 | 0.0000 ± 0.0000 |

### surprise, staggered

| Policy | % without bed | Flooded km / evacuee | Mean travel (min) | Worst travel (min) | % to flooded shelter | En-route flooded km / evacuee (secondary) |
|---|---:|---:|---:|---:|---:|---:|
| Nearest shelter | 30.2 ± 2.8 | 0.214 ± 0.063 | 3.44 ± 0.16 | 4.9 ± 0.3 | 11.53 ± 3.47 | 0.0000 ± 0.0000 |
| Avoid current floods | 31.6 ± 2.9 | 0.280 ± 0.083 | 5.43 ± 0.45 | 7.6 ± 0.6 | 8.08 ± 2.90 | 0.0520 ± 0.0394 |
| Avoid current floods, no warning caution [ablation] | 29.1 ± 2.8 | 0.235 ± 0.067 | 3.79 ± 0.27 | 5.3 ± 0.4 | 10.96 ± 3.26 | 0.0213 ± 0.0180 |
| Forecast-aware | 27.6 ± 2.9 | 0.244 ± 0.066 | 4.43 ± 0.34 | 6.4 ± 0.5 | 8.32 ± 2.67 | 0.0319 ± 0.0199 |
| Avoid current floods + greedy capacity | 0.0 ± 0.0 | 0.357 ± 0.090 | 6.98 ± 0.43 | 12.6 ± 0.8 | 9.52 ± 2.49 | 0.1194 ± 0.0448 |
| Forecast-aware + greedy capacity | 0.0 ± 0.0 | 0.344 ± 0.082 | 6.14 ± 0.36 | 10.6 ± 0.6 | 8.84 ± 2.26 | 0.1181 ± 0.0424 |
| Avoid current floods + optimal capacity | 0.0 ± 0.0 | 0.344 ± 0.085 | 6.59 ± 0.43 | 12.0 ± 0.8 | 10.83 ± 2.66 | 0.1302 ± 0.0455 |
| **Forecast-aware + optimal capacity (proposed)** | 0.0 ± 0.0 | 0.320 ± 0.077 | 5.80 ± 0.34 | 10.3 ± 0.6 | 9.74 ± 2.33 | 0.1130 ± 0.0401 |
| Perfect foresight + optimal capacity [upper bound] | 0.0 ± 0.0 | 0.201 ± 0.058 | 5.64 ± 0.32 | 10.3 ± 0.6 | 0.06 ± 0.12 | 0.0009 ± 0.0018 |

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
