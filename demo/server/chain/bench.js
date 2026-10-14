// Measures AuditAnchor.anchor() on Shardeum (latency, gas, cost) and projects a day's cost for two strategies.
// It deploys its own throwaway contract, so the audit ledger in deployment.json never gets benchmark batches.
//   node chain/bench.js [--anchors 20] [--eth-gwei G --eth-usd P] [--polygon-gwei G --pol-usd P] [--out chain-bench] [--dry-run]
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { ContractFactory, JsonRpcProvider, Wallet, hexlify } = require("ethers");

const COUNTS = [1, 10, 100, 500];
const BENCH_NAME = "UrbanPulse benchmark (not the audit ledger)";
const RESULTS_DIR = path.join(__dirname, "..", "experiments", "results");
const WINDOWS_PER_DAY = 288;
const BATCH_CAP = 500;
const ENTRY_DAYS = [1000, 10000, 100000];
const STRATEGIES = [
  { key: "per-entry", name: "Per-entry anchoring" },
  { key: "batched", name: "Batched every 5 min" },
];
const FAKE_PRICES = { ethGwei: 20, ethUsd: 3000, polGwei: 30, polUsd: 0.25 };

function percentile(values, p) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = ((sorted.length - 1) * p) / 100;
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  return sorted[lo] + (rank - lo) * (sorted[hi] - sorted[lo]);
}

const mean = (values) => (values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null);

function transactionsPerDay(strategy, entries) {
  if (strategy === "per-entry") return entries;
  return WINDOWS_PER_DAY * Math.ceil(entries / WINDOWS_PER_DAY / BATCH_CAP);
}

// gas price is in wei; result is SHM (18 decimals)
function costShm(gasUsed, gasPriceWei) {
  if (gasUsed == null || gasPriceWei == null) return null;
  return (gasUsed * Number(gasPriceWei)) / 1e18;
}

// gas price is in gwei; result is the native token (ETH, POL)
function gasCostNative(gasUsed, gwei) {
  return (gasUsed * gwei) / 1e9;
}

function estimateUsd(gasUsed, gwei, usdPerToken) {
  if (gasUsed == null || gwei == null || usdPerToken == null) return null;
  return gasCostNative(gasUsed, gwei) * usdPerToken;
}

function summarizeAnchors(anchors) {
  const ok = anchors.filter((a) => !a.error);
  const latencies = ok.map((a) => a.latencyMs / 1000);
  const gas = ok.map((a) => a.gasUsed);
  const costs = ok.map((a) => a.costShm).filter((c) => c != null);
  const prices = ok.map((a) => a.gasPriceWei).filter((p) => p != null).map(Number);
  return {
    attempted: anchors.length,
    succeeded: ok.length,
    latency: {
      min: percentile(latencies, 0),
      median: percentile(latencies, 50),
      p90: percentile(latencies, 90),
      max: percentile(latencies, 100),
    },
    meanGas: mean(gas),
    meanCostShm: mean(costs),
    meanGasPriceWei: mean(prices),
    byCount: COUNTS.map((count) => {
      const g = ok.filter((a) => a.count === count).map((a) => a.gasUsed);
      return { count, n: g.length, meanGas: mean(g) };
    }),
  };
}

function comparisonRows(summary, prices) {
  const shmPerTx = costShm(summary.meanGas, summary.meanGasPriceWei);
  const ethPerTx = estimateUsd(summary.meanGas, prices.ethGwei, prices.ethUsd);
  const polPerTx = estimateUsd(summary.meanGas, prices.polGwei, prices.polUsd);
  const times = (n, perTx) => (perTx == null ? null : n * perTx);
  const rows = [];
  for (const entries of ENTRY_DAYS) {
    for (const s of STRATEGIES) {
      const txs = transactionsPerDay(s.key, entries);
      rows.push({ entries, strategy: s.name, txs, shm: times(txs, shmPerTx), eth: times(txs, ethPerTx), pol: times(txs, polPerTx) });
    }
  }
  return rows;
}

function buildReport(input) {
  const summary = summarizeAnchors(input.anchors);
  return { ...input, summary, comparison: comparisonRows(summary, input.prices) };
}

const sig = (x) => (x == null ? "-" : Number(x).toLocaleString("en-US", { maximumSignificantDigits: 4 }));
const fixed2 = (x) => (x == null ? "-" : Number(x).toFixed(2));
const gwei = (wei) => (wei == null ? "-" : (Number(wei) / 1e9).toFixed(2));
const clean = (s) => String(s).replace(/\|/g, "/").replace(/\n/g, " ");

