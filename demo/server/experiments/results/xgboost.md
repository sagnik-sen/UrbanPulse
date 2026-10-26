# Heavy-rain risk model (XGBoost)

Predicts the probability that the next 24 hours bring at least 64.5 mm of rain (IMD "heavy rain") in an ERA5 cell, from the weather up to now.
Data: Open-Meteo Historical Weather API, ERA5 reanalysis (models=era5), CC BY 4.0 (https://open-meteo.com/), hourly 2000–2024, the 3 × 3 block of 0.25° cells around Chennai. All six demo zones are in the Chennai cell (13.0 N, 80.25 E).
Script: `demo/ml/train.py` (design pre-declared in its header). xgboost 3.4.1. Runtime 51 s.

## Labels and splits

The label is ERA5 rain over the next 24 hours ≥ 64.5 mm, not IMD-observed rain; ERA5 smooths peaks and understates station totals. Rows are hourly issue times. An episode is a run of consecutive positive hours.

| Split | Rows (hours) | Positive hours | Episodes |
|---|---:|---:|---:|
| train (9 cells) | 1,340,721 | 4,032 | 191 |
| validation (9 cells) | 236,520 | 427 | 23 |
| validation (Chennai cell) | 26,280 | 58 | 3 |
| test (Chennai cell) | 43,824 | 266 | 9 |
| test (9 cells) | 394,416 | 2,217 | 88 |

Train 2000–2016, validation 2017–2019, test 2020–2024. Events before 2020, including the 2015 floods, are training or validation data and are not evidence for the model.

## Model selection (validation)

| max_depth | Trees (early stopping) | Validation average precision |
|---:|---:|---:|
| 2 | 319 | 0.2368 |
| 3 | 171 | 0.2458 |
| 4 | 98 | 0.1898 |

Chosen: max_depth 3, 171 trees. Alert threshold 0.081 (best F1 on validation).

## Test results, Chennai cell (2020–2024)

ROC-AUC, PR-AUC and Brier with 95% bootstrap intervals over days. Thresholds were fixed on validation. Episode hit: at least one hour of the episode at or above the threshold. False-alarm runs: runs of alert hours that overlap no positive hour.

| Model | ROC-AUC | PR-AUC | Brier | Precision | Recall (hours) | Episodes hit | False-alarm runs / year |
|---|---:|---:|---:|---:|---:|---:|---:|
| Climatology (month) | 0.895 (0.858–0.931) | 0.034 (0.016–0.057) | 0.006 (0.003–0.009) | 0.041 | 0.560 | 6 of 9 | 0.2 |
| Persistence (last 24 h heavy) | 0.614 (0.529–0.722) | 0.059 (0.008–0.170) | 0.006 (0.003–0.009) | 0.233 | 0.233 | 5 of 9 | 0.8 |
| Logistic regression | 0.993 (0.988–0.996) | 0.418 (0.276–0.568) | 0.005 (0.003–0.007) | 0.379 | 0.744 | 9 of 9 | 9.0 |
| XGBoost (proposed) | 0.989 (0.981–0.995) | 0.312 (0.186–0.458) | 0.005 (0.003–0.008) | 0.315 | 0.635 | 9 of 9 | 14.6 |

## Test results, all nine cells (secondary)

| Model | ROC-AUC | PR-AUC | Brier | Precision | Recall (hours) | Episodes hit | False-alarm runs / year (per cell) |
|---|---:|---:|---:|---:|---:|---:|---:|
| Climatology (month) | 0.891 | 0.031 | 0.0055 | 0.038 | 0.550 | 53 of 88 | 0.2 |
| Persistence (last 24 h heavy) | 0.594 | 0.041 | 0.0054 | 0.192 | 0.192 | 45 of 88 | 1.0 |
| Logistic regression | 0.991 | 0.384 | 0.0045 | 0.355 | 0.705 | 80 of 88 | 8.8 |
| XGBoost (proposed) | 0.989 | 0.285 | 0.0048 | 0.296 | 0.599 | 77 of 88 | 14.0 |

## Test episodes, Chennai cell

Start is the first issue hour whose next 24 hours reach 64.5 mm. Lead: hours from the first XGBoost alert (searched from 48 h before the start) to the start; negative means before. Episodes are found from the labels, not named from memory.

| Start (IST) | Hours | Max 24 h ERA5 rain (mm) | Max XGBoost probability | First alert vs start (h) |
|---|---:|---:|---:|---:|
| 2020-11-24T14:00 | 20 | 87.5 | 0.87 | -17 |
| 2020-12-03T10:00 | 22 | 84.3 | 0.53 | -27 |
| 2021-11-09T21:00 | 30 | 155.5 | 0.59 | +5 |
| 2021-11-17T09:00 | 19 | 85.5 | 0.50 | +10 |
| 2022-10-31T00:00 | 51 | 98.9 | 0.72 | -1 |
| 2022-11-20T17:00 | 23 | 112.4 | 0.46 | +3 |
| 2022-12-08T13:00 | 28 | 131.1 | 0.40 | -4 |
| 2023-12-03T02:00 | 43 | 208.4 | 0.40 | -20 |
| 2024-11-29T04:00 | 30 | 151.8 | 0.20 | -41 |

## Feature importance (gain)

| Feature | Gain |
|---|---:|
| rain_6h | 2045.8 |
| cloud_mean_6h | 792.0 |
| rain_1h | 664.2 |
| pressure_change_24h | 544.6 |
| cloud | 352.2 |
| wind_v | 278.5 |
| rain_48h | 219.7 |
| rain_max_24h | 164.8 |
| rain_3h | 139.9 |
| doy_cos | 135.3 |

## Limits

- The label is ERA5 rain, which understates local extremes; it is not a measure of flooding.
- In the live app the features come from the Open-Meteo forecast API's past hours (a model analysis), not ERA5, so live inputs differ somewhat from training inputs.
- No comparison with a numerical weather forecast was made (see the script header). The app's existing IMD alerts use the Open-Meteo 24 h forecast; this model is shown alongside them as advisory and does not trigger alerts.
- All nine training cells are within about 40 km of each other, so they are not independent samples.
