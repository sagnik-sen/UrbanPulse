import { useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useFloodData } from "../FloodDataContext";
import { useLang } from "../i18n";

const MAX_PEOPLE = 15;

const STRINGS = {
  en: {
    sub: "Shelter check-in",
    lang: "Language",
    loading: "Loading shelter…",
    notFound: "This shelter was not found. Check the code on the poster and try again.",
    free: "{n} beds free",
    peopleLabel: "People checking in",
    less: "Fewer people",
    more: "More people",
    checkIn: "Check in",
    checking: "Checking in…",
    needCode: "Scan the code printed at the shelter. This page needs that code to check in or out.",
    badCode: "This code is not valid for this shelter. Scan the code on the poster at the shelter.",
    full: "This shelter does not have room for {n} people.",
    nearby: "Nearby shelters with free beds:",
    kmAway: "{km} km away",
    network: "Could not reach UrbanPulse. Check your connection and try again.",
    welcome: "Welcome. You are checked in.",
    code: "Household code {code}",
    desk: "Show this code at the desk. Leaving? Check out here.",
    checkOut: "Check out",
    checkingOut: "Checking out…",
  },
  ta: {
    sub: "முகாம் பதிவு",
    lang: "மொழி",
    loading: "முகாம் விவரங்கள் ஏற்றப்படுகின்றன…",
    notFound: "இந்த முகாம் கிடைக்கவில்லை. சுவரொட்டியில் உள்ள குறியீட்டைச் சரிபார்த்து மீண்டும் முயலுங்கள்.",
    free: "{n} படுக்கைகள் காலியாக உள்ளன",
    peopleLabel: "பதிவு செய்பவர்கள் எண்ணிக்கை",
    less: "குறைக்க",
    more: "கூட்ட",
    checkIn: "பதிவு செய்",
    checking: "பதிவு செய்யப்படுகிறது…",
    needCode: "பதிவு செய்ய அல்லது வெளியேற முகாமில் அச்சிடப்பட்ட குறியீட்டை ஸ்கேன் செய்யுங்கள்.",
    badCode: "இந்தக் குறியீடு இந்த முகாமுக்குச் செல்லாது. முகாமில் உள்ள சுவரொட்டியின் குறியீட்டை ஸ்கேன் செய்யுங்கள்.",
    full: "இந்த முகாமில் {n} பேருக்கு இடமில்லை.",
    nearby: "இடம் உள்ள அருகிலுள்ள முகாம்கள்:",
    kmAway: "{km} கி.மீ தொலைவில்",
    network: "UrbanPulse-ஐ அடைய முடியவில்லை. இணைப்பைச் சரிபார்த்து மீண்டும் முயலுங்கள்.",
    welcome: "வரவேற்கிறோம். நீங்கள் பதிவு செய்யப்பட்டுள்ளீர்கள்.",
    code: "குடும்பக் குறியீடு {code}",
    desk: "இந்தக் குறியீட்டை மேசையில் காட்டுங்கள். வெளியேறுகிறீர்களா? இங்கேயே வெளியேறுங்கள்.",
    checkOut: "வெளியேறு",
    checkingOut: "வெளியேறப்படுகிறது…",
  },
};

const fill = (text, vars) => Object.entries(vars).reduce((out, [k, v]) => out.replace(`{${k}}`, v), text);
const freeBeds = (s) => Math.max(0, s.capacity - s.occupancy);
// rough km between two nearby points; fine for ranking shelters across one city
const distanceKm = (a, b) => Math.hypot(a.lat - b.lat, (a.lng - b.lng) * Math.cos((a.lat * Math.PI) / 180)) * 111;
const householdKey = (shelterId) => `urbanpulse.checkin.${shelterId}`;

function readHousehold(shelterId) {
  try {
    return localStorage.getItem(householdKey(shelterId));
  } catch {
    // private mode / blocked storage: the household is not remembered, so check-out needs a fresh check-in
    return null;
  }
}

function saveHousehold(shelterId, householdId) {
  try {
    if (householdId) localStorage.setItem(householdKey(shelterId), householdId);
    else localStorage.removeItem(householdKey(shelterId));
  } catch {
    // see readHousehold
  }
}

// status 0 means the request never reached the server
async function post(path, body) {
  try {
    const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { status: res.status, data: await res.json().catch(() => ({})) };
  } catch {
    return { status: 0, data: {} };
  }
}