function renderMarkdown(d) {
  const s = d.summary;
  const hasEth = d.prices.ethGwei != null && d.prices.ethUsd != null;
  const hasPol = d.prices.polGwei != null && d.prices.polUsd != null;
  const day = d.generatedAt.slice(0, 10);
  const gas = s.meanGas == null ? "-" : Math.round(s.meanGas);
  const L = ["# Blockchain anchoring benchmark", ""];
  if (d.dryRun) L.push("**DRY RUN: every number in this report is made up to show the layout. Nothing was sent to any network.**", "");
  L.push(
    `- Date: ${d.generatedAt}`,
    `- Network: ${d.network} (chain ${d.chainId})`,
    `- Benchmark contract: ${d.bench.address}, a fresh AuditAnchor deployed for this run. The audit ledger was not used.`,
    `- Deploy tx: ${d.bench.deployTx} (${d.bench.deployGas} gas, ${sig(d.bench.deployCostShm)} SHM)`,
    `- Anchors: ${s.succeeded} of ${s.attempted} succeeded`,
    "",
    "## Per-anchor results",
    "",
    "| # | Entries in batch | Latency (s) | Gas used | Gas price (gwei) | Cost (SHM) | Block | Tx hash or error |",
    "|---|---|---|---|---|---|---|---|",
  );
  for (const a of d.anchors) {
    const latency = fixed2(a.latencyMs / 1000);
    L.push(a.error
      ? `| ${a.index} | ${a.count} | ${latency} | - | - | - | - | error: ${clean(a.error)} |`
      : `| ${a.index} | ${a.count} | ${latency} | ${a.gasUsed} | ${gwei(a.gasPriceWei)} | ${sig(a.costShm)} | ${a.block} | ${a.hash} |`);
  }
  L.push(
    "",
    "## Summary",
    "",
    "| Latency (s) | Min | Median | P90 | Max |",
    "|---|---|---|---|---|",
    `| Send to receipt | ${fixed2(s.latency.min)} | ${fixed2(s.latency.median)} | ${fixed2(s.latency.p90)} | ${fixed2(s.latency.max)} |`,
    "",
    `- Mean gas used: ${gas}`,
    `- Mean gas price: ${gwei(s.meanGasPriceWei)} gwei`,
    `- Mean cost: ${sig(s.meanCostShm)} SHM per anchor`,
    "",
    "### Gas by batch size",
    "",
    "| Entries in batch | Anchors | Mean gas |",
    "|---|---|---|",
    ...s.byCount.map((b) => `| ${b.count} | ${b.n} | ${b.meanGas == null ? "-" : Math.round(b.meanGas)} |`),
    "",
    "## Cost per day",
    "",
    `Shardeum cost is measured: mean gas used × mean gas price from this run (${gas} gas, ${gwei(s.meanGasPriceWei)} gwei).`,
  );
  const estimates = [
    hasEth && `Ethereum mainnet at ${d.prices.ethGwei} gwei and $${d.prices.ethUsd} per ETH`,
    hasPol && `Polygon PoS at ${d.prices.polGwei} gwei and $${d.prices.polUsd} per POL`,
  ].filter(Boolean);
  L.push(estimates.length
    ? `Estimates (${day}, same mean gas): ${estimates.join("; ")}. Gas prices and token prices are inputs you entered, not measurements.`
    : "Ethereum and Polygon estimates are omitted. Pass --eth-gwei with --eth-usd, and/or --polygon-gwei with --pol-usd, to add them.");
  const head = ["Entries/day", "Strategy", "Transactions/day", "Shardeum (SHM/day, measured)"];
  if (hasEth) head.push("Ethereum mainnet (USD/day, est.)");
  if (hasPol) head.push("Polygon PoS (USD/day, est.)");
  L.push("", `| ${head.join(" | ")} |`, `|${head.map(() => "---").join("|")}|`);
  for (const r of d.comparison) {
    const cells = [r.entries.toLocaleString("en-US"), r.strategy, r.txs.toLocaleString("en-US"), sig(r.shm)];
    if (hasEth) cells.push(sig(r.eth));
    if (hasPol) cells.push(sig(r.pol));
    L.push(`| ${cells.join(" | ")} |`);
  }
  L.push(
    "",
    "Batched: 288 five-minute windows a day. Each window needs ceil(entries in window / 500) batches, and at these volumes that is one batch per window.",
    "",
  );
  return L.join("\n");
}

function fakeAnchors(n) {
  return Array.from({ length: n }, (_, i) => {
    const count = COUNTS[i % COUNTS.length];
    const failed = n > 4 && i === 4;
    const gasUsed = failed ? null : 76000 + (i % 3) * 400;
    const gasPriceWei = failed ? null : "10000000000";
    return {
      index: i + 1,
      count,
      latencyMs: 3000 + 250 * (i % 7),
      gasUsed,
      gasPriceWei,
      costShm: costShm(gasUsed, gasPriceWei),
      block: failed ? null : 1000 + i,
      hash: failed ? null : `0x${String(i + 1).padStart(64, "0")}`,
      error: failed ? "replacement transaction underpriced (fake)" : null,
    };
  });
}

