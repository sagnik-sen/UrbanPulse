# Flood relief: walk-in queues versus scheduled slots

200 seeds, each with 2000 households in one zone served by 2 ration shops at 60 households an hour each, over 3 collection days. Values: mean ± 95% CI over seeds (n = seeds). Lower is better for waits, queues and unserved; higher is better for first-visit service.

Background: after Cyclone Michaung (December 2023) Tamil Nadu paid Rs 6,000 per ration card to about 24.25 lakh families (Rs 1,486 crore). Families collected cash at their ration shop on a token's date and time; people without tokens had to apply at the shops, and there were queues and "chaos in PDS shops". Sources: https://www.dtnext.in/news/chennai/cyclonic-michaung-cm-stalin-launches-rs-6000-one-time-assistance-scheme-754998 and https://www.outlookindia.com/national/tamil-nadu-govt-to-provide-rs-6-000-flood-relief-to-ration-cardholders-in-4-flood-affected-districts-news-336002 .

Runtime: 0.3 s on this machine.

## Results

| Arm | Mean wait in queue (min, all households) | p90 wait in queue (min) | Max queue at any shop (people) | % unserved after 3 days | % served on first visit |
|---|---:|---:|---:|---:|---:|
| walk-in | 217.0 ± 0.5 (n=200) | 395.6 ± 1.1 (n=200) | 658.5 ± 1.8 (n=200) | 2.15 ± 0.08 (n=200) | 35.97 ± 0.01 (n=200) |
| scheduled | 10.8 ± 0.2 (n=200) | 14.1 ± 0.3 (n=200) | 21.4 ± 0.4 (n=200) | 0.00 ± 0.00 (n=200) | 97.93 ± 0.04 (n=200) |

## Assumptions

- Shops and rates are ILLUSTRATIVE: one zone, two shops, 60 households an hour each. Real ration shop throughput was not measured.
- Households: 2,000 in the zone, each with one card and one payment to collect. No households are lost to no-shows, duplicate cards or wrong shops.
- Service: one household at a time per shop, 60 / perHour minutes each (1 minute here), first come first served. A service starts only while the shop is open: 9:00 to 13:00 and 15:00 to 17:00 (six service hours a day, as in the 2023 scheme).
- Lunch break: a household that arrives between 13:00 and 15:00 waits in the queue until 15:00. Walk-in arrivals are drawn over the whole 9:00 to 17:00 window as the task specifies, so they include the break.
- Walk-in arrivals: on day 1 every household arrives at a uniform random minute between 9:00 and 17:00 at a uniform random shop of the zone. Households not served by 17:00 leave and come back next day under the same rule.
- Scheduled arrivals: schedule() from relief.js assigns each household a shop and a day and hour before anyone arrives (3 days, the same 9:00 to 17:00 service hours as the walk-in arm). Each household arrives at a uniform random minute within its assigned hour, at its assigned shop, on its assigned day.
- Scheduled return rule: a household not served by 17:00 on its assigned day comes back the next day at a uniform random time between 9:00 and 17:00 at a uniform random shop, the same rule as walk-ins. The schedule is not rebuilt after the first day.
- Three days: a household still unserved at 17:00 on day 3 counts as unserved after 3 days. There is no fourth day.
- Wait in queue (primary): for each household, the sum over all its visits of the minutes from arrival to the start of service, or to 17:00 for a visit that ends unserved. This includes the break and every overnight return's waiting until closing, but not the time between a return and the next visit. The metric is the mean and p90 over all 2,000 households, served or not.
- Max queue: the largest number of people at one shop who have arrived but not yet started service, measured at each arrival, over all shops and days. People waiting through the break count.
- Unserved after 3 days: the percentage of households never served by the end of day 3.
- Served on first visit: the percentage of households served on their first visit (day 1 for walk-in, the assigned day for scheduled).
- Draws: each arm has its own random stream per seed (seed-specific, not shared), so the arms are compared across seeds, not on identical arrivals. The scheduled assignment (shop, day, hour) is identical in every seed because schedule() is deterministic; only arrival minutes vary.
- CI: mean ± 1.96 sd / sqrt(n) across the 200 seeds, the convention of run.js and rescue.js.
- Not modelled: travel time to the shop, identity checks, staff breaks, power or system outages, shop closures, and any household that gives up.

## Parameters

Households 2000; shops 2 at 60 an hour; service hours 9:00-13:00 and 15:00-17:00; days 3; seeds 200.
