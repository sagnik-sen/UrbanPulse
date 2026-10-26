"""Heavy-rain risk model: XGBoost on ERA5 reanalysis for Chennai.

    demo/ml/.venv/bin/python demo/ml/train.py        (after fetch_era5.py)

Question: from the weather up to now, what is the probability that the next 24 hours bring at least
64.5 mm of rain (the IMD "heavy rain" 24 h category) in this ERA5 cell?

Pre-declared before any result was seen (do not tune after looking at the test years):
- Label: ERA5 precipitation summed over hours t+1..t+24 >= 64.5 mm. This is ERA5 rain, not IMD-observed rain;
  ERA5 smooths peaks, so it understates station totals.
- Features: only completed hours up to and including t (an Open-Meteo hourly value is the rain of the hour
  ending at its label). See FEATURES; wind is encoded as u/v, time of year and of day as sin/cos (IST).
- Data: the 3 x 3 ERA5 cells around Chennai, 2000-2024, hourly. Training uses all nine cells; the primary
  evaluation is the Chennai cell (13.0 N, 80.25 E), which holds all six demo zones.
- Split by IST year of t: train 2000-2016, validation 2017-2019, test 2020-2024. The test set is used once.
  Events before 2020 (including the 2015 floods) are training or validation data, not evidence.
- XGBoost grid: max_depth in {2, 3, 4}; learning_rate 0.05, subsample 0.8, colsample_bytree 0.8,
  min_child_weight 5, up to 600 trees with early stopping (50 rounds) on validation log loss, seed 7.
  The depth is chosen by validation average precision. Alert threshold: the one with the best F1 on validation.
- Baselines on the same rows: monthly climatology, persistence (P(heavy next 24 h | last 24 h heavy)), and
  logistic regression on the same features.
- Intervals: 95% bootstrap over IST days (1,000 resamples), because neighbouring hours share 23 of 24 label hours.
- No comparison with numerical weather prediction was made: Open-Meteo's historical forecast archive joins the
  first hours of successive model runs, so it is not a 24-hour-ahead forecast.

Writes: demo/server/models/heavy-rain-xgb.json (model), demo/server/models/heavy-rain-fixture.json (parity
cases for the Node implementation), demo/server/experiments/results/xgboost.md and .csv.
"""
import os
import pathlib
import sys

# xgboost's macOS wheel needs libomp; scikit-learn's wheel ships one, so point the loader at it and restart
if sys.platform == "darwin" and "UP_LIBOMP" not in os.environ:
    import sklearn

    os.environ["UP_LIBOMP"] = "1"
    os.environ["DYLD_LIBRARY_PATH"] = str(pathlib.Path(sklearn.__file__).parent / ".dylibs")
    os.execv(sys.executable, [sys.executable, *sys.argv])

import datetime as dt
import json
import math
import time

import numpy as np
import xgboost as xgb
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, brier_score_loss, roc_auc_score
from sklearn.preprocessing import StandardScaler

ROOT = pathlib.Path(__file__).resolve().parent
DATA = ROOT / "data"
SERVER = ROOT.parent / "server"
RESULTS = SERVER / "experiments" / "results"
MODELS = SERVER / "models"

HEAVY_MM = 64.5
HISTORY = 72
HORIZON = 24
CENTRE = (13.0, 80.25)
TRAIN, VAL, TEST = range(2000, 2017), range(2017, 2020), range(2020, 2025)
DEPTHS = [2, 3, 4]
SEED = 7
BOOT = 1000

FEATURES = [
    "rain_1h", "rain_3h", "rain_6h", "rain_12h", "rain_24h", "rain_48h", "rain_72h", "rain_max_24h",
    "pressure", "pressure_change_3h", "pressure_change_24h", "humidity", "cloud", "cloud_mean_6h",
    "wind_u", "wind_v", "doy_sin", "doy_cos", "hour_sin", "hour_cos",
]


def nz(v):
    return float("nan") if v is None else float(v)


