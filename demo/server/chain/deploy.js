// Deploys AuditAnchor with the key in .env and records the public details in chain/deployment.json
// (set SHARDEUM_EXPLORER in .env to record the explorer link too).
//   node chain/deploy.js "UrbanPulse demo: GCC desk"
const fs = require("node:fs");
const path = require("node:path");
const { ContractFactory, JsonRpcProvider, Wallet, formatEther } = require("ethers");

try { process.loadEnvFile(path.join(__dirname, "..", ".env")); } catch {}
const { SHARDEUM_RPC, SHARDEUM_PRIVATE_KEY } = process.env;
if (!SHARDEUM_RPC || !SHARDEUM_PRIVATE_KEY) {
  console.error("Set SHARDEUM_RPC and SHARDEUM_PRIVATE_KEY in server/.env");
  process.exit(1);
}

(async () => {
  const provider = new JsonRpcProvider(SHARDEUM_RPC);
  const wallet = new Wallet(SHARDEUM_PRIVATE_KEY.trim(), provider);
  const { chainId } = await provider.getNetwork();
  const before = await provider.getBalance(wallet.address);
  console.log(`deploying from ${wallet.address} on chain ${chainId}`);

  const { abi, bytecode } = JSON.parse(fs.readFileSync(path.join(__dirname, "AuditAnchor.json"), "utf8"));
  const contract = await new ContractFactory(abi, bytecode, wallet).deploy(process.argv[2] || "UrbanPulse demo: GCC desk");
  const tx = contract.deploymentTransaction();
  await contract.waitForDeployment();
  const receipt = await tx.wait();
  const address = await contract.getAddress();

  const after = await provider.getBalance(wallet.address);
  const deployment = {
    chainId: Number(chainId),
    rpc: SHARDEUM_RPC,
    explorer: process.env.SHARDEUM_EXPLORER || null,
    address,
    deployTx: tx.hash,
    block: receipt.blockNumber,
    gasUsed: receipt.gasUsed.toString(),
    deployedAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(__dirname, "deployment.json"), JSON.stringify(deployment, null, 2) + "\n");
  console.log(`AuditAnchor at ${address} (tx ${tx.hash}, gas ${receipt.gasUsed}, cost ${formatEther(before - after)} SHM)`);
})().catch((e) => {
  console.error("deploy failed:", e.shortMessage || e.message);
  process.exit(1);
});
