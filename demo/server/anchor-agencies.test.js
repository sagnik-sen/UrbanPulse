const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { openDb } = require("./db");
const { leafHash, merkleRoot, verifyLog } = require("./anchor");

const GCC = "0xGCC";
const WRD = "0xWRD";
const AGENCIES = [GCC, WRD];

// fake chain: anchors pending entries as one batch for `agency`, selected by the same filter the server uses
function anchorFor(db, chain, agency, filter) {
  const rows = db.unanchoredAudit(500, filter).map((r) => ({ ...r, leaf: leafHash(r) }));
  if (rows.length === 0) return;
  const id = chain.length;
  chain.push({ root: merkleRoot(rows.map((r) => r.leaf)), count: rows.length, agency });
  db.saveAnchorBatch({ id, root: chain[id].root, count: rows.length, txHash: `0xtx${id}`, anchoredAt: 0, agency }, rows);
}

const verify = (db, chain) => verifyLog(db, { total: chain.length, getBatch: async (id) => chain[id], agencies: AGENCIES });

function twoAgencyLog() {
  const db = openDb(":memory:");
  const entries = [["login", "admin"], ["reservoir_release", "officer"], ["broadcast_sent", "admin"], ["reservoir_release", "officer"]];
  entries.forEach(([action, username], i) => db.logAudit({ id: `e${i + 1}`, ts: i + 1, username, role: "officer", action, details: { n: i } }));
  const chain = [];
  anchorFor(db, chain, GCC, { except: ["reservoir_release"] });
  anchorFor(db, chain, WRD, { only: ["reservoir_release"] });
  return { db, chain };
}

test("GCC and WRD anchor disjoint sets of entries, and the clean two-agency log verifies", async () => {
  const { db, chain } = twoAgencyLog();
  assert.equal(chain.length, 2);
  assert.equal(db.unanchoredAudit(500).length, 0);
  assert.ok(db.batchEntries(0).every((r) => r.action !== "reservoir_release"));
  assert.deepEqual(db.batchEntries(1).map((r) => r.action), ["reservoir_release", "reservoir_release"]);
  const result = await verify(db, chain);
  assert.equal(result.ok, true);
  assert.equal(result.verified, 4);
});

test("a batch stored under a different agency than the chain records is flagged", async () => {
  const { db, chain } = twoAgencyLog();
  db.raw.prepare("UPDATE anchor_batches SET agency = ? WHERE id = 1").run(GCC);
  const result = await verify(db, chain);
  assert.equal(result.ok, false);
  assert.equal(result.batches.find((b) => b.id === 1).intact, false);
  assert.equal(result.batches.find((b) => b.id === 0).intact, true);
});

test("an agency's past batches stay valid whatever its registration status now", async () => {
  // the contract only accepted them while the agency was registered, so a later revocation changes nothing
  const { db, chain } = twoAgencyLog();
  const result = await verify(db, chain);
  assert.equal(result.ok, true);
  assert.ok(result.batches.every((b) => b.intact));
});

test("a registered agency's batch that vanished from the local database is reported missing", async () => {
  const { db, chain } = twoAgencyLog();
  db.raw.prepare("DELETE FROM audit_anchor WHERE batch_id = 1").run();
  db.raw.prepare("DELETE FROM anchor_batches WHERE id = 1").run();
  const result = await verify(db, chain);
  assert.equal(result.ok, false);
  assert.deepEqual(result.missing, [{ id: 1, count: 2 }]);
});

test("a database created before agencies were recorded gains the column, and its batches can be backfilled", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "urbanpulse-agency-"));
  const file = path.join(dir, "old.db");
  try {
    const old = new DatabaseSync(file);
    old.exec("CREATE TABLE anchor_batches (id INTEGER PRIMARY KEY, root TEXT NOT NULL, count INTEGER NOT NULL, tx_hash TEXT NOT NULL, anchored_at INTEGER NOT NULL)");
    old.exec("INSERT INTO anchor_batches VALUES (0, '0xroot', 3, '0xtx', 0)");
    old.close();

    const db = openDb(file);
    assert.ok(db.raw.prepare("PRAGMA table_info(anchor_batches)").all().some((c) => c.name === "agency"));
    assert.equal(db.anchorBatches()[0].agency, null);
    db.backfillBatchAgency(GCC);
    assert.equal(db.anchorBatches()[0].agency, GCC);
    db.raw.close();

    openDb(file).raw.close(); // reopening an upgraded database changes nothing
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
