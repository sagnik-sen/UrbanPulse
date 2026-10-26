import { useEffect, useState } from "react";
import { useFloodData } from "./FloodDataContext";

// the request id is the only thing that lets this browser check on its boat later
const STORE_KEY = "urbanpulse.citizen.rescue";
const POLL_MS = 10000;
const TERMINAL = ["rescued", "cancelled", "gone"];
const NEEDS = ["medical", "elderly", "child", "disabled"];

const STRINGS = {
  en: {
    title: "Need rescue? Request a boat",
    intro: "Volunteer boats are matched to requests by the control room. Use this only if you need to be taken to safety.",
    people: "People needing a boat",
    needs: "Anyone with special needs?",
    medical: "Medical",
    elderly: "Elderly",
    child: "Child",
    disabled: "Disability",
    note: "Note (optional)",
    notePlaceholder: "e.g. ground floor, water to the waist, one wheelchair user",
    phone: "Phone (optional)",
    phoneHelp: "Only the control room sees your number.",
    usingMe: "Using your current location",
    usingArea: "Using the centre of {name}",
    submit: "Request a boat",
    submitting: "Sending…",
    error: "Could not send the request. If this is urgent, call 112.",
    cancelError: "Could not cancel right now. Try again.",
    checking: "Checking your request…",
    waiting: "Waiting for a boat",
    waitingText: "Your request is with the control room. Stay where you are if it is safe to do so.",
    onWay: "Boat {name} is on the way",
    onWayText: "Move to the water's edge where the boat can reach you, and keep your phone on.",
    rescued: "Marked rescued",
    rescuedText: "The control room has marked you as rescued.",
    cancelled: "Request cancelled",
    cancelledText: "This request is no longer active.",
    gone: "We cannot find this request any more",
    goneText: "The control room may have reset its records. Call 112 if you still need help.",
    cancel: "Cancel request",
    cancelling: "Cancelling…",
    again: "Request a boat again",
  },
  ta: {
    title: "மீட்புப் படகு தேவையா? படகு கோருங்கள்",
    intro: "தன்னார்வ படகுகள் கட்டுப்பாட்டு அறையால் கோரிக்கைகளுக்கு பொருத்தப்படும். பாதுகாப்பிற்கு அழைத்துச் செல்ல வேண்டியிருந்தால் மட்டும் பயன்படுத்தவும்.",
    people: "படகு தேவைப்படும் நபர்கள்",
    needs: "சிறப்புத் தேவை உடையவர்கள் உள்ளனரா?",
    medical: "மருத்துவம்",
    elderly: "முதியவர்",
    child: "குழந்தை",
    disabled: "மாற்றுத்திறனாளி",
    note: "குறிப்பு (விருப்பம்)",
    notePlaceholder: "எ.கா. தரைத் தளம், இடுப்பளவு தண்ணீர், சக்கர நாற்காலி பயன்படுத்துபவர் ஒருவர்",
    phone: "தொலைபேசி (விருப்பம்)",
    phoneHelp: "உங்கள் எண்ணை கட்டுப்பாட்டு அறை மட்டுமே பார்க்கும்.",
    usingMe: "உங்கள் தற்போதைய இருப்பிடம் பயன்படுத்தப்படுகிறது",
    usingArea: "{name} மையம் பயன்படுத்தப்படுகிறது",
    submit: "படகு கோருங்கள்",
    submitting: "அனுப்புகிறது…",
    error: "கோரிக்கையை அனுப்ப முடியவில்லை. இது அவசரம் என்றால் 112ஐ அழைக்கவும்.",
    cancelError: "இப்போது ரத்து செய்ய முடியவில்லை. மீண்டும் முயலவும்.",
    checking: "உங்கள் கோரிக்கையை சரிபார்க்கிறது…",
    waiting: "படகுக்காக காத்திருக்கிறது",
    waitingText: "உங்கள் கோரிக்கை கட்டுப்பாட்டு அறையில் உள்ளது. பாதுகாப்பாக இருந்தால் அதே இடத்தில் இருங்கள்.",
    onWay: "படகு {name} வந்துகொண்டிருக்கிறது",
    onWayText: "படகு உங்களை அடையக்கூடிய நீர் விளிம்புக்கு செல்லுங்கள். தொலைபேசியை இயக்கத்தில் வையுங்கள்.",
    rescued: "மீட்கப்பட்டதாக குறிக்கப்பட்டது",
    rescuedText: "கட்டுப்பாட்டு அறை உங்களை மீட்கப்பட்டவராக குறித்துள்ளது.",
    cancelled: "கோரிக்கை ரத்து செய்யப்பட்டது",
    cancelledText: "இந்தக் கோரிக்கை இனி செயலில் இல்லை.",
    gone: "இந்தக் கோரிக்கை இனி கிடைக்கவில்லை",
    goneText: "கட்டுப்பாட்டு அறை பதிவுகளை மீட்டமைத்திருக்கலாம். இன்னும் உதவி தேவைப்பட்டால் 112ஐ அழைக்கவும்.",
    cancel: "கோரிக்கையை ரத்து செய்",
    cancelling: "ரத்து செய்கிறது…",
    again: "மீண்டும் படகு கோருங்கள்",
  },
};

const tr = (lang, key, vars) => {
  const text = (STRINGS[lang] ?? STRINGS.en)[key] ?? STRINGS.en[key];
  return vars ? text.replace(/\{(\w+)\}/g, (m, name) => vars[name] ?? m) : text;
};

function readStoredId() {
  try {
    return localStorage.getItem(STORE_KEY);
  } catch {
    return null;
  }
}