def features_at(h, i):
    """Feature vector at index i from hourly arrays h (lists). Uses indices i-71..i only."""
    p = [nz(x) for x in h["precipitation"][i - HISTORY + 1 : i + 1]]
    s = lambda k: sum(p[-k:])
    pr = nz(h["pressure_msl"][i])
    cl = [nz(x) for x in h["cloud_cover"][i - 5 : i + 1]]
    speed, direction = nz(h["wind_speed_10m"][i]), nz(h["wind_direction_10m"][i])
    rad = math.radians(direction)
    t = dt.datetime.fromisoformat(h["time"][i])
    doy = t.timetuple().tm_yday
    a, b = 2 * math.pi * (doy - 1) / 365.25, 2 * math.pi * t.hour / 24
    return [
        p[-1], s(3), s(6), s(12), s(24), s(48), s(72), max(p[-24:]),
        pr, pr - nz(h["pressure_msl"][i - 3]), pr - nz(h["pressure_msl"][i - 24]),
        nz(h["relative_humidity_2m"][i]), cl[-1], sum(cl) / 6,
        -speed * math.sin(rad), -speed * math.cos(rad),
        math.sin(a), math.cos(a), math.sin(b), math.cos(b),
    ]


def load_cell(path):
    h = json.loads(path.read_text())
    n = len(h["time"])
    prec = np.array([nz(x) for x in h["precipitation"]])
    ahead = np.convolve(np.nan_to_num(prec), np.ones(HORIZON), "full")  # ahead[j] = sum prec[j-23..j]
    rows, labels, years, days, months, times = [], [], [], [], [], []
    for i in range(HISTORY - 1, n - HORIZON):
        window = prec[i + 1 : i + 1 + HORIZON]
        if np.isnan(window).any():
            continue
        x = features_at(h, i)
        if any(math.isnan(v) for v in x):
            continue
        rows.append(x)
        labels.append(ahead[i + HORIZON] >= HEAVY_MM)
        years.append(int(h["time"][i][:4]))
        days.append(h["time"][i][:10])
        months.append(int(h["time"][i][5:7]))
        times.append(h["time"][i])
    return h, {
        "X": np.array(rows), "y": np.array(labels, dtype=int), "year": np.array(years),
        "day": np.array(days), "month": np.array(months), "time": times,
    }


def episodes(y):
    """Maximal runs of positive labels, as (start, end) index pairs, end exclusive."""
    out, start = [], None
    for i, v in enumerate(list(y) + [0]):
        if v and start is None:
            start = i
        elif not v and start is not None:
            out.append((start, i))
            start = None
    return out


def metrics(y, p, thr, day):
    pred = p >= thr
    eps = episodes(y)
    hit = sum(pred[a:b].any() for a, b in eps)
    false_runs = [r for r in episodes(pred.astype(int)) if not y[r[0] : r[1]].any()]
    years = len(set(d[:4] for d in day))
    tp = int((pred & (y == 1)).sum())
    return {
        "roc_auc": roc_auc_score(y, p), "pr_auc": average_precision_score(y, p), "brier": brier_score_loss(y, p),
        "precision": tp / max(1, pred.sum()), "recall": tp / max(1, y.sum()),
        "episodes": len(eps), "episodes_hit": int(hit), "false_alarm_runs_per_year": len(false_runs) / years,
    }


def boot_ci(y, p, day, rng):
    uniq, inv = np.unique(day, return_inverse=True)
    groups = [np.flatnonzero(inv == k) for k in range(len(uniq))]
    stats = {"roc_auc": [], "pr_auc": [], "brier": []}
    for _ in range(BOOT):
        idx = np.concatenate([groups[k] for k in rng.integers(0, len(groups), len(groups))])
        yy, pp = y[idx], p[idx]
        if yy.min() == yy.max():
            continue
        stats["roc_auc"].append(roc_auc_score(yy, pp))
        stats["pr_auc"].append(average_precision_score(yy, pp))
        stats["brier"].append(brier_score_loss(yy, pp))
    return {k: (float(np.percentile(v, 2.5)), float(np.percentile(v, 97.5))) for k, v in stats.items()}


def best_f1_threshold(y, p):
    best, thr = -1, 0.5
    for t in np.unique(np.round(p, 3)):
        pred = p >= t
        tp = (pred & (y == 1)).sum()
        f1 = 2 * tp / max(1, pred.sum() + y.sum())
        if f1 > best:
            best, thr = f1, float(t)
    return thr


