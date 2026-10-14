const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const {
  percentile,
  transactionsPerDay,
  costShm,
  gasCostNative,
  estimateUsd,
  summarizeAnchors,
  buildReport,
  renderMarkdown,
  main,
} = require("./chain/bench");

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} is not ${expected}`);

test("percentile interpolates between ranks", () => {
  assert.equal(percentile([5, 1, 3], 50), 3);
  assert.equal(percentile([1, 2, 3, 4], 50), 2.5);
  near(percentile([10, 20, 30, 40], 90), 37);
  assert.equal(percentile([4, 9], 0), 4);
  assert.equal(percentile([4, 9], 100), 9);
  assert.equal(percentile([7], 90), 7);
  assert.equal(percentile([], 50), null);
});

test("transactions per day for each strategy", () => {
  for (const entries of [1000, 10000, 100000]) {
    assert.equal(transactionsPerDay("per-entry", entries), entries);
    assert.equal(transactionsPerDay("batched", entries), 288);
  }
  assert.equal(transactionsPerDay("batched", 288 * 501), 576);
  assert.equal(transactionsPerDay("batched", 0), 0);
});

test("cost conversions", () => {
  near(gasCostNative(76060, 20), 0.0015212);
  near(costShm(76060, 2e10), 0.0015212);
  near(estimateUsd(76060, 20, 3000), 4.5636);
  assert.equal(costShm(null, 2e10), null);
  assert.equal(estimateUsd(76060, null, 3000), null);
});

test("summary ignores failed anchors", () => {
  const anchors = [
    { count: 1, latencyMs: 1000, gasUsed: 70000, gasPriceWei: "10000000000", costShm: 0.0007, error: null },
    { count: 10, latencyMs: 3000, gasUsed: 80000, gasPriceWei: "10000000000", costShm: 0.0008, error: null },
    { count: 100, latencyMs: 2000, gasUsed: 90000, gasPriceWei: "10000000000", costShm: 0.0009, error: null },
    { count: 500, latencyMs: 99999, gasUsed: null, gasPriceWei: null, costShm: null, error: "boom" },
  ];
  const s = summarizeAnchors(anchors);
  assert.equal(s.attempted, 4);
  assert.equal(s.succeeded, 3);
  assert.equal(s.latency.min, 1);
  assert.equal(s.latency.median, 2);
  assert.equal(s.latency.max, 3);
  assert.equal(s.meanGas, 80000);
  assert.equal(s.byCount.find((b) => b.count === 500).n, 0);
});

test("report renders without Ethereum or Polygon columns when no prices are given", () => {
  const data = buildReport({
    generatedAt: "2026-10-15T00:00:00.000Z",
    network: "Shardeum Mezame testnet",
    chainId: 8119,
    dryRun: false,
    bench: { address: "0x1", deployTx: "0x2", deployGas: 1, deployCostShm: 0 },
    anchors: [],
    prices: {},
  });
  const md = renderMarkdown(data);
  assert.match(md, /Shardeum \(SHM\/day, measured\)/);
  assert.doesNotMatch(md, /Ethereum mainnet \(USD/);
  assert.doesNotMatch(md, /Polygon PoS \(USD/);
});

test("dry run renders the report without touching the filesystem", async () => {
  const lines = [];
  const writeFileSync = fs.writeFileSync;
  const mkdirSync = fs.mkdirSync;
  const refuse = () => {
    throw new Error("dry run touched the filesystem");
  };
  try {
    fs.writeFileSync = refuse;
    fs.mkdirSync = refuse;
    await main(["--dry-run", "--anchors", "6"], {
      log: (line) => lines.push(line),
      write: refuse,
    });
  } finally {
    fs.writeFileSync = writeFileSync;
    fs.mkdirSync = mkdirSync;
  }
  const out = lines.join("\n");
  assert.match(out, /DRY RUN/);
  assert.match(out, /Per-entry anchoring/);
  assert.match(out, /Batched every 5 min/);
  assert.match(out, /Ethereum mainnet/);
  assert.match(out, /Polygon PoS/);
});
