// Registers an agency's wallet on AuditAnchor so it can anchor batches. Only the contract admin
// (the SHARDEUM_PRIVATE_KEY deployer) can call setAgency.
//   node chain/add-agency.js <address> "<name>"
const fs = require("node:fs");
const path = require("node:path");
const { Contract, JsonRpcProvider, Wallet, isAddress } = require("ethers");

try { process.loadEnvFile(path.join(__dirname, "..", ".env")); } catch {}
const { SHARDEUM_PRIVATE_KEY } = process.env;
const [address, name] = process.argv.slice(2);
if (!SHARDEUM_PRIVATE_KEY) {
  console.error("Set SHARDEUM_PRIVATE_KEY in server/.env (the contract admin)");
  process.exit(1);
}
if (!isAddress(address) || !name?.trim()) {
  console.error('Usage: node chain/add-agency.js <address> "<name>"');
  process.exit(1);
}

(async () => {
  const deployment = JSON.parse(fs.readFileSync(path.join(__dirname, "deployment.json"), "utf8"));
  const provider = new JsonRpcProvider(deployment.rpc, deployment.chainId, { staticNetwork: true });
  const wallet = new Wallet(SHARDEUM_PRIVATE_KEY.trim(), provider);
  const { abi } = require("./AuditAnchor.json");
  const contract = new Contract(deployment.address, abi, wallet);

  const tx = await contract.setAgency(address, name.trim());
  const receipt = await tx.wait();
  console.log(`registered ${address} as "${name.trim()}" (tx ${tx.hash}, gas ${receipt.gasUsed})`);
})().catch((e) => {
  console.error("add agency failed:", e.shortMessage || e.message);
  process.exit(1);
});
