# Blockchain anchoring benchmark

- Date: 2026-10-14T19:46:00.614Z
- Network: Shardeum Mezame testnet (chain 8119)
- Benchmark contract: 0xcbb98f30d5b49932E0A75a21626dDa618C93aE0d, a fresh AuditAnchor deployed for this run. The audit ledger was not used.
- Deploy tx: 0xc20196e64c22348850e9578ad1458ecbea6faf42f288bd4028649ba04615d596 (582362 gas, 670.9 SHM)
- Anchors: 20 of 20 succeeded

## Per-anchor results

| # | Entries in batch | Latency (s) | Gas used | Gas price (gwei) | Cost (SHM) | Block | Tx hash or error |
|---|---|---|---|---|---|---|---|
| 1 | 1 | 2.51 | 93146 | 1152073.28 | 107.3 | 8230200 | 0x72962dd079039c43c98bd29aa70a7bb0484edbd127bf5ee60dc1347362dbec93 |
| 2 | 10 | 7.96 | 76046 | 1152073.28 | 87.61 | 8230201 | 0x661d15dd5922870c96f7b08a7835c85c0ae2d3d598fa61bcb7a30c98ce2c75b8 |
| 3 | 100 | 2.34 | 76046 | 1152073.28 | 87.61 | 8230202 | 0x8dedb9071c502bb76ff166c5607d008701f988b11bd14ec30c039b138f21fe56 |
| 4 | 500 | 4.74 | 76058 | 1152073.28 | 87.62 | 8230203 | 0xfdc931decc8df2b54814eb8c6898c8cedff590d202d6aea053e638e5fa7d3bc2 |
| 5 | 1 | 7.93 | 76046 | 1152073.28 | 87.61 | 8230204 | 0x65b98805e1598a60ba815c098aa75f5842119055315a5183045735ae15724abb |
| 6 | 10 | 3.10 | 76046 | 1152073.28 | 87.61 | 8230205 | 0x7409935a2aa5c97e0b68080ba330183323d656a117054a898686e949f4609940 |
| 7 | 100 | 4.71 | 76046 | 1152073.28 | 87.61 | 8230206 | 0x2fb5eebecd62f23a5bdc5d26b1a356e689de4b6745e70b71345f53f3ff0ba8d6 |
| 8 | 500 | 7.91 | 76058 | 1152073.28 | 87.62 | 8230207 | 0x8ac4b10dc636c0956b6f925eee5054eb08870fb7635a231f1d4f10d3a6e4d2eb |
| 9 | 1 | 2.30 | 76046 | 1152073.28 | 87.61 | 8230208 | 0xa9a7c80841fc7c6c16efb1a815456ffc0298a40afea2dbd61294350b41ea8bc1 |
| 10 | 10 | 4.74 | 76046 | 1152073.28 | 87.61 | 8230209 | 0x8101cd8c2452e7012ae6baf9470fb51f524bf83b252339d6a03490c36fecfd19 |
| 11 | 100 | 7.92 | 76046 | 1152073.28 | 87.61 | 8230210 | 0x063dddad6aa78ef909d3f8b80a4d8d8020c1e0789871cbbf60f62acda7c576b2 |
| 12 | 500 | 2.43 | 76058 | 1152073.28 | 87.62 | 8230211 | 0x1b225aab4c5a954562fb99f08255572f623d6137fe18f7bf08a0f4a3e870f333 |
| 13 | 1 | 7.96 | 76046 | 1152073.28 | 87.61 | 8230212 | 0x803ba613bad440123464447d1238977bb98548246ee9473411d097ff1bc2b9dc |
| 14 | 10 | 2.33 | 76046 | 1152073.28 | 87.61 | 8230213 | 0x0e05d4b6b0f507cf6ec29d6a199a06a6b3e905c4fa42c1b8be14f2f64f056738 |
| 15 | 100 | 4.74 | 76046 | 1152073.28 | 87.61 | 8230214 | 0x578938aea660f875b8652c8c5d65e72c42188ff664751787129f8216dffd317a |
| 16 | 500 | 4.82 | 76058 | 1152073.28 | 87.62 | 8230215 | 0x06cee9bffe7817f028e83063ab30f45782638b2bb6e885e04022b52646a901bc |
| 17 | 1 | 8.09 | 76046 | 1152073.28 | 87.61 | 8230216 | 0x9473d1402e27575800f5a8658616cbd1a8d3bb09335efa1854ef7cf870901669 |
| 18 | 10 | 2.49 | 76046 | 1152073.28 | 87.61 | 8230217 | 0x5e93a30bfcacdf4afd1b1e7afd26334c6426c64a2f40531fa583db451b1ccabf |
| 19 | 100 | 4.87 | 76034 | 1152073.28 | 87.6 | 8230218 | 0x0316da271deb2aaaedbe1c1faa916df66170c8cdf0d990eec2c1b8238ee50510 |
| 20 | 500 | 4.93 | 76058 | 1152073.28 | 87.62 | 8230219 | 0xdc1cb6c10edec2c11e7641a9baa443078e0875a423b42e87a54cb1e3f7c81ba5 |

## Summary

| Latency (s) | Min | Median | P90 | Max |
|---|---|---|---|---|
| Send to receipt | 2.30 | 4.74 | 7.96 | 8.09 |

- Mean gas used: 76903
- Mean gas price: 1152073.28 gwei
- Mean cost: 88.6 SHM per anchor

### Gas by batch size

| Entries in batch | Anchors | Mean gas |
|---|---|---|
| 1 | 5 | 79466 |
| 10 | 5 | 76046 |
| 100 | 5 | 76044 |
| 500 | 5 | 76058 |

## Cost per day

Shardeum cost is measured: mean gas used × mean gas price from this run (76903 gas, 1152073.28 gwei).
Estimates (2026-10-14, same mean gas): Ethereum mainnet at 1 gwei and $2470 per ETH; Polygon PoS at 330 gwei and $0.1 per POL. Gas prices and token prices are inputs you entered, not measurements.

| Entries/day | Strategy | Transactions/day | Shardeum (SHM/day, measured) | Ethereum mainnet (USD/day, est.) | Polygon PoS (USD/day, est.) |
|---|---|---|---|---|---|
| 1,000 | Per-entry anchoring | 1,000 | 88,600 | 190 | 2.538 |
| 1,000 | Batched every 5 min | 288 | 25,520 | 54.71 | 0.7309 |
| 10,000 | Per-entry anchoring | 10,000 | 886,000 | 1,900 | 25.38 |
| 10,000 | Batched every 5 min | 288 | 25,520 | 54.71 | 0.7309 |
| 100,000 | Per-entry anchoring | 100,000 | 8,860,000 | 19,000 | 253.8 |
| 100,000 | Batched every 5 min | 288 | 25,520 | 54.71 | 0.7309 |

Batched: 288 five-minute windows a day. Each window needs ceil(entries in window / 500) batches, and at these volumes that is one batch per window.
