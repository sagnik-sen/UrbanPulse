// Tamper-evident audit log: batches of audit entries are hashed into a Merkle root and the root
// is written to the AuditAnchor contract on Shardeum. Entries stay in SQLite (no personal data
// on a public chain); anyone with the RPC and contract address can re-check them later.
//
// Verification recomputes each entry's hash from the stored columns. An edit, deletion or
// insertion in an anchored batch changes the root and no longer matches the chain.
const { keccak256, toUtf8Bytes, concat, JsonRpcProvider, Wallet, Contract } = require("ethers");
const { abi } = require("./chain/AuditAnchor.json");

const MAX_BATCH = 500;

// raw DB columns (details as its stored JSON text), double-hashed so a leaf can never pose as an inner node
function leafHash(row) {
  return keccak256(keccak256(toUtf8Bytes(JSON.stringify([row.id, row.ts, row.username, row.role, row.action, row.details]))));
}

// sorted-pair keccak tree (OpenZeppelin MerkleProof convention); an unpaired node moves up unchanged
function merkleRoot(leaves) {
  let level = leaves;
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) {
      const a = level[i];
      const b = level[i + 1];
      next.push(b === undefined ? a : keccak256(a < b ? concat([a, b]) : concat([b, a])));
    }
    level = next;
  }
  return level[0];
}

// sibling hashes from leaf `index` up to the root; a level where the node is unpaired adds nothing
function merkleProof(leaves, index) {
  const proof = [];
  let level = leaves;
  let i = index;
  while (level.length > 1) {
    const sibling = i % 2 ? level[i - 1] : level[i + 1];
    if (sibling !== undefined) proof.push(sibling);
    const next = [];
    for (let k = 0; k < level.length; k += 2) next.push(level[k + 1] === undefined ? level[k] : merkleRoot([level[k], level[k + 1]]));
    level = next;
    i = Math.floor(i / 2);
  }
  return proof;
}

// sorted pairs make the fold order-free, so a proof is just the list of siblings
const rootFromProof = (leaf, proof) => proof.reduce((h, s) => merkleRoot([h, s]), leaf);

// entries: anchor records in anchoring order, joined to their audit row (row columns null if deleted)
// onChain: { root, count } from the contract, or null if the chain has no such batch from us
function checkBatch(entries, onChain) {
  // the stored leaves are only trusted once they reproduce the on-chain root
  const sealed = !!onChain && entries.length === onChain.count && merkleRoot(entries.map((e) => e.leaf)) === onChain.root;
  const rows = {};
  const deleted = [];
  for (const e of entries) {
    if (e.id == null) deleted.push(e.audit_id);
    else rows[e.id] = sealed && leafHash(e) === e.leaf ? "verified" : "tampered";
  }
  const intact = sealed && deleted.length === 0 && Object.values(rows).every((s) => s === "verified");
  return { sealed, intact, rows, deleted };
}

// Whole-log check. chain: { total, getBatch(id) -> { root, count, agency }, agency } where agency
// is the address whose batches count as ours (other agencies share the contract).
async function verifyLog(db, { total, getBatch, agency }) {
  const rows = {};
  const deleted = [];
  const batches = [];
  const local = db.anchorBatches();
  for (const b of local) {
    const onChain = b.id < total ? await getBatch(b.id) : null;
    const result = checkBatch(db.batchEntries(b.id), onChain?.agency === agency ? onChain : null);
    Object.assign(rows, result.rows);
    deleted.push(...result.deleted);
    batches.push({ id: b.id, count: b.count, txHash: b.tx_hash, intact: result.intact });
  }
  // batches this agency anchored that have vanished from the local database entirely
  const known = new Set(local.map((b) => b.id));
  const missing = [];
  for (let id = 0; id < total; id++) {
    if (known.has(id)) continue;
    const c = await getBatch(id);
    if (c.agency === agency) missing.push({ id, count: c.count });
  }
  const tampered = Object.values(rows).filter((s) => s === "tampered").length;
  return {
    ok: tampered === 0 && deleted.length === 0 && missing.length === 0 && batches.every((b) => b.intact),
    checkedAt: Date.now(),
    verified: Object.keys(rows).length - tampered,
    tampered,
    rows,
    deleted,
    missing,
    batches,
  };
}

