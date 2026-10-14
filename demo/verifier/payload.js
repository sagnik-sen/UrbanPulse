// Seal link payload: the proof a poster QR carries, so the verifier page can recompute the Merkle
// root without the server. verify.html inlines a copy of the factory body below; keep them identical.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.UPPayload = api;
})(globalThis, function () {
  const B64URL = /^[A-Za-z0-9_-]+$/;
  const HEX32 = /^0x[0-9a-f]{64}$/;

  function encode(proof, txHash) {
    const e = proof.entry;
    const json = JSON.stringify({ v: 1, e: [e.id, e.ts, e.username, e.role, e.action, e.details], s: proof.siblings, b: proof.batchId, t: txHash });
    const bin = Array.from(new TextEncoder().encode(json), (b) => String.fromCharCode(b)).join("");
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function decode(str) {
    if (typeof str !== "string" || !B64URL.test(str)) throw new Error("Not an UrbanPulse seal link");
    let obj;
    try {
      const b64 = str.replace(/-/g, "+").replace(/_/g, "/");
      const bytes = Uint8Array.from(atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4)), (c) => c.charCodeAt(0));
      obj = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      throw new Error("This seal link is damaged or incomplete");
    }
    if (!obj || obj.v !== 1) throw new Error("Unsupported seal version");
    const e = obj.e;
    if (!Array.isArray(e) || e.length !== 6 || typeof e[1] !== "number" || typeof e[5] !== "string") throw new Error("Seal entry is malformed");
    if (!Array.isArray(obj.s) || !obj.s.every((s) => typeof s === "string" && HEX32.test(s))) throw new Error("Seal proof is malformed");
    if (typeof obj.b !== "number") throw new Error("Seal batch is malformed");
    return { entry: { id: e[0], ts: e[1], username: e[2], role: e[3], action: e[4], details: e[5] }, siblings: obj.s, batchId: obj.b, txHash: obj.t };
  }

  return { encode, decode };
});