export default function CheckIn() {
  const { shelterId } = useParams();
  const [params] = useSearchParams();
  const token = params.get("t") || "";
  const { shelters } = useFloodData();
  const [lang, setLang] = useLang();
  const s = STRINGS[lang === "ta" ? "ta" : "en"];

  const shelter = shelters.find((x) => x.id === shelterId);
  const [householdId, setHouseholdId] = useState(() => readHousehold(shelterId));
  const [people, setPeople] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const nearby = shelter
    ? shelters
        .filter((x) => x.id !== shelter.id && freeBeds(x) >= people)
        .sort((a, b) => distanceKm(shelter, a) - distanceKm(shelter, b))
        .slice(0, 3)
    : [];

  // 403 and 409 are shown as messages; a network failure gets its own text
  const failure = ({ status, data }) => {
    if (status === 0) return s.network;
    if (status === 403) return s.badCode;
    if (status === 409) return fill(s.full, { n: people });
    return data.error || s.network;
  };

  const checkIn = async () => {
    setBusy(true);
    setError(null);
    const { status, data } = await post(`/api/shelters/${shelterId}/checkin`, { token, people });
    setBusy(false);
    if (status === 200) {
      saveHousehold(shelterId, data.householdId);
      setHouseholdId(data.householdId);
    } else {
      setError({ text: failure({ status, data }), full: status === 409 });
    }
  };

  const checkOut = async () => {
    setBusy(true);
    setError(null);
    const { status, data } = await post(`/api/shelters/${shelterId}/checkout`, { token, householdId });
    setBusy(false);
    // 404: the check-in is already gone, so this device should forget it too
    if (status === 200 || status === 404) {
      saveHousehold(shelterId, null);
      setHouseholdId(null);
    } else {
      setError({ text: failure({ status, data }) });
    }
  };

  return (
    <div className="citizen" lang={lang === "ta" ? "ta" : "en"}>
      <header className="citizen-header">
        <div className="brand">
          <div className="brand-mark">UP</div>
          <div>
            <div className="brand-name">UrbanPulse Chennai</div>
            <div className="brand-sub">{s.sub}</div>
          </div>
        </div>
        <div role="group" aria-label={s.lang} style={{ display: "flex", gap: 4 }}>
          <button type="button" className="btn ghost" aria-pressed={lang === "en"} onClick={() => setLang("en")}>EN</button>
          <button type="button" className="btn ghost" aria-pressed={lang === "ta"} onClick={() => setLang("ta")}>தமிழ்</button>
        </div>
      </header>

      {!shelter ? (
        <section className="c-card">
          <p className="muted" style={{ margin: 0 }}>{shelters.length ? s.notFound : s.loading}</p>
        </section>
      ) : (
        <>
          <section className="c-card">
            <div className="c-card-head">
              <h2>{shelter.name}</h2>
              <span className="muted small">{fill(s.free, { n: freeBeds(shelter) })}</span>
            </div>
            {!token && <div className="form-error" role="alert" style={{ marginBottom: 0 }}>{s.needCode}</div>}
          </section>

          {householdId ? (
            <section className="c-status safe">
              <h1 className="c-status-title">{s.welcome}</h1>
              <p className="c-status-text"><strong>{fill(s.code, { code: householdId.slice(0, 8).toUpperCase() })}</strong></p>
              <p className="c-status-text" style={{ marginTop: 6 }}>{s.desk}</p>
              {error && <div className="form-error" role="alert" style={{ marginTop: 12, marginBottom: 0 }}>{error.text}</div>}
              <button className="btn danger full" style={{ marginTop: 16 }} onClick={checkOut} disabled={busy || !token}>
                {busy ? s.checkingOut : s.checkOut}
              </button>
            </section>
          ) : (
            <section className="c-card">
              <h2 style={{ marginBottom: 12 }}>{s.peopleLabel}</h2>
              <div className="btn-row" style={{ alignItems: "center", justifyContent: "center", marginTop: 0 }}>
                <button type="button" className="btn ghost" aria-label={s.less} onClick={() => setPeople((n) => Math.max(1, n - 1))} disabled={people <= 1}>−</button>
                <span aria-live="polite" style={{ fontSize: 40, minWidth: 64, textAlign: "center" }}>{people}</span>
                <button type="button" className="btn ghost" aria-label={s.more} onClick={() => setPeople((n) => Math.min(MAX_PEOPLE, n + 1))} disabled={people >= MAX_PEOPLE}>+</button>
              </div>
              {error && (
                <div className="form-error" role="alert" style={{ marginTop: 14 }}>
                  {error.text}
                  {error.full && nearby.length > 0 && (
                    <>
                      <div className="small" style={{ marginTop: 8 }}>{s.nearby}</div>
                      <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                        {nearby.map((x) => (
                          <li key={x.id} className="small">{x.name} · {fill(s.free, { n: freeBeds(x) })} · {fill(s.kmAway, { km: distanceKm(shelter, x).toFixed(1) })}</li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              )}
              <button className="btn full" style={{ marginTop: 16 }} onClick={checkIn} disabled={busy || !token}>
                {busy ? s.checking : s.checkIn}
              </button>
            </section>
          )}
        </>
      )}
    </div>
  );
}
