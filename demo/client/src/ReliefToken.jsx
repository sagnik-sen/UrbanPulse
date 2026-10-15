import { useState } from "react";
import { useFloodData } from "./FloodDataContext";

// Flood relief token for the cash payment at a ration shop. The card number is sent once and cleared from
// this page afterwards. The server keeps only a keyed hash of it, so nothing here can be looked up by name.
const AREA_KEY = "urbanpulse.citizen.area";

const STRINGS = {
  en: {
    title: "Flood relief token",
    open: "Open",
    close: "Close",
    help: "A ration card holder is paid Rs 6,000 at a ration shop. Your token names a shop, a day and an hour, so people are spread across shops and hours instead of queuing together.",
    card: "Ration card number",
    area: "Area",
    get: "Get token",
    lookupLink: "Already have a token? Look it up",
    lookup: "Look up token",
    back: "Back to getting a token",
    busy: "Please wait…",
    collect: "Collect Rs {amount} at {shop}, {day} {from}:00–{to}:00.",
    token: "Token {code}. Bring your ration card.",
    notFound: "No token found for this card number.",
    failed: "Could not connect. Please try again.",
    privacy: "Your card number is not stored; only a one-way code is kept to stop double payments.",
  },
  ta: {
    title: "வெள்ள நிவாரண டோக்கன்",
    open: "திற",
    close: "மூடு",
    help: "ரேஷன் அட்டைதாரருக்கு ரேஷன் கடையில் ரூ. 6,000 வழங்கப்படும். உங்கள் டோக்கன் கடை, நாள் மற்றும் நேரத்தைக் குறிக்கும், அதனால் கூட்டம் கடைகளுக்கும் நேரங்களுக்கும் பரவும்.",
    card: "ரேஷன் அட்டை எண்",
    area: "பகுதி",
    get: "டோக்கன் பெறு",
    lookupLink: "ஏற்கெனவே டோக்கன் உள்ளதா? தேடுங்கள்",
    lookup: "டோக்கனைத் தேடு",
    back: "டோக்கன் பெறுவதற்குத் திரும்பு",
    busy: "தயவுசெய்து காத்திருங்கள்…",
    collect: "{shop} ரேஷன் கடையில் ரூ. {amount} பெறுங்கள்: {day} {from}:00–{to}:00.",
    token: "டோக்கன் {code}. உங்கள் ரேஷன் அட்டையை கொண்டு வாருங்கள்.",
    notFound: "இந்த ரேஷன் அட்டை எண்ணுக்கு டோக்கன் எதுவும் இல்லை.",
    failed: "இணைக்க முடியவில்லை. மீண்டும் முயற்சிக்கவும்.",
    privacy: "உங்கள் ரேஷன் அட்டை எண் சேமிக்கப்படுவதில்லை; இரட்டைப் பணம் தடுக்க ஒரு வழி குறியீடு மட்டுமே வைக்கப்படும்.",
  },
};

const fill = (text, vars) => text.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");

function readSavedArea() {
  try {
    return localStorage.getItem(AREA_KEY);
  } catch {
    return null;
  }
}

export default function ReliefToken({ lang }) {
  const { locations } = useFloodData();
  const s = STRINGS[lang === "ta" ? "ta" : "en"];
  const [open, setOpen] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [card, setCard] = useState("");
  const [zoneChoice, setZoneChoice] = useState(readSavedArea);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [token, setToken] = useState(null);

  const zoneId = locations.some((l) => l.id === zoneChoice) ? zoneChoice : locations[0]?.id ?? "";

  // the server answers with a token or an error message; the card number is cleared either way
  const send = async (path, body) => {
    setBusy(true);
    setError("");
    setToken(null);
    try {
      const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(res.status === 404 ? s.notFound : data.error || s.failed);
        return;
      }
      setToken(data);
    } catch {
      setError(s.failed);
    } finally {
      setCard("");
      setBusy(false);
    }
  };

  const getToken = (e) => {
    e.preventDefault();
    send("/api/relief/token", { cardNumber: card, zoneId });
  };

  const lookup = (e) => {
    e.preventDefault();
    send("/api/relief/token/lookup", { cardNumber: card });
  };

  return (
    <section className="c-card">
      <div className="c-card-head">
        <h2>{s.title}</h2>
        <button type="button" className="btn ghost" aria-expanded={open} onClick={() => setOpen((v) => !v)}>{open ? s.close : s.open}</button>
      </div>
      {open && (
        <>
          <p className="muted small" style={{ margin: "0 0 10px" }}>{s.help}</p>
          <form onSubmit={lookingUp ? lookup : getToken}>
            <label className="field" style={{ marginBottom: 10 }}>
              <span className="field-label">{s.card}</span>
              <input className="input" type="text" autoComplete="off" value={card} onChange={(e) => setCard(e.target.value)} required />
            </label>
            {!lookingUp && (
              <label className="field" style={{ marginBottom: 10 }}>
                <span className="field-label">{s.area}</span>
                <select className="input" value={zoneId} onChange={(e) => setZoneChoice(e.target.value)}>
                  {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </label>
            )}
            <button className="btn full" disabled={busy || !zoneId}>{busy ? s.busy : lookingUp ? s.lookup : s.get}</button>
          </form>
          <button type="button" className="link-btn" style={{ marginTop: 10 }} onClick={() => { setLookingUp((v) => !v); setError(""); setToken(null); }}>
            {lookingUp ? s.back : s.lookupLink}
          </button>
          {token && (
            <div className="small" role="status" style={{ marginTop: 12 }}>
              <p style={{ margin: "0 0 6px" }}>
                {fill(s.collect, { amount: token.amountRs.toLocaleString("en-IN"), shop: token.shop.name, day: token.day, from: token.hour, to: token.hour + 1 })}
              </p>
              <p style={{ margin: 0 }}>{fill(s.token, { code: token.code })}</p>
            </div>
          )}
          {error && <div className="form-error" role="alert" style={{ marginTop: 10, marginBottom: 0 }}>{error}</div>}
          <p className="muted small" style={{ margin: "12px 0 0" }}>{s.privacy}</p>
        </>
      )}
    </section>
  );
}