function storeId(id) {
  try {
    if (id) localStorage.setItem(STORE_KEY, id);
    else localStorage.removeItem(STORE_KEY);
  } catch {
    // private mode / blocked storage: the request still works, it just is not remembered after a reload
  }
}

// citizen card: send a request, then follow it until a boat reaches you or it closes
export default function RescueRequest({ lang, area, coords }) {
  const { requestRescue, rescueStatus, cancelRescue } = useFloodData();
  const [active, setActive] = useState(() => {
    const id = readStoredId();
    return id ? { id } : null;
  });
  const [people, setPeople] = useState(1);
  const [needs, setNeeds] = useState([]);
  const [note, setNote] = useState("");
  const [phone, setPhone] = useState("");
  const [sending, setSending] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState("");

  const id = active?.id;
  const status = active?.status;
  useEffect(() => {
    if (!id || TERMINAL.includes(status)) return undefined;
    let cancelled = false;
    const check = () => rescueStatus(id)
      .then((s) => {
        if (cancelled) return;
        if (TERMINAL.includes(s.status)) storeId(null);
        setActive({ id, ...s });
      })
      .catch((err) => {
        if (cancelled || err.status !== 404) return;
        storeId(null);
        setActive({ id, status: "gone" });
      });
    check();
    const timer = setInterval(check, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [id, status]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleNeed = (need) => setNeeds((cur) => (cur.includes(need) ? cur.filter((n) => n !== need) : [...cur, need]));

  const submit = async (e) => {
    e.preventDefault();
    const at = coords ?? area;
    setSending(true);
    setError("");
    try {
      const r = await requestRescue({ lat: at.lat, lng: at.lng, people: Number(people), needs, note: note.trim(), contact: phone.replace(/[\s-]/g, "") });
      storeId(r.id);
      setActive({ id: r.id, status: r.status, boatName: null });
    } catch (err) {
      setError([400, 409, 429].includes(err.status) ? err.message : tr(lang, "error"));
    } finally {
      setSending(false);
    }
  };

  const cancel = async () => {
    setCancelling(true);
    setError("");
    try {
      const s = await cancelRescue(id);
      storeId(null);
      setActive({ id, ...s });
    } catch {
      setError(tr(lang, "cancelError"));
    } finally {
      setCancelling(false);
    }
  };

  const again = () => setActive(null);

  if (active) {
    const view = !status
      ? { tone: "warning", title: tr(lang, "checking"), text: "" }
      : status === "open"
        ? { tone: "warning", title: tr(lang, "waiting"), text: tr(lang, "waitingText") }
        : status === "assigned"
          ? { tone: "warning", title: tr(lang, "onWay", { name: active.boatName ?? "" }), text: tr(lang, "onWayText") }
          : status === "rescued"
            ? { tone: "safe", title: tr(lang, "rescued"), text: tr(lang, "rescuedText") }
            : status === "cancelled"
              ? { tone: "safe", title: tr(lang, "cancelled"), text: tr(lang, "cancelledText") }
              : { tone: "danger", title: tr(lang, "gone"), text: tr(lang, "goneText") };
    const closed = TERMINAL.includes(status);
    return (
      <section className={`c-status ${view.tone}`} aria-live="polite">
        <h2 className="c-status-title" style={{ fontSize: 17 }}>{view.title}</h2>
        {view.text && <p className="c-status-text" style={{ margin: "6px 0 0" }}>{view.text}</p>}
        {error && <div className="form-error" role="alert" style={{ marginTop: 10, marginBottom: 0 }}>{error}</div>}
        <div style={{ marginTop: 12 }}>
          {closed ? (
            <button type="button" className="btn ghost" onClick={again}>{tr(lang, "again")}</button>
          ) : (
            <button type="button" className="btn ghost" onClick={cancel} disabled={cancelling || !status}>{cancelling ? tr(lang, "cancelling") : tr(lang, "cancel")}</button>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="c-card" style={{ border: "2px solid #d03b3b" }}>
      <div className="c-card-head"><h2>{tr(lang, "title")}</h2></div>
      <p className="muted small" style={{ margin: "0 0 12px" }}>{tr(lang, "intro")}</p>
      <form onSubmit={submit}>
        <label className="field">
          <span className="field-label">{tr(lang, "people")}</span>
          <input className="input" type="number" min={1} max={30} value={people} onChange={(e) => setPeople(e.target.value)} required />
        </label>

        <fieldset className="field">
          <legend className="field-label">{tr(lang, "needs")}</legend>
          <div className="segmented" style={{ flexWrap: "wrap" }}>
            {NEEDS.map((n) => (
              <label key={n} className={`segment ${needs.includes(n) ? "on" : ""}`}>
                <input type="checkbox" checked={needs.includes(n)} onChange={() => toggleNeed(n)} />
                {tr(lang, n)}
              </label>
            ))}
          </div>
        </fieldset>

        <label className="field">
          <span className="field-label">{tr(lang, "note")}</span>
          <textarea className="input" rows={2} maxLength={200} placeholder={tr(lang, "notePlaceholder")} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>

        <label className="field">
          <span className="field-label">{tr(lang, "phone")}</span>
          <input className="input" type="tel" inputMode="tel" maxLength={20} value={phone} onChange={(e) => setPhone(e.target.value)} />
          <span className="field-hint">{tr(lang, "phoneHelp")}</span>
        </label>

        <p className="muted small" style={{ margin: "0 0 12px" }}>{coords ? tr(lang, "usingMe") : tr(lang, "usingArea", { name: area.name })}</p>

        {error && <div className="form-error" role="alert">{error}</div>}
        <button className="btn danger full" disabled={sending}>{sending ? tr(lang, "submitting") : tr(lang, "submit")}</button>
      </form>
    </section>
  );
}
