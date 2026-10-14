import { useState } from "react";
import { useFloodData } from "./FloodDataContext";

// This browser's own registrations, { id, zoneId, category, count }, so they can be cancelled later.
// The server keeps no names or addresses, and the id is the only link back to a registration.
const STORE_KEY = "urbanpulse.citizen.vulnerable";
const AREA_KEY = "urbanpulse.citizen.area";
const CATEGORY_IDS = ["elderly", "mobility", "medical", "infant"];

const STRINGS = {
  en: {
    title: "Someone at home needs help to evacuate?",
    open: "Open",
    close: "Close",
    help: "Only the number of people and the kind of help is stored — no names or addresses. In an evacuation, registered people get first claim on suitable shelter beds.",
    area: "Area",
    kind: "Kind of help needed",
    count: "How many people (1 to 10)",
    submit: "Register",
    saving: "Saving…",
    registered: "Registered. Keep this code to cancel:",
    failed: "Could not save. Please try again.",
    mine: "Your registrations",
    cancel: "Cancel",
    categories: { elderly: "Elderly", mobility: "Difficulty walking or using stairs", medical: "Needs medical support", infant: "Infant" },
  },
  ta: {
    title: "வீட்டில் வெளியேற உதவி தேவைப்படும் ஒருவர் இருக்கிறாரா?",
    open: "திற",
    close: "மூடு",
    help: "எத்தனை பேர் என்பதும் எந்த வகை உதவி என்பதும் மட்டுமே சேமிக்கப்படும், பெயர்களோ முகவரிகளோ இல்லை. வெளியேற்றத்தின்போது, பதிவு செய்தவர்களுக்குப் பொருத்தமான நிவாரண முகாம் படுக்கைகளில் முதல் உரிமை கிடைக்கும்.",
    area: "பகுதி",
    kind: "தேவைப்படும் உதவியின் வகை",
    count: "எத்தனை பேர் (1 முதல் 10 வரை)",
    submit: "பதிவு செய்",
    saving: "சேமிக்கிறது…",
    registered: "பதிவு செய்யப்பட்டது. ரத்து செய்ய இந்தக் குறியீட்டை வைத்திருங்கள்:",
    failed: "சேமிக்க முடியவில்லை. மீண்டும் முயற்சிக்கவும்.",
    mine: "உங்கள் பதிவுகள்",
    cancel: "ரத்து செய்",
    categories: { elderly: "முதியவர்", mobility: "நடக்க அல்லது படிகளில் ஏற சிரமப்படுபவர்", medical: "மருத்துவ உதவி தேவை", infant: "கைக்குழந்தை" },
  },
};

function readStored() {
  try {
    const list = JSON.parse(localStorage.getItem(STORE_KEY) ?? "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeStored(list) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(list));
  } catch {
    // private mode or blocked storage: the registration is still on the server, it just can't be listed here
  }
}

function readSavedArea() {
  try {
    return localStorage.getItem(AREA_KEY);
  } catch {
    return null;
  }
}

export default function VulnerableRegister({ lang }) {
  const { locations } = useFloodData();
  const s = STRINGS[lang === "ta" ? "ta" : "en"];
  const [open, setOpen] = useState(false);
  const [zoneChoice, setZoneChoice] = useState(readSavedArea);
  const [category, setCategory] = useState(CATEGORY_IDS[0]);
  const [count, setCount] = useState(1);
  const [mine, setMine] = useState(readStored);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [code, setCode] = useState("");

  const zoneId = locations.some((l) => l.id === zoneChoice) ? zoneChoice : locations[0]?.id ?? "";
  const zoneName = (id) => locations.find((l) => l.id === id)?.name ?? id;

  const register = async (e) => {
    e.preventDefault();
    const n = Math.min(10, Math.max(1, Math.round(Number(count)) || 1));
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/vulnerable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ zoneId, category, count: n }),
      });
      if (!res.ok) throw new Error("save");
      const { id } = await res.json();
      const next = [...mine, { id, zoneId, category, count: n }];
      setMine(next);
      writeStored(next);
      setCode(id.slice(0, 8));
    } catch {
      setError(s.failed);
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (id) => {
    setError("");
    try {
      const res = await fetch(`/api/vulnerable/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error("cancel");
    } catch {
      setError(s.failed);
      return;
    }
    const next = mine.filter((r) => r.id !== id);
    setMine(next);
    writeStored(next);
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
          <form onSubmit={register}>
            <label className="field" style={{ marginBottom: 10 }}>
              <span className="field-label">{s.area}</span>
              <select className="input" value={zoneId} onChange={(e) => setZoneChoice(e.target.value)}>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </label>
            <label className="field" style={{ marginBottom: 10 }}>
              <span className="field-label">{s.kind}</span>
              <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
                {CATEGORY_IDS.map((c) => <option key={c} value={c}>{s.categories[c]}</option>)}
              </select>
            </label>
            <label className="field" style={{ marginBottom: 10 }}>
              <span className="field-label">{s.count}</span>
              <input className="input" type="number" min={1} max={10} step={1} value={count} onChange={(e) => setCount(e.target.value)} required />
            </label>
            <button className="btn full" disabled={busy || !zoneId}>{busy ? s.saving : s.submit}</button>
          </form>
          {code && <p className="small" role="status" style={{ marginTop: 12 }}>{s.registered} <strong className="mono">{code}</strong></p>}
          {error && <div className="form-error" role="alert" style={{ marginTop: 10, marginBottom: 0 }}>{error}</div>}
          {mine.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <p className="field-label" style={{ margin: "0 0 6px" }}>{s.mine}</p>
              {mine.map((r) => (
                <div key={r.id} className="small" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span>{zoneName(r.zoneId)} · {s.categories[r.category]} · {r.count} · <span className="mono">{r.id.slice(0, 8)}</span></span>
                  <button type="button" className="link-btn" onClick={() => cancel(r.id)}>{s.cancel}</button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
