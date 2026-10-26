import { useEffect, useState } from "react";

// hours a shop serves, as collectionHours() in server/relief.js: 9-13 and 15-17
const HOURS = [9, 10, 11, 12, 15, 16];
const EMPTY_FORM = { code: "", cardNumber: "", shopId: "" };
const money = (n) => `Rs ${Number(n).toLocaleString("en-IN")}`;

export default function Relief() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  const [check, setCheck] = useState(null);

  const load = async () => {
    const res = await fetch("/api/relief");
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Could not load the relief desk");
    setData(await res.json());
  };

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, []);

  const pay = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setResult("");
    const shopId = form.shopId;
    try {
      const res = await fetch("/api/relief/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: form.code, cardNumber: form.cardNumber, shopId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Payment not recorded");
      setResult(`Paid ${money(body.amountRs)} for token ${body.code} at ${body.shop.name}.`);
      setForm({ ...EMPTY_FORM, shopId });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  // look a token up without paying; card and shop are optional and only compared when filled in
  const checkToken = async () => {
    setBusy(true);
    setError("");
    setResult("");
    setCheck(null);
    try {
      const res = await fetch("/api/relief/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: form.code, cardNumber: form.cardNumber || undefined, shopId: form.shopId || undefined }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not check the token");
      setCheck(body);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (!data) return <div className="empty">{error || "Loading the relief desk…"}</div>;

  const hourTotal = (shop, hour) => shop.slots.filter((s) => s.hour === hour).reduce((n, s) => n + s.booked, 0);

  return (
    <>
      <section className="kpi-row" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
        <div className="kpi"><div className="kpi-label">Tokens issued</div><div className="kpi-value">{data.totals.issued}</div></div>
        <div className="kpi accent-safe"><div className="kpi-label">Paid at shops</div><div className="kpi-value">{data.totals.paid}</div></div>
        <div className="kpi"><div className="kpi-label">Amount paid</div><div className="kpi-value">{money(data.totals.amountRs)}</div></div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Shops and slot loads</h2>
          <span className="muted small">Tokens booked per hour, summed over {data.days} collection days</span>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Shop</th><th>Zone</th><th>Issued</th><th>Paid</th><th>Amount</th>
              {HOURS.map((h) => <th key={h}>{h}:00</th>)}
            </tr>
          </thead>
          <tbody>
            {data.shops.map((shop) => (
              <tr key={shop.id}>
                <td>{shop.name}<div className="muted small">{shop.perHour} an hour</div></td>
                <td>{shop.zone}</td>
                <td>{shop.issued}</td>
                <td>{shop.paid}</td>
                <td>{money(shop.amountRs)}</td>
                {HOURS.map((h) => (
                  <td key={h} title={`Capacity ${shop.perHour * data.days} over ${data.days} days`}>{hourTotal(shop, h)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="panel">
        <div className="panel-head"><h2>Pay out at a shop</h2></div>
        <p className="muted small" style={{ margin: "0 0 12px" }}>Check the ration card and the token before paying. Each token is paid once, and only at the shop it names.</p>
        <form onSubmit={pay} style={{ display: "grid", gap: 10, maxWidth: 480 }}>
          <label className="field">
            <span className="field-label">Shop</span>
            <select className="select" value={form.shopId} onChange={(e) => setForm({ ...form, shopId: e.target.value })} required>
              <option value="">Choose a shop</option>
              {data.shops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className="field">
            <span className="field-label">Token code</span>
            <input className="input" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="RF-XXXXXX" autoComplete="off" required />
          </label>
          <label className="field">
            <span className="field-label">Ration card number</span>
            <input className="input" value={form.cardNumber} onChange={(e) => setForm({ ...form, cardNumber: e.target.value })} autoComplete="off" required />
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn ghost" disabled={busy || !form.code.trim()} onClick={checkToken}>Check token</button>
            <button className="btn" disabled={busy}>{busy ? "Working…" : "Record payment"}</button>
          </div>
        </form>
        {check && <TokenCheck check={check} />}
        {result && <p className="small" role="status" style={{ marginTop: 12 }}>{result}</p>}
        {error && <div className="form-error" role="alert" style={{ marginTop: 12 }}>{error}</div>}
      </section>
    </>
  );
}

const TIMING = { early: "Before its slot", "on-time": "In its slot now", late: "After its slot" };

const Badge = ({ ok, children }) => (
  <span className="badge"><span className="badge-dot" style={{ background: ok ? "#0ca30c" : "#d03b3b" }} />{children}</span>
);

function Mark({ ok, yes, no, unset }) {
  if (ok == null) return <span className="muted">{unset}</span>;
  return <Badge ok={ok}>{ok ? yes : no}</Badge>;
}

function TokenCheck({ check }) {
  const t = check.token;
  const ready = !t.paid && check.cardMatches === true && check.shopMatches === true;
  return (
    <div className="panel" style={{ marginTop: 12, maxWidth: 480 }} role="status">
      <div className="panel-head">
        <h3 className="mono" style={{ margin: 0 }}>{t.code}</h3>
        <Badge ok={!t.paid}>{t.paid ? "Already paid" : "Not paid yet"}</Badge>
      </div>
      <table className="table small">
        <tbody>
          <tr><td>Shop</td><td>{t.shopName} ({t.zone})</td></tr>
          <tr><td>Slot</td><td>{t.day ?? "?"}, {t.hour}:00 to {t.hour + 1}:00 IST · {TIMING[check.timing]}</td></tr>
          {t.paid && <tr><td>Paid at</td><td>{new Date(check.paidAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</td></tr>}
          <tr><td>Ration card</td><td><Mark ok={check.cardMatches} yes="Matches this token" no="Different card" unset="Not entered" /></td></tr>
          <tr><td>This shop</td><td><Mark ok={check.shopMatches} yes="Right shop" no="Wrong shop" unset="No shop chosen" /></td></tr>
        </tbody>
      </table>
      <p className="small" style={{ margin: "8px 0 0" }}>{ready ? "Everything matches: safe to record the payment." : t.paid ? "Do not pay again." : "Fix the highlighted items before paying."}</p>
    </div>
  );
}
