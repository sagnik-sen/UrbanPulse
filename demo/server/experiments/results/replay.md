# Historical rainfall replay

Rainfall: Open-Meteo Historical Weather API, ERA5 reanalysis, CC BY 4.0 (https://open-meteo.com/). Hourly precipitation at the six zone centroids, IST.
Documented flooding is day resolution only (experiments/data/flood-timeline.json); no hour-level public timeline was found. All times in this report are IST hour labels from the data.

## Models

- **Model A, rate model (the live app's rule).** Per zone, each 2-minute tick: storm = storm × 0.97 + mmPerHour × 0.15, starting at 0; level = base + storm. Rain is constant within each hour (30 ticks). Warning at level ≥ 40, danger at level ≥ 70. There are no random bursts or oscillation. The state is taken at the last tick of each hour. Steady state under a constant rate r is base + 5 × r. Threshold comparisons allow 1e-9 for float rounding.
- **Model B, 24-hour accumulation (IMD categories).** At each hour h, S = sum of the zone's rain over hours h−23..h (null = 0; fewer hours at the start of a window). Warning at S ≥ 64.5 mm ("heavy rain"), danger at S ≥ 115.6 mm ("very heavy rain"). Cite: India Meteorological Department rainfall intensity categories for 24-hour totals.
- **Release alert (2015 only, both models).** The downstream zones of Chembarambakkam (adyar, tnagar, mylapore) are forced to danger and warning for the release hour (2015-12-01 20:00 IST), and the model takes over afterwards. Model A also adds releaseImpact(29000) = 35 to those zones' storm at the start of that hour; that is in the A row too. The state is sampled at the hour's last tick, when 0.97^30 ≈ 0.40 of the impact remains (about 14 of 35). Model B has no level and no impact term. Rows marked "+ release alert" include the forced alert.
- **Edges and lead.** A rising edge is a transition from safe to alert; the window starts in the safe state. Lead = flood day 00:00 IST minus the first danger time, in hours (positive = before the flood day began). "Before day end" = first danger earlier than the flood day's 24:00.

## Cyclone Michaung, Chennai (December 2023)

Flood day 2023-12-04 (IST). Documented zones: velachery, pallikaranai. Window 2023-11-28 00:00 to 2023-12-10 23:00 (312 h).

Documented facts (flood-timeline.json):

- Torrential rain from the weekend of 2-3 December continued until Tuesday 5 December. Source: https://www.dtnext.in/amp/story/edit/editorial-let-it-go-let-it-flow-752557
- Velachery bore the brunt of the deluge on Monday 4 December; Pallikaranai among the affected suburbs. Source: https://citizenmatters.in/devastation-storm-chennai-cyclone-michaung-monsoon-flooding-36477
- Velachery, Pallikaranai and surroundings still heavily waterlogged on 5 December; waterlogging persisted on 7 December. Source: https://citizenmatters.in/devastation-storm-chennai-cyclone-michaung-monsoon-flooding-36477
- Sphere India situation report 1 on Cyclone Michaung, 4 December 2023. Source: https://www.sphereindia.org.in/sites/default/files/2023-12/SitRep-1_CycloneMichaung_04-12-23.pdf

| Zone | Documented | A warn | A danger | A danger edges | A lead (h) | B warn | B danger | B danger edges | B lead (h) |
|---|---|---|---|---:|---:|---|---|---:|---:|
| Pallikaranai Marshland | yes | 2023-11-28 02:00 | 2023-12-04 07:00 | 1 | -7.0 (yes) | 2023-12-04 08:00 | 2023-12-04 15:00 | 1 | -15.0 (yes) |
| Velachery | yes | 2023-11-28 00:00 | 2023-12-03 02:00 | 2 | +22.0 (yes) | 2023-12-03 09:00 | 2023-12-04 14:00 | 1 | -14.0 (yes) |
| OMR (Sholinganallur) | no | 2023-11-28 20:00 | 2023-12-04 08:00 | 2 | n/a | 2023-12-04 08:00 | 2023-12-04 15:00 | 1 | n/a |
| T Nagar | no | 2023-12-02 21:00 | 2023-12-04 06:00 | 3 | n/a | 2023-12-04 06:00 | 2023-12-04 08:00 | 1 | n/a |
| Adyar | no | 2023-12-02 21:00 | 2023-12-04 06:00 | 2 | n/a | 2023-12-04 06:00 | 2023-12-04 08:00 | 1 | n/a |
| Mylapore | no | 2023-12-02 18:00 | 2023-12-04 06:00 | 1 | n/a | 2023-12-04 06:00 | 2023-12-04 08:00 | 1 | n/a |

## Chennai floods (November-December 2015)

Flood day 2015-12-02 (IST). Documented zones: adyar, tnagar, mylapore. Window 2015-11-25 00:00 to 2015-12-08 23:00 (336 h).
Release: chembarambakkam, 29,000 cusecs at 2015-12-01 20:00 IST; the timeline records officialWarning 2015-12-02 00:00.

Documented facts (flood-timeline.json):

- Chennai city received more than 30 cm of rainfall on 1 December 2015. Source: https://kygcms.tn.gov.in/cms_migrated/document/press_release/pn131215_188.pdf
- Corporation officials say they were informed of the 29,000 cusecs release at about 8 pm on 1 December; a petitioner told the High Court the flood warning was issued only at midnight. Source: https://thewire.in/government/as-chennai-flooded-officials-fiddled
- The city flooded on 2 December after the release of 29,000 cusecs from Chembarambakkam into the Adyar. Source: https://www.deccanherald.com/national/south/memories-of-2015-floods-return-to-haunt-chennai-as-excess-water-from-chembarambakkam-released-919868.html
- CAG performance audit of flood management and response in Chennai (Report No. 4 of 2017). Source: https://cag.gov.in/uploads/download_audit_report/2016/Chapter_1_Introduction_of_Report_No_4_of_2017_-_Performance_Audit_of_Flood_Management_and_Response_in_Che.pdf

| Zone | Documented | A warn | A danger | A danger edges | A lead (h) | B warn | B danger | B danger edges | B lead (h) |
|---|---|---|---|---:|---:|---|---|---:|---:|
| Pallikaranai Marshland | no | 2015-11-29 12:00 | — | 0 | n/a | — | — | 0 | n/a |
| Velachery | no | 2015-11-25 00:00 | — | 0 | n/a | — | — | 0 | n/a |
| OMR (Sholinganallur) | no | 2015-11-29 16:00 | — | 0 | n/a | — | — | 0 | n/a |
| T Nagar | yes | 2015-12-01 00:00 | — | 0 | — (no) | — | — | 0 | — (no) |
| T Nagar + release alert | yes | 2015-12-01 00:00 | 2015-12-01 20:00 | 1 | +4.0 (yes) | 2015-12-01 20:00 | 2015-12-01 20:00 | 1 | +4.0 (yes) |
| Adyar | yes | 2015-12-01 00:00 | — | 0 | — (no) | — | — | 0 | — (no) |
| Adyar + release alert | yes | 2015-12-01 00:00 | 2015-12-01 20:00 | 1 | +4.0 (yes) | 2015-12-01 20:00 | 2015-12-01 20:00 | 1 | +4.0 (yes) |
| Mylapore | yes | 2015-11-29 12:00 | — | 0 | — (no) | — | — | 0 | — (no) |
| Mylapore + release alert | yes | 2015-11-29 12:00 | 2015-12-01 20:00 | 1 | +4.0 (yes) | 2015-12-01 20:00 | 2015-12-01 20:00 | 1 | +4.0 (yes) |

## Control window (November 2023, assumed flood-free)

Window 2023-11-01 00:00 to 2023-11-25 23:00 (600 h). Control window inside the 2023 northeast monsoon, before the Michaung build-up; treated as having no major flooding (assumption). Every edge below is a false alarm under that assumption.

| Zone | A warning edges | A danger edges | B warning edges | B danger edges | Peak A level | Peak B 24 h (mm) |
|---|---:|---:|---:|---:|---:|---:|
| Pallikaranai Marshland | 35 | 0 | 0 | 0 | 65.9 | 56.6 |
| Velachery | 1 | 2 | 0 | 0 | 85.8 | 60.0 |
| OMR (Sholinganallur) | 29 | 0 | 0 | 0 | 60.9 | 56.6 |
| T Nagar | 14 | 0 | 0 | 0 | 64.3 | 60.4 |
| Adyar | 19 | 0 | 0 | 0 | 67.3 | 60.4 |
| Mylapore | 32 | 1 | 0 | 0 | 71.3 | 60.4 |

## Rainfall check (reanalysis vs documented totals)

| Event | Measure | Data (mm) | Where, ends (IST) | Documented (mm) | Data ÷ documented |
|---|---|---:|---|---:|---:|
| Michaung | Max 24 h, any zone | 237.6 | adyar, 2023-12-05 01:00 | — | — |
| Michaung | Max 48 h, any zone (vs "over 40 cm in about 48 hours") | 295.9 | adyar, 2023-12-05 02:00 | 400 | 0.74 |
| Chennai 2015 | Max 24 h, any zone | 63.3 | adyar, 2015-12-03 02:00 | — | — |
| Chennai 2015 | 2015-12-01 calendar day, any zone (vs "more than 30 cm of rainfall on 1 December 2015") | 48.8 | adyar | 300 | 0.16 |

Sources: Michaung figure, https://www.deccanherald.com/amp/story/india%2Ftamil-nadu%2Ffloating-cars-submerged-localities-chennai-battles-floods-in-the-wake-of-cyclone-michuang-2796547; 2015 figure, https://kygcms.tn.gov.in/cms_migrated/document/press_release/pn131215_188.pdf. Both documented figures are lower bounds ("over", "more than"), so the ratios are upper bounds on the coverage. Where zones share one series (see Limitations), the zone named is the first of the tied zones.

## Limitations

- Ground truth is day-resolution only. Lead times are measured to 00:00 IST of the documented flood day, so they are coarse by up to one day.
- ERA5 reanalysis underestimates peak rainfall (see the rainfall check). The alerts are therefore driven by smoothed rainfall, and the replay cannot say what gauge-based rainfall would have triggered.
- Zone-level grid cells: Cyclone Michaung, Chennai (December 2023): 3 distinct rainfall series across 6 zones; identical: adyar = mylapore = tnagar; omr = pallikaranai. Chennai floods (November-December 2015): 1 distinct rainfall series across 6 zones; identical: adyar = mylapore = omr = pallikaranai = tnagar = velachery. Control window (November 2023, assumed flood-free): 3 distinct rainfall series across 6 zones; identical: adyar = mylapore = tnagar; omr = pallikaranai. Zones with identical series receive identical alerts by construction and are not independent evidence.
- Model A is a toy level model with the live app's constants: no random bursts, no oscillation and no noise, and base levels taken from ZONE_DEFS. Velachery's base (40) equals the warning threshold, so Model A warns from the first hour of every window.
- Alert times are the data's hourly labels. Whether a label marks the start or the end of the hour it accumulates is not checked offline, so every alert time is uncertain by up to one hour.
- The control window (2023-11-01 to 2023-11-25) is assumed to contain no major flooding. Control edges are false alarms only under that assumption.
- Model B sums at the start of each window use fewer than 24 hours of data.
- The reservoir release effect is a simulation constant (releaseImpact), not a hydrological model, and the release alert is forced for one hour only. The officialWarning time in the timeline is not modelled.

