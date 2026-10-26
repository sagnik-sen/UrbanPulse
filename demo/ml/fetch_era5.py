"""Download the ERA5 hourly weather the heavy-rain model is trained on.

    demo/ml/.venv/bin/python demo/ml/fetch_era5.py

Source: Open-Meteo Historical Weather API, ERA5 reanalysis (models=era5), CC BY 4.0, https://open-meteo.com/.
Cells: the 3 x 3 block of 0.25-degree ERA5 cells around Chennai. All six demo zones fall in the centre
cell (13.0 N, 80.25 E); the other eight add training examples. Times are IST hour labels.
Writes demo/ml/data/era5_<lat>_<lng>.json (git-ignored; about 6 MB each). Re-running skips cells already saved.
"""
import json
import pathlib
import time
import urllib.parse
import urllib.request

START, END = "2000-01-01", "2024-12-31"
LATS = [12.75, 13.0, 13.25]
LNGS = [80.0, 80.25, 80.5]
VARS = ["precipitation", "pressure_msl", "relative_humidity_2m", "cloud_cover", "wind_speed_10m", "wind_direction_10m"]
OUT = pathlib.Path(__file__).parent / "data"


def fetch(lat, lng, start, end):
    q = urllib.parse.urlencode({
        "latitude": lat, "longitude": lng, "start_date": start, "end_date": end,
        "hourly": ",".join(VARS), "models": "era5", "timezone": "Asia/Kolkata",
    })
    for attempt in range(5):
        try:
            with urllib.request.urlopen(f"https://archive-api.open-meteo.com/v1/archive?{q}", timeout=120) as r:
                return json.load(r)
        except Exception as err:  # rate limit or timeout: back off and retry
            print(f"  retry {attempt + 1}: {err}")
            time.sleep(30 * (attempt + 1))
    raise RuntimeError(f"could not fetch {lat},{lng} {start}..{end}")


def main():
    OUT.mkdir(exist_ok=True)
    for lat in LATS:
        for lng in LNGS:
            path = OUT / f"era5_{lat}_{lng}.json"
            if path.exists():
                continue
            print(f"cell {lat}, {lng}")
            series = {"time": [], **{v: [] for v in VARS}}
            for y0 in range(int(START[:4]), int(END[:4]) + 1, 5):
                d = fetch(lat, lng, f"{y0}-01-01", f"{min(y0 + 4, int(END[:4]))}-12-31")
                for k in series:
                    series[k] += d["hourly"][k]
                time.sleep(2)
            series["cell"] = [d["latitude"], d["longitude"]]
            path.write_text(json.dumps(series, separators=(",", ":")))


if __name__ == "__main__":
    main()
