"""Paper Fig. 1: runtime architecture of the UrbanPulse Chennai prototype.

    demo/figures/.venv/bin/python demo/figures/architecture.py

Writes demo/figures/out/fig_architecture.pdf and .png. Line style encodes deployment status:
solid blue = implemented and running, solid green = real external service or dataset,
dashed amber = simulated stand-in, dotted grey = proposed only.
"""
import pathlib

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch

OUT = pathlib.Path(__file__).resolve().parent / "out"
BLUE, BLUE_FILL = "#0072B2", "#E8F1F8"
GREEN, GREEN_FILL = "#009E73", "#E3F4EE"
AMBER, AMBER_FILL = "#E69F00", "#FCF1DE"
GREY, GREY_FILL = "#666666", "#F0F0F0"
ORANGE = "#D55E00"
TXT = "#111111"
plt.rcParams.update({"font.family": "serif", "font.serif": ["DejaVu Serif"], "pdf.fonttype": 42})


def box(ax, x, y, w, h, text, ec, fc, ls="-", fs=9.5, lw=1.4):
    ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0,rounding_size=0.12", ec=ec, fc=fc, lw=lw, ls=ls))
    ax.text(x + w / 2, y + h / 2, text, ha="center", va="center", fontsize=fs, color=TXT, linespacing=1.25)


def arrow(ax, x0, y0, x1, y1, color="#333333", ls="-"):
    ax.annotate("", xy=(x1, y1), xytext=(x0, y0), arrowprops={"arrowstyle": "-|>", "color": color, "lw": 1.3, "ls": ls, "mutation_scale": 11})


def main():
    W, H = 18.2, 10.0
    fig = plt.figure(figsize=(9.1, 5.0))
    ax = fig.add_axes([0, 0, 1, 1])
    ax.set_xlim(0, W)
    ax.set_ylim(0, H)
    ax.axis("off")

    # external services
    ax.text(W / 2, 9.72, "External services and real datasets", ha="center", va="center", fontsize=11, color=GREEN, fontweight="bold")
    ext = [
        (0.15, 4.15, "Open-Meteo\nlive forecast + ERA5 archive"),
        (4.45, 3.05, "OSRM\nroad routing"),
        (7.75, 4.5, "GCC ward boundaries\n(DataMeet, 200 wards)"),
        (12.55, 5.45, "Shardeum Mezame testnet\nAuditAnchor contract"),
    ]
    for x, w, t in ext:
        box(ax, x, 8.62, w, 0.86, t, GREEN, GREEN_FILL)
    arrow(ax, 2.15, 8.6, 2.15, 7.9)
    ax.text(2.3, 8.25, "rain, weather, 10 min", fontsize=8, va="center", color="#333333")
    arrow(ax, 5.97, 8.6, 5.97, 7.9)
    arrow(ax, 10.0, 8.6, 10.0, 7.9)
    arrow(ax, 14.5, 7.9, 14.5, 8.6, color=ORANGE)
    ax.text(14.35, 8.25, "Merkle roots\nevery 5 min", fontsize=8, ha="right", va="center", color=ORANGE)
    arrow(ax, 16.0, 8.6, 16.0, 7.9, color=ORANGE, ls="--")
    ax.text(16.15, 8.25, "verify", fontsize=8, va="center", color=ORANGE)

    # server
    ax.add_patch(FancyBboxPatch((0.15, 3.25), W - 0.3, 4.62, boxstyle="round,pad=0,rounding_size=0.15", ec=BLUE, fc="#F5F9FC", lw=2))
    ax.text(0.45, 7.52, "Node.js server   ·   Express 5 + Socket.IO + node:sqlite   ·   2 s tick = 2 simulated minutes", fontsize=10.5, color=BLUE, fontweight="bold", va="center")
    rows = [
        ["Damped-trend\nlevel forecast + risk", "XGBoost\nheavy-rain risk", "IMD 24 h rule,\nincidents, alerts", "Sensor + report\nfusion (log-odds)", "Evacuation planner\nmin-cost max-flow", "Boat rescue, relief,\ncheck-in, SMS logic"],
        ["SQLite store,\nappend-only audit", "Merkle batching\nand anchoring", "Public trust\nledger, verify all", "Auth, roles,\nrate limits", "Time machine\n2015 / 2023 replay", "Accountability\ntimelines"],
    ]
    bw, gap, x0 = 2.83, 0.09, 0.45
    for r, (y, labels) in enumerate(zip([5.95, 4.95], rows)):
        for i, t in enumerate(labels):
            box(ax, x0 + i * (bw + gap), y, bw, 0.86, t, BLUE, BLUE_FILL, fs=9)
    box(ax, 0.45, 3.45, 8.55, 0.95, "Water-level sensor model  —  SIMULATED\n(seeded stand-in for IoT hardware)", AMBER, AMBER_FILL, ls="--", fs=9)
    box(ax, 9.2, 3.45, 8.55, 0.95, "SMS command service  —  SIMULATED\n(no message leaves the server)", AMBER, AMBER_FILL, ls="--", fs=9)

    # clients
    clients = [(0.15, 5.75, "GCC command centre (React)\nsigned-in staff"), (6.15, 5.75, "Citizen PWA, English / Tamil\noffline cache, reports, rescue"), (12.15, 5.9, "Static verifier page\nchecks a sealed alert, no server")]
    for x, w, t in clients:
        box(ax, x, 1.75, w, 0.9, t, BLUE, BLUE_FILL, fs=9.5)
    for x in (2.4, 8.4):
        arrow(ax, x, 2.67, x, 3.23, ls="--")
        arrow(ax, x + 1.1, 3.23, x + 1.1, 2.67)
    ax.text(12.15, 2.95, "REST  /  Socket.IO", fontsize=8.5, color="#333333", va="center")
    ax.text(15.1, 1.55, "reads the contract directly (no server)", fontsize=8, color=ORANGE, ha="center", va="center")

    # proposed band
    ax.add_patch(FancyBboxPatch((0.15, 0.55), W - 0.3, 0.82, boxstyle="round,pad=0,rounding_size=0.12", ec=GREY, fc=GREY_FILL, lw=1.4, ls=":"))
    ax.text(W / 2, 1.16, "PROPOSED, NOT BUILT AND NOT EVALUATED", ha="center", va="center", fontsize=9, color=TXT)
    ax.text(W / 2, 0.82, "physical IoT water-level sensing  ·  MQTT / LoRaWAN / 5G  ·  Kafka + PostgreSQL  ·  cloud hosting  ·  learned water-level forecaster (LSTM)", ha="center", va="center", fontsize=8.5, color=TXT)

    # legend
    items = [(BLUE, "-", "Implemented and running"), (GREEN, "-", "Real external service or dataset"), (AMBER, "--", "Simulated stand-in"), (GREY, ":", "Proposed only")]
    x = 0.8
    for (color, ls, label), step in zip(items, [4.4, 5.4, 3.7, 0]):
        ax.plot([x, x + 0.6], [0.22, 0.22], color=color, ls=ls, lw=2)
        ax.text(x + 0.75, 0.22, label, fontsize=9, va="center")
        x += step

    OUT.mkdir(exist_ok=True)
    fig.savefig(OUT / "fig_architecture.pdf", metadata={"Creator": None, "Producer": None})
    fig.savefig(OUT / "fig_architecture.png", dpi=300, metadata={"Software": None})


if __name__ == "__main__":
    main()
