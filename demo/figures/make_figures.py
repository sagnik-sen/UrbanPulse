#!/usr/bin/env python3
"""Builds the IEEE paper figures from the UrbanPulse experiment outputs.

    demo/figures/.venv/bin/python demo/figures/make_figures.py

Inputs: demo/server/experiments/results (CSV and markdown written by the experiment scripts)
and demo/server/experiments/data (rainfall and flood timeline). Outputs: demo/figures/out, as
PDF and 300-dpi PNG per figure.
"""

import csv
import datetime as dt
import json
import math
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.dates as mdates  # noqa: E402
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib.ticker import LogLocator, NullFormatter, ScalarFormatter  # noqa: E402

HERE = Path(__file__).resolve().parent
EXPERIMENTS = HERE.parent / "server" / "experiments"
RESULTS = EXPERIMENTS / "results"
DATA = EXPERIMENTS / "data"
OUT = HERE / "out"

SINGLE_W = 3.5
DOUBLE_W = 7.16

# Okabe-Ito palette
BLUE = "#0072B2"
ORANGE = "#E69F00"
GREEN = "#009E73"
VERMILLION = "#D55E00"
PINK = "#CC79A7"
SKY = "#56B4E9"
BLACK = "#000000"
GREY = "#BBBBBB"

# Constants copied from the experiment sources (run.js, replay.js, simulator.js ZONE_DEFS).
REPLAY_STORM_DECAY = 0.97
REPLAY_RAIN_GAIN = 0.15
REPLAY_TICKS_PER_HOUR = 30
REPLAY_WARNING = 40
REPLAY_DANGER = 70
REPLAY_IMD_HEAVY = 64.5
REPLAY_IMD_VERY_HEAVY = 115.6
REPLAY_EPS = 1e-9
REPLAY_ZONES = [
    ("pallikaranai", "Pallikaranai Marshland", 35),
    ("velachery", "Velachery", 40),
    ("omr", "OMR (Sholinganallur)", 30),
    ("tnagar", "T Nagar", 25),
    ("adyar", "Adyar", 28),
    ("mylapore", "Mylapore", 32),
]
TAMPER_LABELS = {
    "edit details (one character)": "Edit one field",
    "backdate timestamp (1 s)": "Backdate timestamp by 1 s",
    "change who did it": "Change author",
    "swap two entries' timestamps": "Swap two timestamps",
    "edit an entry and rewrite its stored hash": "Edit, rewrite stored hash",
    "delete an entry": "Delete entry",
    "delete an entry and its anchor record": "Delete entry and anchor",
    "insert a forged entry into a batch": "Insert forged entry",
    "delete a whole batch locally": "Delete whole batch",
    "edit before anchoring (blind spot)": "Edit before anchoring",
}
SCALE_BUDGET_MS = 2000

plt.rcParams.update(
    {
        "font.family": "serif",
        "font.serif": ["DejaVu Serif"],
        "font.size": 8,
        "axes.labelsize": 8,
        "axes.titlesize": 8,
        "xtick.labelsize": 7,
        "ytick.labelsize": 7,
        "legend.fontsize": 7,
        "axes.linewidth": 0.6,
        "xtick.major.width": 0.6,
        "ytick.major.width": 0.6,
        "xtick.major.size": 2.5,
        "ytick.major.size": 2.5,
        "lines.linewidth": 1.0,
        "lines.markersize": 3.5,
        "errorbar.capsize": 2,
        "hatch.linewidth": 0.4,
        "pdf.fonttype": 42,
        "ps.fonttype": 42,
        "axes.axisbelow": True,
        "axes.grid": False,
        "legend.frameon": False,
        "figure.dpi": 100,
        "savefig.dpi": 300,
    }
)


def grid(ax, axis="both"):
    ax.grid(True, axis=axis, linewidth=0.4, alpha=0.35, color="#808080")


def save(fig, name):
    fig.savefig(OUT / f"{name}.pdf", metadata={"Creator": None, "Producer": None})
    fig.savefig(OUT / f"{name}.png", dpi=300, metadata={"Software": None})
    plt.close(fig)


