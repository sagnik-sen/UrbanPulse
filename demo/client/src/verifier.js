// Public URL of the published verify.html, from VITE_VERIFIER_URL in client/.env.local (see demo/README.md)
export const VERIFIER_URL = import.meta.env.VITE_VERIFIER_URL ?? "";

// Same bytes as encode() in demo/verifier/payload.js; change both together
export function encode(proof, txHash) {
  const e = proof.entry;
  const json = JSON.stringify({ v: 1, e: [e.id, e.ts, e.username, e.role, e.action, e.details], s: proof.siblings, b: proof.batchId, t: txHash });
  const bin = Array.from(new TextEncoder().encode(json), (b) => String.fromCharCode(b)).join("");
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
