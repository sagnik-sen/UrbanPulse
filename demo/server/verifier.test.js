const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { encode, decode } = require("../verifier/payload.js");
const { leafHash, merkleRoot, merkleProof, rootFromProof } = require("./anchor");

const deployment = require("./chain/deployment.json");
const rows = [0, 1, 2, 3, 4].map((i) => ({
  id: i + 1,
  ts: 1760000000000 + i * 1000,
  username: null,
  role: null,
  action: "alert_published",
  details: JSON.stringify({ code: `UP-0000000${i}`, zone: "Adyar", severity: "warning", message: `Flood advisory ${i}`, source: "manual" }),
}));
const leaves = rows.map(leafHash);
const root = merkleRoot(leaves);
const txHash = "0x" + "ab".repeat(32);

function proofAt(index) {
  return { entry: rows[index], leaf: leaves[index], siblings: merkleProof(leaves, index), batchId: 3, root, contract: deployment.address, chainId: deployment.chainId, rpc: deployment.rpc };
}

test("seal payload round-trips and recomputes the batch root for every entry", () => {
  for (let i = 0; i < rows.length; i++) {
    const decoded = decode(encode(proofAt(i), txHash));
    assert.deepStrictEqual(decoded.entry, rows[i]);
    assert.strictEqual(decoded.batchId, 3);
    assert.strictEqual(decoded.txHash, txHash);
    assert.strictEqual(rootFromProof(leafHash(decoded.entry), decoded.siblings), root);
  }
});

test("encoded payload is URL-safe base64 without padding", () => {
  const encoded = encode(proofAt(2), txHash);
  assert.match(encoded, /^[A-Za-z0-9_-]+$/);
  console.log(`5-row test proof payload: ${encoded.length} characters`);
});

test("changing one character of alert text changes the recomputed root", () => {
  const decoded = decode(encode(proofAt(1), txHash));
  const altered = { ...decoded.entry, details: decoded.entry.details.replace("advisory", "advisorY") };
  assert.notStrictEqual(rootFromProof(leafHash(altered), decoded.siblings), root);
});

test("malformed or foreign payloads are rejected with an error", () => {
  assert.throws(() => decode("not base64!"), /Not an UrbanPulse seal link/);
  assert.throws(() => decode(""), /Not an UrbanPulse seal link/);
  const wrongVersion = Buffer.from(JSON.stringify({ v: 2, e: [], s: [], b: 0, t: txHash })).toString("base64url");
  assert.throws(() => decode(wrongVersion), /Unsupported seal version/);
});

test("verify.html is a self-contained fragment with the pinned ethers and deployed contract", () => {
  const html = fs.readFileSync(path.join(__dirname, "../verifier/verify.html"), "utf8");
  assert.ok(html.startsWith("<title>Alert Seal Check</title>"));
  assert.ok(html.includes("https://cdnjs.cloudflare.com/ajax/libs/ethers/6.13.4/ethers.umd.min.js"));
  assert.ok(html.includes(deployment.address));
  assert.doesNotMatch(html, /<!DOCTYPE|<html|<head|<body/i);
  assert.ok(html.includes(encode.toString()) && html.includes(decode.toString()), "inline payload code drifted from payload.js");
});
