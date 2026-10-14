// Audit-log tamper experiment (offline: the chain is an in-memory stand-in, no gas spent).
//
//   node experiments/tamper.js [--seeds 200] [--entries 300] [--batch 50] [--out tamper]
//
// Each seeded trial builds a realistic log, anchors it in batches exactly as the server does
// (same db.js tables, same leafHash/merkleRoot), applies one attack directly to SQLite, then runs
// the server's own verifyLog(). Reports, per attack, whether it was detected and how precisely:
//   row   = exactly the attacked entries are flagged (edited, or listed as deleted)
//   batch = the batch containing them is flagged as a whole (its anchor records were touched)
//   none  = verification passed
// plus whether anything outside the attacked batch was flagged (false alarms).
// Then times full verification at larger log sizes and lists inclusion-proof sizes.
const fs = require("node:fs");
const path = require("node:path");
const { performance } = require("node:perf_hooks");
const { openDb } = require("../db");
const { leafHash, merkleRoot, merkleProof, verifyLog } = require("../anchor");
const { seededRng } = require("../simulator");

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]]] : acc), []));
const SEEDS = Number(args.seeds) || 200;
const ENTRIES = Number(args.entries) || 300;
const BATCH = Number(args.batch) || 50;
const OUT_NAME = args.out || "tamper";
const AGENCY = "0xGCC";

const ACTIONS = ["login", "logout", "thresholds_changed", "team_dispatched", "broadcast_sent", "evacuation_order", "alert_published", "report_status"];
const USERS = [["admin", "admin"], ["officer", "officer"], ["viewer", "viewer"], [null, null]];

function buildLog(db, rng, n, startTs = 1_760_000_000_000) {
  for (let i = 0; i < n; i++) {
    const [username, role] = USERS[Math.floor(rng() * USERS.length)];
    const action = ACTIONS[Math.floor(rng() * ACTIONS.length)];
    db.logAudit({ id: `e${i}`, ts: startTs + i * 1000 + Math.floor(rng() * 900), username, role, action, details: { zone: "Velachery", n: i, note: rng().toString(36).slice(2) } });
  }
}

// anchors pending entries in batches of `size`, mirroring anchor.js sendBatch(); returns the fake chain
function anchorAll(db, size, chain = []) {
  for (;;) {
    const rows = db.unanchoredAudit(size).map((r) => ({ ...r, leaf: leafHash(r) }));
    if (rows.length === 0) return chain;
    const id = chain.length;
    chain.push({ root: merkleRoot(rows.map((r) => r.leaf)), count: rows.length, agency: AGENCY });
    db.saveAnchorBatch({ id, root: chain[id].root, count: rows.length, txHash: `0xtx${id}`, anchoredAt: 0, agency: AGENCY }, rows);
  }
}
const verify = (db, chain) => verifyLog(db, { total: chain.length, getBatch: async (id) => chain[id] });

const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
const batchOf = (db, id) => db.raw.prepare("SELECT batch_id FROM audit_anchor WHERE audit_id = ?").get(id)?.batch_id;
const setDetails = (db, id, fn) => {
  const row = db.raw.prepare("SELECT details FROM audit WHERE id = ?").get(id);
  db.raw.prepare("UPDATE audit SET details = ? WHERE id = ?").run(JSON.stringify(fn(JSON.parse(row.details))), id);
};