function parseArgs(argv) {
  const value = (name) => {
    const i = argv.indexOf(name);
    return i === -1 || argv[i + 1] === undefined || argv[i + 1].startsWith("--") ? undefined : argv[i + 1];
  };
  const number = (name) => {
    const v = value(name);
    if (v === undefined) return undefined;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) throw new Error(`${name} must be a non-negative number`);
    return n;
  };
  const anchors = number("--anchors") ?? 20;
  if (!Number.isInteger(anchors) || anchors < 1) throw new Error("--anchors must be a whole number of at least 1");
  const prices = { ethGwei: number("--eth-gwei"), ethUsd: number("--eth-usd"), polGwei: number("--polygon-gwei"), polUsd: number("--pol-usd") };
  if ((prices.ethGwei == null) !== (prices.ethUsd == null)) throw new Error("give both --eth-gwei and --eth-usd, or neither");
  if ((prices.polGwei == null) !== (prices.polUsd == null)) throw new Error("give both --polygon-gwei and --pol-usd, or neither");
  return { anchors, out: value("--out") ?? "chain-bench", dryRun: argv.includes("--dry-run"), prices };
}

async function runLive(args, io) {
  try { process.loadEnvFile(path.join(__dirname, "..", ".env")); } catch {}
  const key = process.env.SHARDEUM_PRIVATE_KEY;
  if (!key) throw new Error("Set SHARDEUM_PRIVATE_KEY in server/.env");
  const deployment = JSON.parse(fs.readFileSync(path.join(__dirname, "deployment.json"), "utf8"));
  const provider = new JsonRpcProvider(deployment.rpc, deployment.chainId, { staticNetwork: true });
  const wallet = new Wallet(key.trim(), provider);
  const { abi, bytecode } = JSON.parse(fs.readFileSync(path.join(__dirname, "AuditAnchor.json"), "utf8"));

  io.log(`deploying benchmark contract from ${wallet.address}`);
  const bench = await new ContractFactory(abi, bytecode, wallet).deploy(BENCH_NAME);
  const deployTx = bench.deploymentTransaction();
  const deployReceipt = await deployTx.wait(1, 120000);
  const deployGas = Number(deployReceipt.gasUsed);
  const benchInfo = {
    address: await bench.getAddress(),
    deployTx: deployTx.hash,
    deployGas,
    deployCostShm: costShm(deployGas, deployReceipt.gasPrice ?? deployTx.gasPrice),
  };
  io.log(`benchmark contract ${benchInfo.address} (tx ${benchInfo.deployTx})`);

  const anchors = [];
  for (let i = 0; i < args.anchors; i++) {
    const count = COUNTS[i % COUNTS.length];
    const record = { index: i + 1, count, latencyMs: null, gasUsed: null, gasPriceWei: null, costShm: null, block: null, hash: null, error: null };
    const started = Date.now();
    try {
      const tx = await bench.anchor(hexlify(crypto.randomBytes(32)), count);
      record.hash = tx.hash;
      const receipt = await tx.wait(1, 120000);
      if (!receipt) throw new Error("no receipt");
      const price = receipt.gasPrice ?? tx.gasPrice;
      record.gasUsed = Number(receipt.gasUsed);
      record.gasPriceWei = price == null ? null : String(price);
      record.costShm = costShm(record.gasUsed, price);
      record.block = receipt.blockNumber;
    } catch (e) {
      record.error = e.shortMessage || e.message;
    }
    record.latencyMs = Date.now() - started;
    anchors.push(record);
    io.log(`anchor ${i + 1}/${args.anchors} (${count} entries): ${record.error ?? `${record.gasUsed} gas, ${record.latencyMs} ms`}`);
  }

  const data = buildReport({
    generatedAt: new Date().toISOString(),
    network: deployment.network,
    chainId: deployment.chainId,
    dryRun: false,
    bench: benchInfo,
    anchors,
    prices: args.prices,
  });
  const base = path.join(RESULTS_DIR, args.out);
  io.write(`${base}.md`, renderMarkdown(data));
  io.write(`${base}.json`, JSON.stringify(data, null, 2) + "\n");
  io.log(`wrote ${base}.md and ${base}.json`);
}

async function main(argv = process.argv.slice(2), io = { log: console.log, write: writeFile }) {
  const args = parseArgs(argv);
  if (args.dryRun) {
    const given = Object.fromEntries(Object.entries(args.prices).filter(([, v]) => v != null));
    const data = buildReport({
      generatedAt: new Date().toISOString(),
      network: "Shardeum Mezame testnet",
      chainId: 8119,
      dryRun: true,
      bench: { address: `0x${"0".repeat(40)}`, deployTx: `0x${"0".repeat(64)}`, deployGas: 537000, deployCostShm: costShm(537000, "10000000000") },
      anchors: fakeAnchors(args.anchors),
      prices: { ...FAKE_PRICES, ...given },
    });
    io.log(renderMarkdown(data));
    return;
  }
  await runLive(args, io);
}

function writeFile(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

module.exports = {
  percentile,
  transactionsPerDay,
  costShm,
  gasCostNative,
  estimateUsd,
  summarizeAnchors,
  buildReport,
  renderMarkdown,
  main,
};

if (require.main === module) {
  main().catch((e) => {
    console.error("benchmark failed:", e.shortMessage || e.message);
    process.exit(1);
  });
}