// Without an RPC or contract address the log still works; entries just stay unanchored.
function createAnchor({ db, rpc, privateKey, deployment, onAnchored }) {
  if (!rpc || !deployment?.address) return { enabled: false, canWrite: false };

  // static network: no chain-id probing, so an unreachable RPC fails calls instead of retrying forever in the background
  const provider = new JsonRpcProvider(rpc, deployment.chainId, { staticNetwork: true });
  const wallet = privateKey ? new Wallet(privateKey.trim(), provider) : null;
  const contract = new Contract(deployment.address, abi, wallet ?? provider);

  // one send at a time, or the timer and the "Anchor now" button would race on the nonce
  let inFlight = null;
  async function sendBatch() {
    const rows = db.unanchoredAudit(MAX_BATCH);
    if (rows.length === 0) return null;
    for (const r of rows) r.leaf = leafHash(r);
    const root = merkleRoot(rows.map((r) => r.leaf));
    const tx = await contract.anchor(root, rows.length);
    const receipt = await tx.wait(1, 120_000);
    const event = receipt.logs.map((l) => { try { return contract.interface.parseLog(l); } catch { return null; } }).find((e) => e?.name === "Anchored");
    if (!event) throw new Error(`no Anchored event in ${tx.hash}`);
    // a crash between the receipt and this write leaves an on-chain batch with no local record (verify reports it as missing)
    const batch = { id: Number(event.args.batchId), root, count: rows.length, txHash: tx.hash, anchoredAt: Date.now() };
    db.saveAnchorBatch(batch, rows);
    onAnchored?.({ ...batch, ids: rows.map((r) => r.id) });
    return batch;
  }
  const anchorNow = () => {
    if (!wallet) return Promise.reject(new Error("No signing key configured"));
    inFlight ??= sendBatch().finally(() => { inFlight = null; });
    return inFlight;
  };

  // batches never change once written, so each is read from the chain only once
  const chainCache = new Map();
  async function chainBatch(id) {
    if (!chainCache.has(id)) {
      const b = await contract.batches(id);
      chainCache.set(id, { root: b.root, count: Number(b.count), agency: b.agency });
    }
    return chainCache.get(id);
  }

  let agencyAddress = wallet?.address ?? null;
  const ourAgency = async () => (agencyAddress ??= await contract.admin());

  // one entry with its inclusion proof, for the public alert check; reads only that entry's batch
  async function verifyEntry(entryId, batchId) {
    const entries = db.batchEntries(batchId);
    const index = entries.findIndex((e) => e.audit_id === entryId);
    const total = Number(await contract.batchCount());
    const onChain = batchId < total ? await chainBatch(batchId) : null;
    const trusted = onChain?.agency === (await ourAgency()) ? onChain : null;
    const result = checkBatch(entries, trusted);
    const e = entries[index];
    return {
      status: result.rows[entryId] ?? "tampered",
      proof: {
        entry: { id: e.id, ts: e.ts, username: e.username, role: e.role, action: e.action, details: e.details },
        leaf: e.leaf,
        siblings: merkleProof(entries.map((x) => x.leaf), index),
        batchId,
        root: onChain?.root ?? null,
        contract: deployment.address,
        chainId: deployment.chainId,
        rpc,
      },
    };
  }

  async function verify() {
    return verifyLog(db, { total: Number(await contract.batchCount()), getBatch: chainBatch, agency: await ourAgency() });
  }

  return { enabled: true, canWrite: !!wallet, address: deployment.address, chainId: deployment.chainId, anchorNow, verify, verifyEntry };
}

module.exports = { leafHash, merkleRoot, merkleProof, rootFromProof, checkBatch, verifyLog, createAnchor };