// each attack mutates the anchored log and returns { ids: attacked entry ids, batch: attacked batch id(s) }
const ATTACKS = {
  "none (control)": () => ({ ids: [], batch: null }),
  "edit details (one character)": (db, rng) => {
    const id = `e${Math.floor(rng() * ENTRIES)}`;
    setDetails(db, id, (d) => ({ ...d, zone: "Velacherx" }));
    return { ids: [id], batch: batchOf(db, id) };
  },
  "backdate timestamp (1 s)": (db, rng) => {
    const id = `e${Math.floor(rng() * ENTRIES)}`;
    db.raw.prepare("UPDATE audit SET ts = ts - 1000 WHERE id = ?").run(id);
    return { ids: [id], batch: batchOf(db, id) };
  },
  "change who did it": (db, rng) => {
    const id = `e${Math.floor(rng() * ENTRIES)}`;
    db.raw.prepare("UPDATE audit SET username = 'scapegoat', role = 'officer' WHERE id = ?").run(id);
    return { ids: [id], batch: batchOf(db, id) };
  },
  "swap two entries' timestamps": (db, rng) => {
    const a = Math.floor(rng() * ENTRIES);
    const b = a + 1 < ENTRIES ? a + 1 : a - 1;
    const [ra, rb] = [`e${a}`, `e${b}`].map((id) => db.raw.prepare("SELECT ts FROM audit WHERE id = ?").get(id).ts);
    db.raw.prepare("UPDATE audit SET ts = ? WHERE id = ?").run(rb, `e${a}`);
    db.raw.prepare("UPDATE audit SET ts = ? WHERE id = ?").run(ra, `e${b}`);
    return { ids: [`e${a}`, `e${b}`], batch: [batchOf(db, `e${a}`), batchOf(db, `e${b}`)] }; // may straddle two batches
  },
  // an insider who knows the scheme edits the entry and recomputes its stored leaf to match
  "edit an entry and rewrite its stored hash": (db, rng) => {
    const id = `e${Math.floor(rng() * ENTRIES)}`;
    setDetails(db, id, (d) => ({ ...d, zone: "Velacherx" }));
    const row = db.raw.prepare("SELECT * FROM audit WHERE id = ?").get(id);
    db.raw.prepare("UPDATE audit_anchor SET leaf = ? WHERE audit_id = ?").run(leafHash(row), id);
    return { ids: [id], batch: batchOf(db, id) };
  },
  "delete an entry": (db, rng) => {
    const id = `e${Math.floor(rng() * ENTRIES)}`;
    const batch = batchOf(db, id);
    db.raw.prepare("DELETE FROM audit WHERE id = ?").run(id);
    return { ids: [id], batch };
  },
  "delete an entry and its anchor record": (db, rng) => {
    const id = `e${Math.floor(rng() * ENTRIES)}`;
    const batch = batchOf(db, id);
    db.raw.prepare("DELETE FROM audit WHERE id = ?").run(id);
    db.raw.prepare("DELETE FROM audit_anchor WHERE audit_id = ?").run(id);
    return { ids: [id], batch };
  },
  "insert a forged entry into a batch": (db, rng) => {
    const batch = Math.floor(rng() * Math.ceil(ENTRIES / BATCH));
    const forged = { id: "forged", ts: 1_760_000_000_500, username: "admin", role: "admin", action: "evacuation_order", details: "{}" };
    db.raw.prepare("INSERT INTO audit (id, ts, username, role, action, details) VALUES (?, ?, ?, ?, ?, ?)").run(...Object.values(forged));
    db.raw.prepare("INSERT INTO audit_anchor (audit_id, batch_id, pos, leaf) VALUES (?, ?, ?, ?)").run("forged", batch, 9999, leafHash(forged));
    return { ids: ["forged"], batch };
  },
  "delete a whole batch locally": (db, rng) => {
    const batch = Math.floor(rng() * Math.ceil(ENTRIES / BATCH));
    const ids = db.raw.prepare("SELECT audit_id FROM audit_anchor WHERE batch_id = ?").all(batch).map((r) => r.audit_id);
    for (const id of ids) db.raw.prepare("DELETE FROM audit WHERE id = ?").run(id);
    db.raw.prepare("DELETE FROM audit_anchor WHERE batch_id = ?").run(batch);
    db.raw.prepare("DELETE FROM anchor_batches WHERE id = ?").run(batch);
    return { ids, batch };
  },
};
// the known blind spot: an edit made while the entry is still pending is sealed as if genuine
const PRE_ANCHOR = "edit before anchoring (blind spot)";

function classify(db, result, attack) {
  if (result.ok) return { detected: false, level: "none", falseAlarm: false };
  const flagged = new Set([...Object.entries(result.rows).filter(([, s]) => s === "tampered").map(([id]) => id), ...result.deleted]);
  const attacked = new Set([].concat(attack.batch));
  const exact = attack.ids.length > 0 && flagged.size === attack.ids.length && attack.ids.every((id) => flagged.has(id));
  const level = exact ? "row" : result.missing.some((m) => attacked.has(m.id)) || result.batches.some((b) => attacked.has(b.id) && !b.intact) ? "batch" : "other";
  // anything flagged outside the attacked batch(es) is a false alarm
  const outside = [...flagged].filter((id) => !attack.ids.includes(id) && !attacked.has(batchOf(db, id)));
  const otherBatchBad = result.batches.some((b) => !attacked.has(b.id) && !b.intact) || result.missing.some((m) => !attacked.has(m.id));
  return { detected: true, level, falseAlarm: outside.length > 0 || otherBatchBad || attack.ids.length === 0 };
}

