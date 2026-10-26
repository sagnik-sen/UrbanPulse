# UrbanPulse paper figures

Each figure is drawn from the experiment outputs in `demo/server/experiments/results` (and rainfall
data in `demo/server/experiments/data`). Nothing is typed in by hand. The script also cross-checks its
numbers against the committed markdown tables and stops if they differ.

## Setup and run

From the repository root (Python 3.9+):

```
python3 -m venv demo/figures/.venv
demo/figures/.venv/bin/pip install -r demo/figures/requirements.txt
```

Regenerate the experiment CSVs first, from `demo/server`:

```
node experiments/run.js --seeds 200
node experiments/fusion.js --seeds 200
node experiments/tamper.js --seeds 200
node experiments/replay.js
node experiments/scale.js
node experiments/rescue.js
node experiments/relief.js
node experiments/priority.js --bed-scale 0.25 --out priority-stress
```

and the heavy-rain model from the repository root (see `demo/README.md` for the one-time ERA5 download):

```
demo/ml/.venv/bin/python demo/ml/train.py
```

Then build the figures from the repository root:

```
demo/figures/.venv/bin/python demo/figures/make_figures.py
```

This writes 20 files to `demo/figures/out/`: each figure as PDF and as 300-dpi PNG.
The `.venv` directory is git-ignored.

## Figures

| File | What it shows | Source |
|---|---|---|
| `fig_evacuation` | Evacuation policies (double column): % of evacuees without a bed, % sent to a flooded shelter, mean travel time, mean ± 95% CI over all scenario runs. The proposed policy is in bold. | `run.js` → `results/results.csv` |
| `fig_fusion` | Danger-episode recall vs sensor dropout at false-report rate 0, for sensor only, citizen reports only and fused, mean ± 95% CI over seeds. | `fusion.js` → `results/fusion.csv` |
| `fig_replay_michaung` | Velachery, 28 Nov–7 Dec 2023 (double column): hourly rainfall and 24 h rolling total against the IMD 64.5 / 115.6 mm thresholds (top); Model A level against 40 / 70 with first-danger times for Model A and Model B, and 4 Dec shaded (bottom). | `replay.js` rule re-implemented in Python, `data/rain-michaung-2023.json`, `data/flood-timeline.json`; checked against `results/replay.md` |
| `fig_tamper` | Audit-log attacks: share of trials pinpointed to the entry, flagged at batch level, or not detected (200 trials per attack). The control row is omitted; its false-alarm count is in `tamper.md`. | `tamper.js` → `results/tamper.csv` |
| `fig_scale` | Time per operation (tick, fusion, plan, anchor + verify) vs zones N = 6, 50, 100, 200, log-log, with the 2,000 ms tick budget. | `scale.js` → `results/scale.csv` |
| `fig_chain_latency` | (a) Send-to-receipt latency per anchor with median and p90; (b) gas used per anchor by batch size (1, 10, 100, 500). | `results/chain-bench.json` (committed testnet measurements) |
| `fig_rescue` | Volunteer boat rescue (single column): (a) mean, p90 and medical-need mean wait to a boat (min); (b) % of requests not reached within 6 h; greedy first-come vs optimal batch, mean ± 95% CI over 200 seeds. | `rescue.js` → `results/rescue.csv`, checked against `results/rescue.md` |
| `fig_relief` | Flood relief collection (single column): (a) mean and p90 queue wait (min); (b) max queue length at any shop (people); walk-in vs scheduled slots, mean ± 95% CI over 200 seeds. | `relief.js` → `results/relief.csv`, checked against `results/relief.md` |
| `fig_priority` | Bed scarcity stress run (single column): % of vulnerable and general residents without a bed, everyone equal vs vulnerable first, mean ± 95% CI over 1,600 scenario runs. Shelter capacity × 0.25. | `priority.js --bed-scale 0.25 --out priority-stress` → `results/priority-stress.csv`, checked against `results/priority-stress.md` |

| `fig_xgboost` | Heavy-rain risk models, Chennai cell, test years 2020–2024 (single column): (a) PR-AUC with 95% bootstrap CI over days; (b) false-alarm runs per year, labelled with heavy-rain episodes hit (of 9). Climatology, persistence, logistic regression and XGBoost. | `demo/ml/train.py` → `results/xgboost.csv`, checked against `results/xgboost.md` |

## Notes

- `fig_priority` uses the bed-scale stress variant only. At the default scale beds almost never run out (0.00 to 0.01% without a bed under either policy), so the effect is not visible there; see `results/priority.md`.
- The replay figure's 24 h rolling total starts at 28 Nov 23:00, the first hour with a full 24 h of data.
- Hourly rainfall bars are placed at their IST hour labels. Whether a label marks the start or the end of the hour is not checked (see `replay.md`).
- Error bars are 1.96 × sample SD / √n, the same formula the experiment scripts use.
- Figures use the Okabe–Ito palette, and every series also differs by marker, hatch or line style.
