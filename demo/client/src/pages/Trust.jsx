import { useEffect, useState } from "react";
import { timeAgo } from "../constants";

// Public trust ledger: what UrbanPulse has sealed on the Shardeum blockchain, by which agency, and a
// button anyone can press to re-check every sealed record against the chain.
const AGENCY = { gcc: "Greater Chennai Corporation", wrd: "Water Resources Department" };
// changed or deleted records are tampering; a missing transaction is an on-chain seal by our agency
// with no records on this server (sealed by another copy of the server, or its records deleted)
function verdict(c) {
  const all = `${c.verified.toLocaleString("en-IN")} sealed records`;
  if (c.ok) return `All ${all} match the blockchain.`;
  if (c.tampered || c.deleted) return `${c.tampered + c.deleted} sealed records were changed or deleted after sealing.`;
  return `All ${all} here match, but ${c.missing} sealed transaction${c.missing > 1 ? "s have" : " has"} no records on this server.`;
}

const short = (h) => (h ? `${h.slice(0, 10)}…${h.slice(-6)}` : "");

export default function Trust() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [check, setCheck] = useState(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const load = () =>
      fetch("/api/public/chain")
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error("Could not load the ledger"))))
        .then(setData)
        .catch((err) => setError(err.message));
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, []);

  const verify = async () => {
    setChecking(true);
    setCheck(null);
    try {
      const res = await fetch("/api/public/chain/verify", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      setCheck(res.ok ? body : { error: body.error || "Could not reach the blockchain" });
    } finally {
      setChecking(false);
    }
  };

  const tx = (hash) => (data?.explorer && hash ? `${data.explorer}/tx/${hash}` : null);

  return (
    <div className="citizen">
      <header className="citizen-header">
        <div className="brand">
          <div className="brand-mark">UP</div>
          <div><div className="brand-name">Trust ledger</div><div className="brand-sub">UrbanPulse Chennai · sealed on Shardeum</div></div>
        </div>
      </header>

      <section className="c-card">
        <p className="small" style={{ margin: 0 }}>
          Every official alert, evacuation order, reservoir release, relief payment and staff action is written to an
          append-only log. Every 5 minutes the new entries are fingerprinted together (a Merkle root) and the fingerprint
          is written to a public blockchain. Nobody, including UrbanPulse, can change a sealed record afterwards without
          the fingerprint no longer matching.
        </p>
        <p className="muted small" style={{ margin: "8px 0 0" }}>Only fingerprints go on the blockchain. The records themselves, and any personal data, stay on the server.</p>
      </section>

      {!data && <div className="empty">{error || "Loading the ledger…"}</div>}

      {data && (
        <>
          <section className="c-card">
            <div className="kpi-row" style={{ gridTemplateColumns: "1fr 1fr 1fr", gap: 8, margin: 0 }}>
              <div className="kpi accent-safe"><div className="kpi-label">Records sealed</div><div className="kpi-value">{data.totals.sealed.toLocaleString("en-IN")}</div></div>
              <div className="kpi"><div className="kpi-label">Waiting to be sealed</div><div className="kpi-value">{data.totals.pending.toLocaleString("en-IN")}</div></div>
              <div className="kpi"><div className="kpi-label">Blockchain transactions</div><div className="kpi-value">{data.totals.batches}</div></div>
            </div>
            <p className="muted small" style={{ margin: "10px 0 0" }}>{data.lastAnchoredAt ? `Last sealed ${timeAgo(data.lastAnchoredAt)}.` : "Nothing sealed yet."}</p>
          </section>

          <section className="c-card">
            <h2 style={{ marginBottom: 6 }}>Check it yourself</h2>
            <p className="muted small" style={{ margin: "0 0 10px" }}>Recomputes the fingerprint of every sealed record on the server and compares it with the one stored on the blockchain.</p>
            <button className="btn" onClick={verify} disabled={checking || !data.enabled}>{checking ? "Checking every record…" : "Verify everything now"}</button>
            {check && !check.error && (
              <div role="status" style={{ marginTop: 12 }}>
                <p style={{ margin: 0, fontWeight: 600, color: check.ok ? "#0ca30c" : "#d03b3b" }}>{verdict(check)}</p>
                <p className="muted small" style={{ margin: "4px 0 0" }}>
                  {check.batchesIntact} of {check.batches} transactions intact · {check.tampered} changed · {check.deleted} deleted · {check.missing} missing · checked {timeAgo(check.checkedAt)}
                </p>
              </div>
            )}
            {check?.error && <div className="form-error" role="alert" style={{ marginTop: 12 }}>{check.error}</div>}
          </section>

          <section className="c-card">
            <h2 style={{ marginBottom: 6 }}>Who seals</h2>
            <p className="muted small" style={{ margin: "0 0 8px" }}>
              Contract on {data.network ?? "the blockchain"}:{" "}
              {data.explorer && data.contract ? <a className="mono link" href={`${data.explorer}/address/${data.contract}`} target="_blank" rel="noreferrer">{short(data.contract)}</a> : <span className="mono">{short(data.contract)}</span>}
              . Only registered agency wallets can write to it, and nothing written can be edited.
            </p>
            {data.agencies.length === 0 && <p className="muted small" style={{ margin: 0 }}>Agency wallets are not configured on this server.</p>}
            {data.agencies.map((a) => (
              <div key={a.address} className="small" style={{ padding: "6px 0", borderTop: "1px solid #2c2c2a" }}>
                <strong>{AGENCY[a.key] ?? a.name ?? a.key}</strong> · {a.batches} transactions
                <div className="mono muted">{data.explorer ? <a className="link" href={`${data.explorer}/address/${a.address}`} target="_blank" rel="noreferrer">{a.address}</a> : a.address}</div>
              </div>
            ))}
          </section>

          <section className="c-card" style={{ overflowX: "auto" }}>
            <h2 style={{ marginBottom: 10 }}>Latest seals</h2>
            <table className="table small">
              <thead><tr><th>#</th><th>When</th><th>Records</th><th>By</th><th>Transaction</th></tr></thead>
              <tbody>
                {data.recent.map((b) => (
                  <tr key={b.id}>
                    <td>{b.id}</td>
                    <td>{timeAgo(b.anchoredAt)}</td>
                    <td>{b.count}</td>
                    <td>{b.agency ? b.agency.toUpperCase() : "—"}</td>
                    <td className="mono">{tx(b.txHash) ? <a className="link" href={tx(b.txHash)} target="_blank" rel="noreferrer">{short(b.txHash)}</a> : short(b.txHash)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}

      <a className="muted small" href="/citizen">Back to the citizen app</a>
    </div>
  );
}
