import { useEffect, useState } from "react";
import { useLang } from "../i18n";

// Public, no sign-in. The figures come from this demo server's relief state; every token and payment
// behind them is a sealed Audit Log entry, so anyone can check the totals against the anchored log.
const STRINGS = {
  en: {
    title: "Flood relief ledger",
    demo: "Demo ledger. Figures come from this demonstration server, not from any official payment system.",
    scheme: "Rs 6,000 per ration card, paid at the ration shop on the token's day and hour.",
    issued: "Tokens issued",
    paid: "Paid at shops",
    amount: "Amount paid",
    shops: "By shop",
    shop: "Shop",
    zone: "Area",
    cols: { issued: "Tokens", paid: "Paid", amount: "Amount" },
    sealed: "Every token and payment is a sealed entry in the Audit Log. The payment total above equals the number of sealed payment entries in this round times Rs 6,000, and the entries are anchored on the Shardeum blockchain. Staff can check them in the Audit Log.",
    privacy: "No ration card numbers are published or stored. Only a one-way code is kept, to stop double payments.",
    back: "Back to the citizen app",
    loading: "Loading the ledger…",
    failed: "Could not load the ledger. Please try again.",
  },
  ta: {
    title: "வெள்ள நிவாரண பதிவேடு",
    demo: "இது டெமோ பதிவேடு. இந்தப் புள்ளிவிவரங்கள் இந்த டெமோ சேவையகத்திலிருந்து வருகின்றன, அதிகாரபூர்வ பணம் செலுத்தும் அமைப்பிலிருந்து அல்ல.",
    scheme: "ரேஷன் அட்டைக்கு ரூ. 6,000, டோக்கனின் நாள் மற்றும் நேரத்தில் ரேஷன் கடையில் வழங்கப்படும்.",
    issued: "வழங்கப்பட்ட டோக்கன்கள்",
    paid: "கடைகளில் வழங்கியது",
    amount: "வழங்கப்பட்ட தொகை",
    shops: "கடை வாரியாக",
    shop: "கடை",
    zone: "பகுதி",
    cols: { issued: "டோக்கன்கள்", paid: "வழங்கியது", amount: "தொகை" },
    sealed: "ஒவ்வொரு டோக்கனும் பணம் செலுத்துதலும் தணிக்கைப் பதிவில் முத்திரையிடப்பட்ட பதிவாகும். மேலே உள்ள மொத்தத் தொகை, இந்தச் சுற்றில் முத்திரையிடப்பட்ட பணம் செலுத்தல் பதிவுகளின் எண்ணிக்கையை ரூ. 6,000 ஆல் பெருக்கியது; அந்தப் பதிவுகள் Shardeum பிளாக்செயினில் பதியப்பட்டுள்ளன. பணியாளர்கள் தணிக்கைப் பதிவில் சரிபார்க்கலாம்.",
    privacy: "ரேஷன் அட்டை எண்கள் வெளியிடப்படுவதில்லை, சேமிக்கப்படுவதும் இல்லை. இரட்டைப் பணம் தடுக்க ஒரு வழி குறியீடு மட்டுமே வைக்கப்படுகிறது.",
    back: "குடிமக்கள் செயலிக்குத் திரும்பு",
    loading: "பதிவேடு ஏற்றப்படுகிறது…",
    failed: "பதிவேட்டை ஏற்ற முடியவில்லை. மீண்டும் முயற்சிக்கவும்.",
  },
};

export default function ReliefLedger() {
  const [lang] = useLang();
  const s = STRINGS[lang === "ta" ? "ta" : "en"];
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/relief/ledger")
      .then((res) => {
        if (!res.ok) throw new Error("ledger");
        return res.json();
      })
      .then(setData)
      .catch(() => setError(true));
  }, []);

  return (
    <div className="citizen" lang={lang === "ta" ? "ta" : "en"}>
      <header className="citizen-header">
        <div className="brand">
          <div className="brand-mark">UP</div>
          <div><div className="brand-name">{s.title}</div><div className="brand-sub">UrbanPulse Chennai</div></div>
        </div>
      </header>

      <section className="c-card">
        <p className="muted small" style={{ margin: 0 }}>{s.scheme}</p>
        <p className="small" style={{ margin: "8px 0 0" }}>{s.demo}</p>
      </section>

      {!data && <div className="empty">{error ? s.failed : s.loading}</div>}

      {data && (
        <>
          <section className="c-card">
            <div className="kpi-row" style={{ gridTemplateColumns: "1fr 1fr 1fr", gap: 8, margin: 0 }}>
              <div className="kpi"><div className="kpi-label">{s.issued}</div><div className="kpi-value">{data.totals.issued}</div></div>
              <div className="kpi accent-safe"><div className="kpi-label">{s.paid}</div><div className="kpi-value">{data.totals.paid}</div></div>
              <div className="kpi"><div className="kpi-label">{s.amount}</div><div className="kpi-value">Rs {data.totals.amountRs.toLocaleString("en-IN")}</div></div>
            </div>
          </section>

          <section className="c-card" style={{ overflowX: "auto" }}>
            <h2 style={{ marginBottom: 10 }}>{s.shops}</h2>
            <table className="table">
              <thead>
                <tr><th>{s.shop}</th><th>{s.zone}</th><th>{s.cols.issued}</th><th>{s.cols.paid}</th><th>{s.cols.amount}</th></tr>
              </thead>
              <tbody>
                {data.shops.map((shop) => (
                  <tr key={shop.id}>
                    <td>{shop.name}</td>
                    <td>{shop.zone}</td>
                    <td>{shop.issued}</td>
                    <td>{shop.paid}</td>
                    <td>Rs {shop.amountRs.toLocaleString("en-IN")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="c-card">
            <p className="small" style={{ margin: 0 }}>{s.sealed}</p>
            <p className="muted small" style={{ margin: "10px 0 0" }}>{s.privacy}</p>
          </section>
        </>
      )}

      <a className="muted small" href="/citizen">{s.back}</a>
    </div>
  );
}
