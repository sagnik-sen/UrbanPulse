# Sensor + citizen-report fusion (fusion)

Simulation with modelled citizen behaviour. Report rates, trust histories, spam and hoax behaviour are assumptions, not measured.
Trust records are fixed for each run (not updated from outcomes). Values are mean ± 95% CI over seeds.
200 seeds × 10 settings × 3 methods. Methods see only the sensor reading (if online) and citizen reports.
Hoax bursts were injected in 186 of 200 hoax-setting seeds; the rest had no zone below WARNING at the burst tick and are excluded from the hoax table.

## Parameters

| Parameter | Value |
|---|---|
| DANGER | 70 |
| WARNING | 40 |
| PRIOR | 0.05 |
| SENSOR_SIGMA | 3 |
| SEVERITY_LLR | {"low":0.6,"medium":1.2,"high":2} |
| HALF_LIFE_TICKS | 15 |
| MAX_AGE_HALF_LIVES | 4 |
| NEW_DEVICE_PRIOR | {"a":1,"b":3} |
| NEW_DEVICE_CAP | 1.5 |
| REPORT_CAP | 4 |
| DECLARE_P | 0.5 |
| WARMUP_TICKS | 30 (not scored) |
| SCORED_TICKS | 240 (1 tick = 2 simulated minutes) |
| STORMS | 3 per run, amount U(40, 70) added to zone level, default storm decay |
| SENSOR_NOISE | N(0, 2); sensor offline for the whole run with probability dropout |
| CITIZEN_POOL | 100 genuine per zone: 60 established (a = 2..5, b = 3), 40 new |
| GENUINE_RATE | 0.3 per zone-tick at level >= DANGER, 0.05 at WARNING <= level < DANGER |
| SPAM | 20 devices per zone, trust record a = 1, b = 6; half of false reports |
| HOAX | 15 high reports from fresh ids in one zone below WARNING, scored over 5 ticks from the burst |

## Danger episodes per seed

| Setting | Episodes per seed (mean ± 95% CI) | Seeds with at least one episode |
|---|---:|---:|
| dropout 0 / false 0 | 4.25 ± 0.21 | 200 of 200 |
| dropout 0 / false 0.05 | 4.25 ± 0.21 | 200 of 200 |
| dropout 0 / false 0.2 | 4.25 ± 0.21 | 200 of 200 |
| dropout 0.5 / false 0 | 4.25 ± 0.21 | 200 of 200 |
| dropout 0.5 / false 0.05 | 4.25 ± 0.21 | 200 of 200 |
| dropout 0.5 / false 0.2 | 4.25 ± 0.21 | 200 of 200 |
| dropout 1 / false 0 | 4.25 ± 0.21 | 200 of 200 |
| dropout 1 / false 0.05 | 4.25 ± 0.21 | 200 of 200 |
| dropout 1 / false 0.2 | 4.25 ± 0.21 | 200 of 200 |
| dropout 0.5 / false 0.05 / hoax | 4.25 ± 0.21 | 200 of 200 |

## Recall: % of danger episodes declared at least once

| Setting | sensor only | reports only | fused |
|---|---:|---:|---:|
| dropout 0 / false 0 | 99.9 ± 0.2 | 28.3 ± 3.2 | 100.0 ± 0.0 |
| dropout 0 / false 0.05 | 99.9 ± 0.2 | 33.5 ± 3.4 | 100.0 ± 0.0 |
| dropout 0 / false 0.2 | 99.9 ± 0.2 | 44.9 ± 3.4 | 100.0 ± 0.0 |
| dropout 0.5 / false 0 | 48.0 ± 4.6 | 28.3 ± 3.2 | 61.9 ± 4.1 |
| dropout 0.5 / false 0.05 | 48.0 ± 4.6 | 33.5 ± 3.4 | 65.0 ± 4.0 |
| dropout 0.5 / false 0.2 | 48.0 ± 4.6 | 44.9 ± 3.4 | 72.1 ± 3.6 |
| dropout 1 / false 0 | 0.0 ± 0.0 | 28.3 ± 3.2 | 28.3 ± 3.2 |
| dropout 1 / false 0.05 | 0.0 ± 0.0 | 33.5 ± 3.4 | 33.5 ± 3.4 |
| dropout 1 / false 0.2 | 0.0 ± 0.0 | 44.9 ± 3.4 | 44.9 ± 3.4 |

## Detection delay (minutes from episode start to first declaration, detected episodes)

| Setting | sensor only | reports only | fused |
|---|---:|---:|---:|
| dropout 0 / false 0 | 0.0 ± 0.0 | 23.8 ± 2.2 | 0.0 ± 0.0 |
| dropout 0 / false 0.05 | 0.0 ± 0.0 | 21.4 ± 2.0 | 0.0 ± 0.0 |
| dropout 0 / false 0.2 | 0.0 ± 0.0 | 15.1 ± 1.5 | 0.0 ± 0.0 |
| dropout 0.5 / false 0 | 0.0 ± 0.0 | 23.8 ± 2.2 | 6.4 ± 1.4 |
| dropout 0.5 / false 0.05 | 0.0 ± 0.0 | 21.4 ± 2.0 | 6.5 ± 1.3 |
| dropout 0.5 / false 0.2 | 0.0 ± 0.0 | 15.1 ± 1.5 | 5.4 ± 1.0 |
| dropout 1 / false 0 | n/a | 23.8 ± 2.2 | 23.8 ± 2.2 |
| dropout 1 / false 0.05 | n/a | 21.4 ± 2.0 | 21.4 ± 2.0 |
| dropout 1 / false 0.2 | n/a | 15.1 ± 1.5 | 15.1 ± 1.5 |

## False alarms per zone-day (declared rising edges while level < WARNING)

| Setting | sensor only | reports only | fused |
|---|---:|---:|---:|
| dropout 0 / false 0 | 0.00 ± 0.00 | 0.00 ± 0.00 | 0.00 ± 0.00 |
| dropout 0 / false 0.05 | 0.00 ± 0.00 | 0.01 ± 0.01 | 0.00 ± 0.00 |
| dropout 0 / false 0.2 | 0.00 ± 0.00 | 0.01 ± 0.02 | 0.00 ± 0.00 |
| dropout 0.5 / false 0 | 0.00 ± 0.00 | 0.00 ± 0.00 | 0.00 ± 0.00 |
| dropout 0.5 / false 0.05 | 0.00 ± 0.00 | 0.01 ± 0.01 | 0.01 ± 0.01 |
| dropout 0.5 / false 0.2 | 0.00 ± 0.00 | 0.01 ± 0.02 | 0.01 ± 0.01 |
| dropout 1 / false 0 | 0.00 ± 0.00 | 0.00 ± 0.00 | 0.00 ± 0.00 |
| dropout 1 / false 0.05 | 0.00 ± 0.00 | 0.01 ± 0.01 | 0.01 ± 0.01 |
| dropout 1 / false 0.2 | 0.00 ± 0.00 | 0.01 ± 0.02 | 0.01 ± 0.02 |

## Hoax triggered: % of seeds where the hoax zone is declared within 5 ticks of the burst

| Setting | sensor only | reports only | fused |
|---|---:|---:|---:|
| dropout 0.5 / false 0.05 / hoax | 0.0 ± 0.0 | 0.0 ± 0.0 | 0.0 ± 0.0 |