def main():
    t0 = time.time()
    cells = sorted(DATA.glob("era5_*.json"))
    assert len(cells) == 9, f"expected 9 cells, found {len(cells)}: run fetch_era5.py"
    data, centre_raw = {}, None
    for path in cells:
        lat, lng = (float(v) for v in path.stem.split("_")[1:])
        raw, d = load_cell(path)
        data[(lat, lng)] = d
        if (lat, lng) == CENTRE:
            centre_raw = raw

    def split(years, cell=None):
        keys = [cell] if cell else list(data)
        out = {k: np.concatenate([data[c][k] for c in keys]) for k in ("X", "y", "year", "day", "month")}
        mask = np.isin(out["year"], list(years))
        return {k: v[mask] for k, v in out.items()}

    tr, va = split(TRAIN), split(VAL)
    te_c, te_all = split(TEST, CENTRE), split(TEST)
    va_c = split(VAL, CENTRE)

    counts = []
    for name, part in [("train (9 cells)", tr), ("validation (9 cells)", va), ("validation (Chennai cell)", va_c), ("test (Chennai cell)", te_c), ("test (9 cells)", te_all)]:
        counts.append((name, len(part["y"]), int(part["y"].sum()), len(episodes(part["y"]))))
        print("counts", counts[-1])

    # baselines
    clim = {m: tr["y"][tr["month"] == m].mean() for m in range(1, 13)}
    pers = {True: tr["y"][tr["X"][:, 4] >= HEAVY_MM].mean(), False: tr["y"][tr["X"][:, 4] < HEAVY_MM].mean()}
    scaler = StandardScaler().fit(tr["X"])
    logreg = LogisticRegression(max_iter=2000).fit(scaler.transform(tr["X"]), tr["y"])

    # XGBoost: depth by validation average precision
    grid = []
    for depth in DEPTHS:
        m = xgb.XGBClassifier(
            n_estimators=600, max_depth=depth, learning_rate=0.05, subsample=0.8, colsample_bytree=0.8,
            min_child_weight=5, objective="binary:logistic", eval_metric="logloss", early_stopping_rounds=50,
            random_state=SEED, n_jobs=4,
        )
        m.fit(tr["X"], tr["y"], eval_set=[(va["X"], va["y"])], verbose=False)
        ap = average_precision_score(va["y"], m.predict_proba(va["X"])[:, 1])
        grid.append((depth, m.best_iteration + 1, ap, m))
        print(f"depth {depth}: {m.best_iteration + 1} trees, validation AP {ap:.4f}")
    depth, n_trees, _, model = max(grid, key=lambda g: g[2])
    booster = model.get_booster()[: n_trees]

    def predictors():
        return {
            "Climatology (month)": lambda d: np.array([clim[m] for m in d["month"]]),
            "Persistence (last 24 h heavy)": lambda d: np.where(d["X"][:, 4] >= HEAVY_MM, pers[True], pers[False]),
            "Logistic regression": lambda d: logreg.predict_proba(scaler.transform(d["X"]))[:, 1],
            "XGBoost (proposed)": lambda d: booster.predict(xgb.DMatrix(d["X"])),
        }

    rng = np.random.default_rng(SEED)
    rows = []
    for name, f in predictors().items():
        thr = best_f1_threshold(va["y"], f(va))
        for label, part in [("Chennai cell", te_c), ("9 cells", te_all)]:
            p = f(part)
            m = metrics(part["y"], p, thr, part["day"])
            ci = boot_ci(part["y"], p, part["day"], rng) if label == "Chennai cell" else {}
            rows.append({"model": name, "eval": label, "threshold": thr, **m, "ci": ci})
            print(name, label, {k: round(v, 3) if isinstance(v, float) else v for k, v in m.items()})

    # export model and parity fixture
    MODELS.mkdir(exist_ok=True)
    booster.save_model(MODELS / "heavy-rain-xgb.json")
    model_json = json.loads((MODELS / "heavy-rain-xgb.json").read_text())
    xgb_row = next(r for r in rows if r["model"] == "XGBoost (proposed)" and r["eval"] == "Chennai cell")
    meta = {"features": FEATURES, "threshold": xgb_row["threshold"], "heavyMm": HEAVY_MM, "history": HISTORY, "trees": n_trees, "maxDepth": depth, "xgboost": xgb.__version__}
    model_json["urbanpulse"] = meta
    (MODELS / "heavy-rain-xgb.json").write_text(json.dumps(model_json, separators=(",", ":")))

    # parity cases: centre cell test hours with a spread of probabilities, raw history included
    h = centre_raw
    idx_by_time = {t: i for i, t in enumerate(h["time"])}
    te_times = [t for t, yr in zip(data[CENTRE]["time"], data[CENTRE]["year"]) if yr in TEST]
    te_p = booster.predict(xgb.DMatrix(te_c["X"]))
    order = np.argsort(te_p)
    picks = [order[int(q * (len(order) - 1))] for q in (0, 0.5, 0.9, 0.99, 0.999, 1.0)]
    cases = []
    for k in picks:
        i = idx_by_time[te_times[k]]
        hist = {v: h[v][i - HISTORY + 1 : i + 1] for v in h if v not in ("cell",)}
        x = features_at(h, i)
        cases.append({"hours": hist, "features": x, "probability": float(booster.predict(xgb.DMatrix(np.array([x])))[0])})
    (MODELS / "heavy-rain-fixture.json").write_text(json.dumps({"cases": cases}, separators=(",", ":")))

    # test episodes in the Chennai cell
    y_c = te_c["y"]
    ep_rows = []
    prec = np.nan_to_num(np.array([nz(v) for v in h["precipitation"]]))
    thr = xgb_row["threshold"]
    for a, b in episodes(y_c):
        i0 = idx_by_time[te_times[a]]
        peak = max(prec[i + 1 : i + 1 + HORIZON].sum() for i in range(i0, i0 + (b - a)))
        first_alert = next((j for j in range(max(0, a - 48), b) if te_p[j] >= thr), None)
        lead = None if first_alert is None else (first_alert - a)
        ep_rows.append((te_times[a], b - a, peak, float(te_p[a:b].max()), lead))

    imp = booster.get_score(importance_type="gain")
    imp = sorted(((FEATURES[int(k[1:])], v) for k, v in imp.items()), key=lambda kv: -kv[1])

    write_report(counts, grid, depth, n_trees, rows, ep_rows, imp, thr, time.time() - t0)
    write_csv(rows)


