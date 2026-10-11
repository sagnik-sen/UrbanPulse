// Compiles AuditAnchor.sol into AuditAnchor.json (ABI + bytecode). Run after editing the contract:
//   node chain/compile.js
const fs = require("node:fs");
const path = require("node:path");
const solc = require("solc");

const source = fs.readFileSync(path.join(__dirname, "AuditAnchor.sol"), "utf8");
const input = {
  language: "Solidity",
  sources: { "AuditAnchor.sol": { content: source } },
  settings: {
    // paris = no PUSH0 opcode, which some EVM-compatible chains reject
    evmVersion: "paris",
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
  },
};

const out = JSON.parse(solc.compile(JSON.stringify(input)));
const errors = (out.errors || []).filter((e) => e.severity === "error");
if (errors.length) {
  for (const e of errors) console.error(e.formattedMessage);
  process.exit(1);
}
const c = out.contracts["AuditAnchor.sol"].AuditAnchor;
fs.writeFileSync(
  path.join(__dirname, "AuditAnchor.json"),
  JSON.stringify({ compiler: solc.version(), evmVersion: "paris", abi: c.abi, bytecode: "0x" + c.evm.bytecode.object }, null, 2) + "\n",
);
console.log("wrote chain/AuditAnchor.json");