async function trial(name, seed) {
  const rng = seededRng(seed * 7919 + Object.keys(ATTACKS).length + name.length);
  const db = openDb(":memory:");
  buildLog(db, rng, ENTRIES);
  if (name === PRE_ANCHOR) {
    const id = `e${Math.floor(rng() * ENTRIES)}`;
    setDetails(db, id, (d) => ({ ...d, zone: "Velacherx" }));
    const chain = anchorAll(db, BATCH);
    return classify(db, await verify(db, chain), { ids: [id], batch: batchOf(db, id) });
  }
  const chain = anchorAll(db, BATCH);
  const attack = ATTACKS[name](db, rng);
  return classify(db, await verify(db, chain), attack);
}

async function timing(n, batch) {
  const db = openDb(":memory:");
  buildLog(db, seededRng(n), n);
  let t = performance.now();
  const chain = anchorAll(db, batch);
  const anchorMs = performance.now() - t;
  t = performance.now();
  const result = await verify(db, chain);
  const verifyMs = performance.now() - t;
  if (!result.ok) throw new Error("clean log failed verification");
  return { entries: n, batches: chain.length, anchorMs, verifyMs };
}

(async () => {
  const outDir = path.join(__dirname, "results");
  fs.mkdirSync(outDir, { recursive: true });
  const rows = [];
  for (const name of [...Object.keys(ATTACKS), PRE_ANCHOR]) {
    for (let seed = 1; seed <= SEEDS; seed++) rows.push({ attack: name, seed, ...(await trial(name, seed)) });
    process.stdout.write(".");
  }
  console.log();

  const timings = [];
  for (const n of [1_000, 10_000, 100_000]) timings.push(await timing(n, 500));

  const proofSizes = [1, 2, 10, 50, 100, 500].map((n) => {
    const leaves = Array.from({ length: n }, (_, i) => leafHash({ id: `p${i}`, ts: i, username: null, role: null, action: "x", details: "{}" }));
    const longest = Math.max(...leaves.map((_, i) => merkleProof(leaves, i).length));
    return { batch: n, siblings: longest, bytes: longest * 32 };
  });

  const header = ["attack", "seed", "detected", "level", "falseAlarm"];
  fs.writeFileSync(path.join(outDir, `${OUT_NAME}.csv`), [header.join(","), ...rows.map((r) => header.map((h) => JSON.stringify(r[h])).join(","))].join("\n") + "\n");

  const pct = (k, n) => `${((100 * k) / n).toFixed(1)}%`;
  const lines = [
    "# Audit-log tamper experiment (results)",
    "",
    `${SEEDS} seeded trials per attack, ${ENTRIES} entries per log, anchored in batches of ${BATCH}. Chain: in-memory stand-in for the AuditAnchor contract;`,
    "anchoring and verification use the server's own code (db.js, anchor.js). Attacks are made directly on SQLite, as an insider with database access would.",
    "",
    "## Detection by attack",
    "",
    "| Attack | Detected | Pinpointed to the entry | Flagged at batch level | False alarms |",
    "|---|---:|---:|---:|---:|",
  ];
  for (const name of [...Object.keys(ATTACKS), PRE_ANCHOR]) {
    const r = rows.filter((x) => x.attack === name);
    const n = r.length;
    lines.push(`| ${name} | ${pct(r.filter((x) => x.detected).length, n)} | ${pct(r.filter((x) => x.level === "row").length, n)} | ${pct(r.filter((x) => x.level === "batch").length, n)} | ${pct(r.filter((x) => x.falseAlarm).length, n)} |`);
  }
  lines.push(
    "",
    "Detection of anchored entries holds by construction (a changed entry changes its keccak-256 leaf, and the root on-chain cannot be changed), so the",
    "informative columns are precision and the blind spot. Edits made before an entry is anchored are sealed as if genuine.",
    "",
    "## Cost of anchoring and verifying (local computation, batches of 500)",
    "",
    "| Log entries | Batches (on-chain transactions) | Hash + build batches (ms) | Verify whole log (ms) |",
    "|---:|---:|---:|---:|",
    ...timings.map((t) => `| ${t.entries.toLocaleString("en-US")} | ${t.batches} | ${t.anchorMs.toFixed(0)} | ${t.verifyMs.toFixed(0)} |`),
    "",
    "Verification also reads each batch root from the chain once (cached afterwards); network time is not included above.",
    "",
    "## Inclusion-proof size (what a citizen downloads to check one alert)",
    "",
    "| Entries in batch | Sibling hashes (worst case) | Proof size (bytes) |",
    "|---:|---:|---:|",
    ...proofSizes.map((p) => `| ${p.batch} | ${p.siblings} | ${p.bytes} |`),
    "",
  );
  fs.writeFileSync(path.join(outDir, `${OUT_NAME}.md`), lines.join("\n"));
  console.log(lines.join("\n"));
})();