def fmt_ci(v, ci):
    return f"{v:.3f} ({ci[0]:.3f}–{ci[1]:.3f})" if ci else f"{v:.3f}"


def write_report(counts, grid, depth, n_trees, rows, ep_rows, imp, thr, secs):
    L = []
    L.append("# Heavy-rain risk model (XGBoost)\n")
    L.append("Predicts the probability that the next 24 hours bring at least 64.5 mm of rain (IMD \"heavy rain\") in an ERA5 cell, from the weather up to now.")
    L.append("Data: Open-Meteo Historical Weather API, ERA5 reanalysis (models=era5), CC BY 4.0 (https://open-meteo.com/), hourly 2000–2024, the 3 × 3 block of 0.25° cells around Chennai. All six demo zones are in the Chennai cell (13.0 N, 80.25 E).")
    L.append(f"Script: `demo/ml/train.py` (design pre-declared in its header). xgboost {xgb.__version__}. Runtime {secs:.0f} s.\n")
    L.append("## Labels and splits\n")
    L.append("The label is ERA5 rain over the next 24 hours ≥ 64.5 mm, not IMD-observed rain; ERA5 smooths peaks and understates station totals. Rows are hourly issue times. An episode is a run of consecutive positive hours.\n")
    L.append("| Split | Rows (hours) | Positive hours | Episodes |\n|---|---:|---:|---:|")
    for name, n, pos, eps in counts:
        L.append(f"| {name} | {n:,} | {pos:,} | {eps} |")
    L.append("\nTrain 2000–2016, validation 2017–2019, test 2020–2024. Events before 2020, including the 2015 floods, are training or validation data and are not evidence for the model.\n")
    L.append("## Model selection (validation)\n")
    L.append("| max_depth | Trees (early stopping) | Validation average precision |\n|---:|---:|---:|")
    for d, n, ap, _ in grid:
        L.append(f"| {d} | {n} | {ap:.4f} |")
    L.append(f"\nChosen: max_depth {depth}, {n_trees} trees. Alert threshold {thr:.3f} (best F1 on validation).\n")
    L.append("## Test results, Chennai cell (2020–2024)\n")
    L.append("ROC-AUC, PR-AUC and Brier with 95% bootstrap intervals over days. Thresholds were fixed on validation. Episode hit: at least one hour of the episode at or above the threshold. False-alarm runs: runs of alert hours that overlap no positive hour.\n")
    L.append("| Model | ROC-AUC | PR-AUC | Brier | Precision | Recall (hours) | Episodes hit | False-alarm runs / year |\n|---|---:|---:|---:|---:|---:|---:|---:|")
    for r in rows:
        if r["eval"] != "Chennai cell":
            continue
        ci = r["ci"]
        L.append(f"| {r['model']} | {fmt_ci(r['roc_auc'], ci.get('roc_auc'))} | {fmt_ci(r['pr_auc'], ci.get('pr_auc'))} | {fmt_ci(r['brier'], ci.get('brier'))} | {r['precision']:.3f} | {r['recall']:.3f} | {r['episodes_hit']} of {r['episodes']} | {r['false_alarm_runs_per_year']:.1f} |")
    L.append("\n## Test results, all nine cells (secondary)\n")
    L.append("| Model | ROC-AUC | PR-AUC | Brier | Precision | Recall (hours) | Episodes hit | False-alarm runs / year (per cell) |\n|---|---:|---:|---:|---:|---:|---:|---:|")
    for r in rows:
        if r["eval"] != "9 cells":
            continue
        L.append(f"| {r['model']} | {r['roc_auc']:.3f} | {r['pr_auc']:.3f} | {r['brier']:.4f} | {r['precision']:.3f} | {r['recall']:.3f} | {r['episodes_hit']} of {r['episodes']} | {r['false_alarm_runs_per_year'] / 9:.1f} |")
    L.append("\n## Test episodes, Chennai cell\n")
    L.append("Start is the first issue hour whose next 24 hours reach 64.5 mm. Lead: hours from the first XGBoost alert (searched from 48 h before the start) to the start; negative means before. Episodes are found from the labels, not named from memory.\n")
    L.append("| Start (IST) | Hours | Max 24 h ERA5 rain (mm) | Max XGBoost probability | First alert vs start (h) |\n|---|---:|---:|---:|---:|")
    for start, hours, peak, pmax, lead in ep_rows:
        L.append(f"| {start} | {hours} | {peak:.1f} | {pmax:.2f} | {'not alerted' if lead is None else f'{lead:+d}'} |")
    L.append("\n## Feature importance (gain)\n")
    L.append("| Feature | Gain |\n|---|---:|")
    for name, g in imp[:10]:
        L.append(f"| {name} | {g:.1f} |")
    L.append("\n## Limits\n")
    L.append("- The label is ERA5 rain, which understates local extremes; it is not a measure of flooding.")
    L.append("- In the live app the features come from the Open-Meteo forecast API's past hours (a model analysis), not ERA5, so live inputs differ somewhat from training inputs.")
    L.append("- No comparison with a numerical weather forecast was made (see the script header). The app's existing IMD alerts use the Open-Meteo 24 h forecast; this model is shown alongside them as advisory and does not trigger alerts.")
    L.append("- All nine training cells are within about 40 km of each other, so they are not independent samples.")
    L.append("- The most important feature is rain in the last 6 hours, and several episodes were first alerted after they began. Part of the episode hit rate comes from rain already falling: this is a nowcast of a heavy-rain day, not a long-lead early warning.")
    L.append("- The lead column searches from 48 hours before an episode, so an alert from an earlier, unrelated wet spell can appear as a long lead (for example a low peak probability with a large negative lead).")
    L.append("- Logistic regression on the same features matched or beat XGBoost on the test years. XGBoost was the pre-declared model and is kept in the app; the test set was not used to choose between them.")
    (RESULTS / "xgboost.md").write_text("\n".join(L) + "\n")


def write_csv(rows):
    keys = ["model", "eval", "threshold", "roc_auc", "pr_auc", "brier", "precision", "recall", "episodes", "episodes_hit", "false_alarm_runs_per_year"]
    lines = [",".join(keys)] + [",".join(f'"{r[k]}"' if isinstance(r[k], str) else f"{r[k]:.6g}" for k in keys) for r in rows]
    (RESULTS / "xgboost.csv").write_text("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()
