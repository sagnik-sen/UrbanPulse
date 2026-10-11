// Checks a downloaded alert proof directly against the Shardeum contract, without the UrbanPulse
// server: recompute the entry's hash, fold in the Merkle siblings, compare with the on-chain root.
// The contract is pinned from deployment.json (or --contract), never taken from the proof file,
// so a forged proof cannot point at a look-alike contract.
//   node chain/verify-proof.js urbanpulse-alert-UP-1A2B3C4D.json [--contract 0x...] [--rpc https://...]
const fs = require("node:fs");
const { JsonRpcProvider, Contract } = require("ethers");
const { leafHash, rootFromProof } = require("../anchor");

const file = process.argv[2];
if (!file) {
  console.error("usage: node chain/verify-proof.js <proof.json> [--contract <address>] [--rpc <url>]");
  process.exit(1);
}
const proof = JSON.parse(fs.readFileSync(file, "utf8"));
const flag = (name) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : null);
const deployment = require("./deployment.json");
const contractAddress = flag("--contract") ?? deployment.address;
const rpc = flag("--rpc") ?? deployment.rpc;

function invalid(reason) {
  console.log(`INVALID: ${reason}`);
  process.exit(2);
}
if (String(proof.contract).toLowerCase() !== contractAddress.toLowerCase()) invalid(`proof names contract ${proof.contract}, expected ${contractAddress}`);

(async () => {
  const leaf = leafHash(proof.entry);
  const root = rootFromProof(leaf, proof.siblings);
  const contract = new Contract(contractAddress, ["function batches(uint256) view returns (bytes32 root, uint32 count, uint64 anchoredAt, address agency)", "function agencyName(address) view returns (string)"], new JsonRpcProvider(rpc, deployment.chainId, { staticNetwork: true }));
  const batch = await contract.batches(proof.batchId);
  const agency = await contract.agencyName(batch.agency);
  const d = JSON.parse(proof.entry.details);

  console.log(`alert ${d.code}: "${d.message}"`);
  console.log(`issued ${new Date(proof.entry.ts).toISOString()} for ${d.zone}`);
  console.log(`recomputed root  ${root}`);
  console.log(`on-chain root    ${batch.root}  (batch ${proof.batchId}, anchored by "${agency}" ${batch.agency} at ${new Date(Number(batch.anchoredAt) * 1000).toISOString()})`);
  if (!agency) invalid("the batch was anchored by an address that is not a registered agency");
  if (root !== batch.root) invalid("the alert does not match what was sealed on-chain");
  console.log("VALID: this exact alert was sealed on-chain by the agency above");
})().catch((e) => {
  console.error("could not check:", e.shortMessage || e.message);
  process.exit(1);
});
