import { useState } from "react";

const STRINGS = {
  en: {
    title: "No internet? Use SMS",
    note: "Simulated SMS for this demo; a real deployment would use a telecom SMS gateway.",
    send: "Send to 56767 (demo)",
    placeholder: "e.g. SHELTER Velachery",
    button: "Send",
    sending: "Sending…",
    hint: "Try HELP, SHELTER Velachery, STATUS Velachery or VERIFY UP-XXXXXXXX.",
    failed: "Could not reach the SMS gateway. It runs on the server, so the server must be reachable.",
    open: "Open",
    close: "Close",
  },
  ta: {
    title: "இணையம் இல்லையா? SMS பயன்படுத்துங்கள்",
    note: "இது டெமோவுக்கான போலி SMS. உண்மையான அமைப்பில் தொலைத்தொடர்பு SMS நுழைவாயில் பயன்படுத்தப்படும்.",
    send: "56767 எண்ணுக்கு அனுப்பவும் (டெமோ)",
    placeholder: "எ.கா. SHELTER Velachery",
    button: "அனுப்பு",
    sending: "அனுப்புகிறது…",
    hint: "முயற்சி செய்யுங்கள்: HELP, SHELTER Velachery, STATUS Velachery அல்லது VERIFY UP-XXXXXXXX.",
    failed: "SMS நுழைவாயிலை அடைய முடியவில்லை. இது சேவையகத்தில் இயங்குவதால், சேவையகம் இணைக்கப்பட்டிருக்க வேண்டும்.",
    open: "திற",
    close: "மூடு",
  },
};

export default function SmsDemo({ lang }) {
  const s = STRINGS[lang === "ta" ? "ta" : "en"];
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [log, setLog] = useState([]);
  const [sending, setSending] = useState(false);

  const send = async (e) => {
    e.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setLog((prev) => [...prev, { me: true, text: body }]);
    setText("");
    setSending(true);
    try {
      const res = await fetch("/api/sms/inbound", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: body }),
      });
      const data = await res.json().catch(() => ({}));
      setLog((prev) => [...prev, { text: res.ok ? data.reply : s.failed }]);
    } catch {
      setLog((prev) => [...prev, { text: s.failed }]);
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="c-card">
      <div className="c-card-head">
        <h2>{s.title}</h2>
        <button type="button" className="link-btn" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? s.close : s.open}</button>
      </div>
      {open && (
        <>
          <p className="muted small" style={{ margin: "0 0 10px" }}>{s.note}</p>
          <div style={{ border: "1px solid #2c2c2a", borderRadius: 14, padding: 12, background: "#141414" }}>
            <div className="muted small" style={{ marginBottom: 8 }}>{s.send}</div>
            <div aria-live="polite" style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 260, overflowY: "auto", marginBottom: 10 }}>
              {log.length === 0 && <p className="muted small" style={{ margin: 0 }}>{s.hint}</p>}
              {log.map((m, i) => (
                <div key={i} style={{ alignSelf: m.me ? "flex-end" : "flex-start", maxWidth: "85%", whiteSpace: "pre-wrap", background: m.me ? "#3987e5" : "#1a1a19", color: "#fff", borderRadius: 12, padding: "8px 10px", fontSize: 13 }}>
                  {m.text}
                </div>
              ))}
            </div>
            <form className="inline-form" onSubmit={send}>
              <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder={s.placeholder} aria-label={s.placeholder} maxLength={500} autoCapitalize="characters" spellCheck={false} />
              <button className="btn" disabled={sending || !text.trim()}>{sending ? s.sending : s.button}</button>
            </form>
          </div>
        </>
      )}
    </section>
  );
}