def read_rows(name):
    with open(RESULTS / name, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def mean_ci(xs):
    n = len(xs)
    if n == 0:
        raise ValueError("empty sample")
    m = sum(xs) / n
    sd = math.sqrt(sum((x - m) ** 2 for x in xs) / max(1, n - 1))
    return m, 1.96 * sd / math.sqrt(n), n


def md_rows(name, heading):
    """Body rows (as lists of cell strings) of the first markdown table after an exact heading line."""
    lines = (RESULTS / name).read_text(encoding="utf-8").split("\n")
    i = lines.index(heading) + 1
    while not lines[i].startswith("|"):
        i += 1
    rows = []
    for ln in lines[i + 2:]:
        if not ln.startswith("|"):
            break
        rows.append([c.strip() for c in ln.strip().strip("|").split("|")])
    return rows


def parse_pm(cell):
    mean_text, ci_text = cell.split(" ± ")
    return float(mean_text), float(ci_text)


def assert_close(a, b, tol, what):
    if abs(a - b) > tol:
        raise AssertionError(f"{what}: figure value {a} differs from committed table value {b}")


# ---------------------------------------------------------------------------------------------
# Figure 1: evacuation policies (run.js)
# ---------------------------------------------------------------------------------------------
EVAC_POLICIES = [
    ("nearest", "Nearest shelter", GREY, None),
    ("snapshot", "Avoid current floods", GREY, "//"),
    ("forecast", "Forecast-aware", SKY, None),
    ("forecastGreedy", "Forecast-aware, greedy", SKY, "//"),
    ("combined", "Proposed: forecast-aware, optimal", BLUE, None),
    ("oracle", "Perfect foresight (bound)", "white", "..."),
]
EVAC_METRICS = [
    ("pctWithoutBed", "Evacuees without a bed (%)", 1),
    ("pctFloodedShelter", "Sent to a flooded shelter (%)", 1),
    ("meanTravelMin", "Mean travel time (min)", 1),
]
# column order of the "All scenarios" policy table in results.md (METRICS order in run.js)
EVAC_MD_POLICY_ORDER = ["nearest", "snapshot", "snapshot0", "forecast", "snapshotGreedy", "forecastGreedy", "capacity", "combined", "oracle"]
EVAC_MD_COLUMN = {"pctWithoutBed": (0, 1), "meanTravelMin": (2, 1), "pctFloodedShelter": (4, 1)}


def fig_evacuation():
    rows = read_rows("results.csv")
    scenarios = {(r["type"], r["seed"], r["mode"]) for r in rows}
    per_policy = {}
    for key, _, _, _ in EVAC_POLICIES:
        sel = [r for r in rows if r["policy"] == key]
        assert len(sel) == len(scenarios), f"{key}: {len(sel)} rows, expected {len(scenarios)}"
        per_policy[key] = sel

    md = md_rows("results.md", "## All scenarios")
    md_by_key = {EVAC_MD_POLICY_ORDER[i]: row for i, row in enumerate(md[: len(EVAC_MD_POLICY_ORDER)])}
    for metric, (col, dec) in EVAC_MD_COLUMN.items():
        for key, row in md_by_key.items():
            if key not in per_policy:
                continue
            m, _, _ = mean_ci([float(r[metric]) for r in per_policy[key]])
            committed, _ = parse_pm(row[1 + col])
            assert_close(round(m, dec), committed, 10 ** -dec, f"evacuation {key} {metric}")

    fig, axes = plt.subplots(1, 3, figsize=(DOUBLE_W, 2.75), sharey=True, layout="constrained")
    ypos = list(range(len(EVAC_POLICIES)))[::-1]
    for ax, (metric, xlabel, dec) in zip(axes, EVAC_METRICS):
        stats = [mean_ci([float(r[metric]) for r in per_policy[key]]) for key, _, _, _ in EVAC_POLICIES]
        for y, (m, ci, _), (_, _, color, hatch) in zip(ypos, stats, EVAC_POLICIES):
            ax.barh(
                y, m, xerr=ci, height=0.62, color=color, hatch=hatch,
                edgecolor=BLACK, linewidth=0.5, ecolor=BLACK, error_kw={"elinewidth": 0.6, "capsize": 1.5},
            )
            ax.annotate(f"{m:.{dec}f}", xy=(m + ci, y), xytext=(2, 0), textcoords="offset points", va="center", fontsize=7)
        ax.set_xlim(0, max(m + ci for m, ci, _ in stats) * 1.3)
        ax.set_xlabel(xlabel)
        ax.set_yticks(ypos)
        ax.set_yticklabels([label for _, label, _, _ in EVAC_POLICIES])
        ax.set_ylim(-0.6, len(EVAC_POLICIES) - 0.4)
        grid(ax, "x")
    for label in axes[0].get_yticklabels():
        label.set_fontsize(7)
    axes[0].get_yticklabels()[[key for key, _, _, _ in EVAC_POLICIES].index("combined")].set_fontweight("bold")
    save(fig, "fig_evacuation")


# ---------------------------------------------------------------------------------------------
# Figure 2: sensor and citizen-report fusion (fusion.js)
# ---------------------------------------------------------------------------------------------
FUSION_METHODS = [("sensor only", "Sensor only", BLUE, "o"), ("reports only", "Citizen reports only", ORANGE, "s"), ("fused", "Fused", GREEN, "^")]
FUSION_DROPOUT = [0, 0.5, 1]


def fig_fusion():
    rows = read_rows("fusion.csv")
    md = md_rows("fusion.md", "## Recall: % of danger episodes declared at least once")
    md_by_setting = {r[0]: r for r in md}
    fig, ax = plt.subplots(figsize=(SINGLE_W, 2.45), layout="constrained")
    for col, (method, label, color, marker) in enumerate(FUSION_METHODS, start=1):
        xs, ms, cis = [], [], []
        for d in FUSION_DROPOUT:
            setting = f"dropout {d} / false 0"
            vals = [float(r["recall_pct"]) for r in rows if r["setting"] == setting and r["method"] == method and r["recall_pct"] != ""]
            assert len(vals) == 200, f"{setting}/{method}: {len(vals)} seeds"
            m, ci, _ = mean_ci(vals)
            committed, _ = parse_pm(md_by_setting[setting][col])
            assert_close(round(m, 1), committed, 0.1, f"fusion {setting} {method}")
            xs.append(d)
            ms.append(m)
            cis.append(ci)
        ax.errorbar(xs, ms, yerr=cis, color=color, marker=marker, markersize=4, linewidth=1.1, elinewidth=0.6, capsize=2, label=label)
    ax.set_xlim(-0.08, 1.08)
    ax.set_ylim(-3, 105)
    ax.set_xticks(FUSION_DROPOUT)
    ax.set_xlabel("Sensor dropout (P[sensor offline for whole run])")
    ax.set_ylabel("Recall of danger episodes (%)")
    grid(ax)
    ax.legend(loc="upper right", fontsize=7, handlelength=2.2)
    save(fig, "fig_fusion")


# ---------------------------------------------------------------------------------------------
# Figure 3: Michaung 2023 replay (replay.js)
# ---------------------------------------------------------------------------------------------
def load_rain(name):
    d = json.loads((DATA / f"rain-{name}.json").read_text(encoding="utf-8"))
    series = {z: [0.0 if x is None else float(x) for x in s] for z, s in d["mmPerHour"].items()}
    for z, s in series.items():
        assert len(s) == len(d["time"]), f"{name}/{z}: length differs from time"
    return d["time"], series


def model_a_levels(rates, base):
    storm = 0.0
    levels = []
    for mm in rates:
        for _ in range(REPLAY_TICKS_PER_HOUR):
            storm = storm * REPLAY_STORM_DECAY + mm * REPLAY_RAIN_GAIN
        levels.append(base + storm)
    return levels


def rolling_sum(series, h, hours=24):
    s = 0.0
    for j in range(max(0, h - hours + 1), h + 1):
        s += series[j]
    return s


def first_at_least(values, threshold):
    for i, x in enumerate(values):
        if x >= threshold - REPLAY_EPS:
            return i
    return None


def check_replay_against_table(time, rain):
    md = md_rows("replay.md", "## Cyclone Michaung, Chennai (December 2023)")
    by_name = {name: (zid, base) for zid, name, base in REPLAY_ZONES}
    assert len(md) == len(REPLAY_ZONES), "replay.md Michaung table has an unexpected number of rows"
    for row in md:
        zid, base = by_name[row[0]]
        series = rain[zid]
        levels = model_a_levels(series, base)
        sums = [rolling_sum(series, h) for h in range(len(series))]
        got = [
            first_at_least(levels, REPLAY_WARNING),
            first_at_least(levels, REPLAY_DANGER),
            first_at_least(sums, REPLAY_IMD_HEAVY),
            first_at_least(sums, REPLAY_IMD_VERY_HEAVY),
        ]
        labels = [time[i].replace("T", " ") if i is not None else "—" for i in got]
        expected = [row[2], row[3], row[6], row[7]]
        if labels != expected:
            raise AssertionError(f"replay {zid}: recomputed {labels} differs from replay.md {expected}")
    md_text = (RESULTS / "replay.md").read_text(encoding="utf-8")
    for needle in (f"Warning at level ≥ {REPLAY_WARNING}", f"danger at level ≥ {REPLAY_DANGER}", f"S ≥ {REPLAY_IMD_HEAVY} mm", f"S ≥ {REPLAY_IMD_VERY_HEAVY} mm"):
        assert needle in md_text, f"replay.md no longer states: {needle}"


def fig_replay_michaung():
    time, rain = load_rain("michaung-2023")
    check_replay_against_table(time, rain)

    zid, base = "velachery", 40
    series = rain[zid]
    levels = model_a_levels(series, base)
    sums = [rolling_sum(series, h) for h in range(len(series))]
    stamps = [dt.datetime.strptime(t, "%Y-%m-%dT%H:%M") for t in time]

    end = next(i for i, t in enumerate(time) if t >= "2023-12-08T00:00")
    start_full = 23  # first index with a full 24 h of data; earlier rolling totals are partial
    a_first = first_at_least(levels, REPLAY_DANGER)
    b_first = first_at_least(sums, REPLAY_IMD_VERY_HEAVY)
    assert time[a_first] == "2023-12-03T02:00" and time[b_first] == "2023-12-04T14:00"
    flood_start, flood_end = dt.datetime(2023, 12, 4), dt.datetime(2023, 12, 5)

    fig, (ax_r, ax_l) = plt.subplots(2, 1, figsize=(DOUBLE_W, 4.6), sharex=True, height_ratios=[1.0, 1.0], layout="constrained")

    ax_r.bar(stamps[:end], series[:end], width=1 / 24, color=SKY, edgecolor="none", label="Hourly rainfall")
    ax_r.plot(stamps[start_full:end], sums[start_full:end], color=BLUE, linewidth=1.2, label="24 h rolling total")
    ax_r.axhline(REPLAY_IMD_HEAVY, color=ORANGE, linestyle="--", linewidth=0.9)
    ax_r.axhline(REPLAY_IMD_VERY_HEAVY, color=VERMILLION, linestyle=(0, (5, 2, 1, 2)), linewidth=1.1)
    ax_r.text(stamps[1], REPLAY_IMD_HEAVY + 3, "IMD heavy, 64.5 mm (24 h)", fontsize=7, va="bottom")
    ax_r.text(stamps[1], REPLAY_IMD_VERY_HEAVY + 3, "IMD very heavy, 115.6 mm (24 h)", fontsize=7, va="bottom")
    ax_r.axvspan(flood_start, flood_end, color=GREY, alpha=0.25, linewidth=0)
    ax_r.set_ylabel("Rainfall (mm)")
    ax_r.set_ylim(0, max(sums) * 1.12)
    ax_r.legend(loc="upper left", fontsize=7)
    grid(ax_r, "y")

    ax_l.plot(stamps[:end], levels[:end], color=BLUE, linewidth=1.2, label="Model A level")
    ax_l.axhline(REPLAY_WARNING, color=ORANGE, linestyle="--", linewidth=0.9)
    ax_l.axhline(REPLAY_DANGER, color=VERMILLION, linestyle=(0, (5, 2, 1, 2)), linewidth=1.1)
    ax_l.text(stamps[1], REPLAY_WARNING - 1.0, "warning, 40", fontsize=7, va="top")
    ax_l.text(stamps[1], REPLAY_DANGER + 1.0, "danger, 70", fontsize=7, va="bottom")
    ax_l.axvspan(flood_start, flood_end, color=GREY, alpha=0.25, linewidth=0, label="4 Dec, documented flood day")
    ax_l.axvline(stamps[a_first], color=BLUE, linestyle=":", linewidth=1.0)
    ax_l.axvline(stamps[b_first], color=BLACK, linestyle=":", linewidth=1.0)
    ax_l.plot([stamps[a_first]], [levels[a_first]], marker="o", color=BLUE, markersize=3.5, linestyle="none")
    ax_l.text(stamps[a_first] - dt.timedelta(hours=3), 104, "Model A first danger\n3 Dec 02:00", fontsize=7, ha="right", va="center", color=BLUE)
    ax_l.text(stamps[b_first] + dt.timedelta(hours=3), 124, "Model B first danger\n4 Dec 14:00", fontsize=7, ha="left", va="center")
    ax_l.set_ylabel("Model A level (model units)")
    ax_l.set_ylim(REPLAY_WARNING - 6, 132)
    ax_l.legend(loc="upper left", fontsize=7, handlelength=2.0)
    ax_l.set_xlabel("Date, IST (2023)")
    ax_l.xaxis.set_major_locator(mdates.DayLocator())
    ax_l.xaxis.set_major_formatter(mdates.DateFormatter("%d %b"))
    ax_l.set_xlim(stamps[0], stamps[end - 1] + dt.timedelta(hours=1))
    grid(ax_l, "y")
    save(fig, "fig_replay_michaung")


# ---------------------------------------------------------------------------------------------
# Figure 4: audit-log tamper detection (tamper.js)
# ---------------------------------------------------------------------------------------------
def fig_tamper():
    rows = read_rows("tamper.csv")
    attacks = [a for a in dict.fromkeys(r["attack"] for r in rows) if a in TAMPER_LABELS]
    shares = {}
    for attack in attacks:
        sel = [r for r in rows if r["attack"] == attack]
        n = len(sel)
        pin = sum(1 for r in sel if r["level"] == "row") / n
        batch = sum(1 for r in sel if r["level"] == "batch") / n
        none = sum(1 for r in sel if r["detected"] == "false") / n
        assert abs(pin + batch + none - 1) < 1e-9, f"{attack}: categories do not cover all trials"
        shares[attack] = (100 * pin, 100 * batch, 100 * none, n)

    fig, ax = plt.subplots(figsize=(SINGLE_W, 3.0), layout="constrained")
    ypos = list(range(len(attacks)))[::-1]
    lefts_batch = [shares[a][0] for a in attacks]
    lefts_none = [shares[a][0] + shares[a][1] for a in attacks]
    ax.barh(ypos, [shares[a][0] for a in attacks], height=0.62, color=BLUE, edgecolor=BLACK, linewidth=0.4, label="Pinpointed to the entry")
    ax.barh(ypos, [shares[a][1] for a in attacks], left=lefts_batch, height=0.62, color=ORANGE, hatch="//", edgecolor=BLACK, linewidth=0.4, label="Flagged at batch level")
    ax.barh(ypos, [shares[a][2] for a in attacks], left=lefts_none, height=0.62, color="white", hatch="..", edgecolor=BLACK, linewidth=0.4, label="Not detected")
    ax.set_yticks(ypos)
    ax.set_yticklabels([TAMPER_LABELS[a] for a in attacks])
    ax.set_xlim(0, 100)
    ax.set_xlabel("Share of trials (%), 200 per attack")
    grid(ax, "x")
    ax.legend(loc="upper center", bbox_to_anchor=(0.38, -0.2), ncol=2, fontsize=7, handlelength=1.6)
    save(fig, "fig_tamper")


# ---------------------------------------------------------------------------------------------
# Figure 5: city-scale timing (scale.js)
# ---------------------------------------------------------------------------------------------
def fig_scale():
    rows = read_rows("scale.csv")
    zones = [int(r["zones"]) for r in rows]
    series = [
        ("Tick", [float(r["tick_ms"]) for r in rows], BLUE, "o"),
        ("Fusion", [float(r["fusion_ms"]) for r in rows], ORANGE, "s"),
        ("Plan (one request)", [float(r["plan_ms"]) for r in rows], GREEN, "^"),
        ("Anchor + verify (one day)", [float(r["anchor_ms"]) + float(r["verify_ms"]) for r in rows], VERMILLION, "D"),
    ]
    fig, ax = plt.subplots(figsize=(SINGLE_W, 2.7), layout="constrained")
    for label, ys, color, marker in series:
        ax.plot(zones, ys, color=color, marker=marker, markersize=3.5, linewidth=1.0, label=label)
    ax.axhline(SCALE_BUDGET_MS, color=BLACK, linestyle="--", linewidth=0.9)
    ax.text(zones[0] * 0.95, SCALE_BUDGET_MS * 1.12, "2,000 ms tick budget", fontsize=7, va="bottom", ha="left")
    ax.set_xscale("log")
    ax.set_yscale("log")
    ax.set_xticks(zones)
    ax.get_xaxis().set_major_formatter(ScalarFormatter())
    ax.xaxis.set_minor_formatter(NullFormatter())
    ax.yaxis.set_major_locator(LogLocator(base=10, numticks=10))
    ax.yaxis.set_minor_formatter(NullFormatter())
    ax.set_xlim(zones[0] * 0.85, zones[-1] * 1.2)
    ax.set_ylim(0.1, 10000)
    ax.set_xlabel("Zones (N); N = 6 is the demo city")
    ax.set_ylabel("Time (ms, median of 7 runs)")
    grid(ax)
    ax.legend(loc="upper center", bbox_to_anchor=(0.5, -0.22), ncol=2, fontsize=7, handlelength=2.0)
    save(fig, "fig_scale")


# ---------------------------------------------------------------------------------------------
# Figure 6: blockchain anchoring latency and gas (chain-bench.json)
# ---------------------------------------------------------------------------------------------
def percentile(xs, p):
    s = sorted(xs)
    k = (len(s) - 1) * p
    f = math.floor(k)
    c = min(f + 1, len(s) - 1)
    return s[f] + (s[c] - s[f]) * (k - f)


def fig_chain_latency():
    bench = json.loads((RESULTS / "chain-bench.json").read_text(encoding="utf-8"))
    anchors = bench["anchors"]
    lat = [a["latencyMs"] / 1000 for a in anchors]
    med, p90 = percentile(lat, 0.5), percentile(lat, 0.9)
    assert abs(med - bench["summary"]["latency"]["median"]) < 1e-3
    assert abs(p90 - bench["summary"]["latency"]["p90"]) < 1e-3
    for entry in bench["summary"]["byCount"]:
        gas = [a["gasUsed"] for a in anchors if a["count"] == entry["count"]]
        assert len(gas) == entry["n"] and abs(sum(gas) / len(gas) - entry["meanGas"]) < 1

    fig, (ax_l, ax_r) = plt.subplots(1, 2, figsize=(SINGLE_W, 2.45), gridspec_kw={"width_ratios": [1.25, 1]}, layout="constrained")
    jitter = [0.12 * ((i % 5) - 2) for i in range(len(lat))]
    ax_l.scatter(lat, [1 + j for j in jitter], s=9, color=BLUE, edgecolor=BLACK, linewidth=0.3, zorder=3)
    ax_l.axvline(med, color=BLACK, linewidth=0.9)
    ax_l.axvline(p90, color=VERMILLION, linestyle="--", linewidth=0.9)
    ax_l.text(med - 0.1, 1.55, f"median\n{med:.2f} s", fontsize=7, ha="right", va="top")
    ax_l.text(p90 + 0.1, 1.55, f"p90\n{p90:.2f} s", fontsize=7, ha="left", va="top", color=VERMILLION)
    ax_l.set_ylim(0.55, 1.6)
    ax_l.set_yticks([])
    ax_l.set_xlim(1.5, 9.5)
    ax_l.set_xlabel("Send to receipt (s)")
    grid(ax_l, "x")
    ax_l.set_title("(a)", fontsize=8, loc="left")

    sizes = [1, 10, 100, 500]
    for i, size in enumerate(sizes):
        gas = [a["gasUsed"] / 1000 for a in anchors if a["count"] == size]
        xs = [i + 0.1 * (j - (len(gas) - 1) / 2) for j in range(len(gas))]
        ax_r.scatter(xs, gas, s=9, color=BLUE, edgecolor=BLACK, linewidth=0.3, zorder=3)
        m = sum(gas) / len(gas)
        ax_r.hlines(m, i - 0.3, i + 0.3, color=BLACK, linewidth=0.9, zorder=4)
    first = anchors[0]
    ax_r.text(0.12, first["gasUsed"] / 1000, "first anchor", fontsize=7, va="center")
    ax_r.set_xticks(range(len(sizes)))
    ax_r.set_xticklabels([str(s) for s in sizes])
    ax_r.set_xlim(-0.5, len(sizes) - 0.5)
    ax_r.set_ylim(70, 96)
    ax_r.set_xlabel("Entries per batch")
    ax_r.set_ylabel("Gas used (thousands)")
    grid(ax_r, "y")
    ax_r.set_title("(b)", fontsize=8, loc="left")
    save(fig, "fig_chain_latency")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    fig_evacuation()
    fig_fusion()
    fig_replay_michaung()
    fig_tamper()
    fig_scale()
    fig_chain_latency()
    names = ["fig_evacuation", "fig_fusion", "fig_replay_michaung", "fig_tamper", "fig_scale", "fig_chain_latency"]
    files = [OUT / f"{n}.{ext}" for n in names for ext in ("pdf", "png")]
    missing = [str(p) for p in files if not p.exists()]
    if missing:
        raise SystemExit(f"missing outputs: {missing}")
    print(f"wrote {len(files)} files to {OUT}")


if __name__ == "__main__":
    main()
