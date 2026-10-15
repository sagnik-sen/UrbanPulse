import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { MapContainer, TileLayer } from "react-leaflet";
import { useFloodData } from "../FloodDataContext";
import { STATUS, rainLabel, hourLabel } from "../constants";
import { t, useLang } from "../i18n";
import MapReady from "../MapReady";
import ReportModal from "../ReportModal";
import RescueRequest from "../RescueRequest";
import VulnerableRegister from "../VulnerableRegister";
import ReliefToken from "../ReliefToken";
import Toasts from "../Toasts";
import OfflineBanner, { offlineCheckText } from "../OfflineBanner";
import SmsDemo from "../SmsDemo";
import AlertReason from "../AlertReason";
import SpeakAlert from "../SpeakAlert";
import { loadSnapshot } from "../offline";
import { DangerZones, RouteLayer, RouteSummary, useEvacuation } from "../EvacuationRoute";

const AREA_KEY = "urbanpulse.citizen.area";
const SPEAK_KEY = "urbanpulse.citizen.speakAlerts";
const SPEAK_TEXT = { en: "Read new danger alerts aloud", ta: "புதிய ஆபத்து எச்சரிக்கைகளை சத்தமாக வாசிக்கவும்" };
const SEV_COLOR = { info: "#3987e5", warning: "#fab219", danger: "#d03b3b" };

const GUIDANCE = {
  danger: { title: "guide.danger.title", text: "guide.danger.text" },
  warning: { title: "guide.warning.title", text: "guide.warning.text" },
  safe: { title: "guide.safe.title", text: "guide.safe.text" },
};

const EMERGENCY = [
  { label: "emergency.helpline", number: "1913" },
  { label: "emergency.emergency", number: "112" },
  { label: "emergency.state", number: "1070" },
];

// rainLabel() returns these English labels; they map to translation keys
const RAIN_KEY = {
  "No rain": "rain.none",
  "Light rain": "rain.light",
  "Moderate rain": "rain.moderate",
  "Heavy rain": "rain.heavy",
  "Very heavy rain": "rain.veryHeavy",
};

const CHECK = {
  verified: { tone: "safe" },
  pending: { tone: "warning" },
  unreachable: { tone: "warning" },
  unavailable: { tone: "warning" },
  tampered: { tone: "danger" },
  notfound: { tone: "danger" },
};

const langButtonStyle = (on) => (on ? { color: "#fff", borderColor: "#3987e5" } : undefined);

// accepts the whole pasted message, "UP-1A2B3C4D", "up-1a2b3c4d" or just the 8 characters
const normalizeCode = (raw) => {
  const inText = raw.toUpperCase().match(/UP-[0-9A-F]{8}/);
  if (inText) return inText[0];
  const c = raw.trim().toUpperCase().replace(/\s+/g, "");
  return /^[0-9A-F]{8}$/.test(c) ? `UP-${c}` : c;
};

// Forwarded flood messages are a known problem in Chennai; every official alert carries a code
// that anyone can check against its blockchain seal.
// request: { code } set by an alert's "Check it's genuine" link (a new object each click)
function AlertCheck({ request, lang }) {
  const [params] = useSearchParams();
  const [code, setCode] = useState(params.get("verify") ?? "");
  const [result, setResult] = useState(null);
  const [checking, setChecking] = useState(false);
  const cardRef = useRef(null);

  const check = async (raw) => {
    const c = normalizeCode(raw);
    setCode(c);
    setChecking(true);
    try {
      const res = await fetch(`/api/alerts/verify/${encodeURIComponent(c)}`);
      if (res.status >= 500) throw new Error(`HTTP ${res.status}`); // proxy error while the server is down
      const data = await res.json().catch(() => ({}));
      if (res.status === 404) setResult({ status: "notfound", code: c });
      else if (!res.ok) setResult(data.error ? { error: data.error } : { errorKey: "verify.failed" });
      else setResult(data);
    } catch {
      // no connection: match the code against the alerts this phone saved earlier
      const saved = loadSnapshot()?.broadcasts?.find((b) => b.code === c);
      setResult({ error: offlineCheckText(lang, saved?.message) });
    } finally {
      setChecking(false);
    }
  };
  // run once for a ?verify=UP-... link (e.g. tapped from an SMS), then for each alert-list click
  const initial = useRef(params.get("verify"));
  useEffect(() => { if (initial.current) check(initial.current); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!request) return;
    cardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    check(request.code);
  }, [request]); // eslint-disable-line react-hooks/exhaustive-deps

  const downloadProof = () => {
    const blob = new Blob([JSON.stringify(result.proof, null, 2)], { type: "application/json" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `urbanpulse-alert-${result.alert.code}.json` });
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const errorText = result?.errorKey ? t(lang, result.errorKey) : result?.error;
  const view = result?.status && CHECK[result.status];
  return (
    <section className="c-card" ref={cardRef}>
      <div className="c-card-head"><h2>{t(lang, "verify.title")}</h2></div>
      <p className="muted small" style={{ margin: "0 0 10px" }}>{t(lang, "verify.help")}</p>
      <form className="inline-form" onSubmit={(e) => { e.preventDefault(); if (code.trim()) check(code); }}>
        <input className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder={t(lang, "verify.placeholder")} aria-label={t(lang, "verify.aria")} autoCapitalize="characters" spellCheck={false} />
        <button className="btn" disabled={checking || !code.trim()}>{checking ? t(lang, "verify.checking") : t(lang, "verify.check")}</button>
      </form>
      {errorText && <div className="form-error" role="alert" style={{ marginTop: 10, marginBottom: 0 }}>{errorText}</div>}
      {view && (
        <div className={`c-status ${view.tone}`} role="status" style={{ marginTop: 12 }}>
          <div className="c-status-title" style={{ fontSize: 17 }}>{t(lang, `check.${result.status}.title`)}</div>
          <p className="small" style={{ margin: "4px 0 0" }}>{t(lang, `check.${result.status}.text`)}</p>
          {result.alert && (
            <>
              <div className="c-alert" style={{ borderLeftColor: SEV_COLOR[result.alert.severity] ?? SEV_COLOR.info, marginTop: 10, marginBottom: 6 }}>
                <div className="c-alert-meta"><span>{result.alert.code}</span><span>·</span><span>{result.alert.zone}</span><span>·</span><span>{new Date(result.alert.issuedAt).toLocaleString()}</span></div>
                <div className="c-alert-text">{result.alert.message}</div>
              </div>
              <AlertReason reason={result.alert.reason} lang={lang} sealed={result.status === "verified"} />
              <div className="small" style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                {result.explorer && result.txHash && <a href={`${result.explorer}/tx/${result.txHash}`} target="_blank" rel="noreferrer">{t(lang, "check.viewRecord")}</a>}
                {result.proof && <button type="button" className="link-btn" onClick={downloadProof}>{t(lang, "check.download")}</button>}
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}

function readSavedArea() {
  try {
    return localStorage.getItem(AREA_KEY);
  } catch {
    return null;
  }
}

function readSavedSpeak() {
  try {
    return localStorage.getItem(SPEAK_KEY) === "1";
  } catch {
    return false;
  }
}

function forecastText(lang, hours) {
  if (hours == null) return null;
  const minutes = Math.round(hours * 60);
  return minutes < 60 ? t(lang, "forecast.minutes", { n: minutes }) : t(lang, "forecast.hours", { n: hours });
}

// same time bands as constants.timeAgo, with translated wording
function timeAgoText(lang, ts) {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return t(lang, "ago.s", { n: s });
  if (s < 3600) return t(lang, "ago.m", { n: Math.round(s / 60) });
  return t(lang, "ago.h", { n: Math.round(s / 3600) });
}

export default function Citizen() {
  const { locations, broadcasts, connected, rainfall } = useFloodData();
  const [lang, setLang] = useLang();
  const [areaId, setAreaId] = useState(readSavedArea);
  const [coords, setCoords] = useState(null);
  const [geoError, setGeoError] = useState("");
  const [locating, setLocating] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [checkRequest, setCheckRequest] = useState(null);
  const [autoSpeak, setAutoSpeak] = useState(readSavedSpeak);
  const evac = useEvacuation();
  const { planFrom, clear } = evac;
  const autoPlannedFor = useRef(null);

  const area = locations.find((l) => l.id === areaId) ?? locations[0];

  const areaKey = area?.id;
  useEffect(() => {
    if (!areaKey) return;
    try {
      localStorage.setItem(AREA_KEY, areaKey);
    } catch {
      // private mode / blocked storage: the picker still works, it just won't be remembered
    }
  }, [areaKey]);

  // when your area floods, show the safe route without making you ask
  useEffect(() => {
    if (!area || area.risk !== "danger" || autoPlannedFor.current === area.id) return;
    autoPlannedFor.current = area.id;
    const origin = coords ?? area;
    planFrom(origin.lat, origin.lng);
  }, [area, coords, planFrom]);

  const toggleSpeak = (on) => {
    setAutoSpeak(on);
    try {
      localStorage.setItem(SPEAK_KEY, on ? "1" : "0");
    } catch {
      // blocked storage: the toggle still works for this visit
    }
  };

  const chooseArea = (id) => {
    setAreaId(id);
    setCoords(null);
    autoPlannedFor.current = null;
    clear();
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) return setGeoError("geo.unsupported");
    setLocating(true);
    setGeoError("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const nearest = locations.reduce((best, l) => ((l.lat - here.lat) ** 2 + (l.lng - here.lng) ** 2 < (best.lat - here.lat) ** 2 + (best.lng - here.lng) ** 2 ? l : best));
        setAreaId(nearest.id);
        setCoords(here);
        autoPlannedFor.current = null;
        clear();
        setLocating(false);
      },
      () => {
        setGeoError("geo.failed");
        setLocating(false);
      },
      { timeout: 8000 }
    );
  };

  if (!area) return <div className="citizen" lang={lang === "ta" ? "ta" : "en"}><p className="muted" style={{ padding: 24 }}>{t(lang, "loading")}</p></div>;

  const guide = GUIDANCE[area.risk];
  const soon = area.risk !== "danger" ? forecastText(lang, area.forecastHours) : null;
  const alerts = broadcasts.filter((b) => b.zoneId === "all" || b.zoneId === area.id).slice(0, 5);
  const origin = coords ?? area;

  return (
    <div className="citizen" lang={lang === "ta" ? "ta" : "en"}>
      <OfflineBanner lang={lang} />
      <header className="citizen-header">
        <div className="brand">
          <div className="brand-mark">UP</div>
          <div>
            <div className="brand-name">UrbanPulse Chennai</div>
            <div className="brand-sub">{t(lang, "brand.sub")}</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div role="group" aria-label={t(lang, "lang.label")} style={{ display: "flex", gap: 4 }}>
            <button type="button" className="btn ghost" aria-pressed={lang === "en"} style={langButtonStyle(lang === "en")} onClick={() => setLang("en")}>{t(lang, "lang.en")}</button>
            <button type="button" className="btn ghost" aria-pressed={lang === "ta"} style={langButtonStyle(lang === "ta")} onClick={() => setLang("ta")}>{t(lang, "lang.ta")}</button>
          </div>
          <span className="live-pill"><span className={`dot ${connected ? "on" : "off"}`} />{connected ? t(lang, "live") : t(lang, "offline")}</span>
        </div>
      </header>

      <section className="c-card">
        <label className="field" style={{ marginBottom: 10 }}>
          <span className="field-label">{t(lang, "area.label")}</span>
          <select className="input" value={area.id} onChange={(e) => chooseArea(e.target.value)}>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>
        <button className="btn ghost full" onClick={useMyLocation} disabled={locating}>{locating ? t(lang, "area.locating") : t(lang, "area.locate")}</button>
        {coords && <div className="muted small" style={{ marginTop: 8 }}>{t(lang, "area.using", { name: area.name })}</div>}
        {geoError && <div className="form-error" role="alert" style={{ marginTop: 10, marginBottom: 0 }}>{t(lang, geoError)}</div>}
      </section>

      <section className={`c-status ${area.risk}`} aria-live="polite">
        <div className="c-status-top">
          <span className="badge"><span className="badge-dot" style={{ background: STATUS[area.risk].color }} />{t(lang, `status.${area.risk}`)}</span>
          <span className="muted small">{t(lang, "level", { level: area.level })}</span>
        </div>
        <h1 className="c-status-title">{t(lang, guide.title)}</h1>
        <p className="c-status-text">{t(lang, guide.text)}</p>
        {soon && area.risk === "warning" && <p className="c-status-forecast">{t(lang, "forecast.warning", { when: soon })}</p>}
        {soon && area.risk === "safe" && <p className="c-status-forecast">{t(lang, "forecast.rising", { when: soon })}</p>}
        {rainfall?.zones?.[area.id] && (() => {
          const r = rainfall.zones[area.id];
          return (
            <p className="c-rain">
              {t(lang, "rain.line", { label: t(lang, RAIN_KEY[rainLabel(r.currentMmPerHr)]), mm: r.currentMmPerHr, next: r.next24hMm })}
              {r.peakMmPerHr >= 2.5 && <> {t(lang, "rain.peak", { time: hourLabel(r.peakAt) })}</>}
            </p>
          );
        })()}
      </section>

      <section className="c-card">
        <div className="c-card-head">
          <h2>{t(lang, "shelter.title")}</h2>
          {!evac.plan && !evac.loading && <button className="btn" onClick={() => planFrom(origin.lat, origin.lng)}>{t(lang, "route.show")}</button>}
        </div>
        {(evac.plan || evac.loading || evac.error) ? (
          <>
            <div className="c-map">
              <MapContainer className="dark-map" center={[origin.lat, origin.lng]} zoom={13} style={{ height: "100%", width: "100%" }} scrollWheelZoom={false}>
                <TileLayer attribution='&copy; OpenStreetMap &middot; OSRM' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                <MapReady />
                <DangerZones locations={locations} />
                <RouteLayer plan={evac.plan} lang={lang} />
              </MapContainer>
            </div>
            <RouteSummary plan={evac.plan} loading={evac.loading} error={evac.error} lang={lang} />
          </>
        ) : (
          <p className="muted small">{t(lang, "route.intro")}</p>
        )}
      </section>

      <section className="c-card">
        <div className="c-card-head"><h2>{t(lang, "alerts.title")}</h2><span className="muted small">{t(lang, "alerts.scope", { area: area.name })}</span></div>
        {lang === "ta" && <p className="muted small" style={{ margin: "0 0 10px" }}>{t(lang, "note.alertsEnglish")}</p>}
        <label className="small" style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 0 10px" }}>
          <input type="checkbox" checked={autoSpeak} onChange={(e) => toggleSpeak(e.target.checked)} />
          {SPEAK_TEXT[lang]}
        </label>
        {alerts.length === 0 && <p className="muted small">{t(lang, "alerts.none")}</p>}
        {alerts.map((b) => (
          <div key={b.id} className="c-alert" style={{ borderLeftColor: SEV_COLOR[b.severity] ?? SEV_COLOR.info }}>
            <div className="c-alert-meta">
              {Date.now() - b.ts < 60000 && <span className="new-pill">{t(lang, "alerts.new")}</span>}
              <span>{b.zoneName}</span><span>·</span><span>{timeAgoText(lang, b.ts)}</span>
            </div>
            <div className="c-alert-text">{b.message}</div>
            <SpeakAlert text={b.message} lang={lang} alert={b} auto={autoSpeak} />
            <AlertReason reason={b.reason} lang={lang} />
            {b.code && (
              <div className="c-alert-meta" style={{ marginTop: 6, marginBottom: 0 }}>
                <button type="button" className="link-btn" onClick={() => setCheckRequest({ code: b.code })}>{t(lang, "alerts.check")}</button>
              </div>
            )}
          </div>
        ))}
      </section>

      <AlertCheck request={checkRequest} lang={lang} />

      <VulnerableRegister lang={lang} />
      <button className="btn danger c-report-btn" onClick={() => setReportOpen(true)}>{t(lang, "report.open")}</button>
      <RescueRequest lang={lang} area={area} coords={coords} />
      <ReliefToken lang={lang} />

      <section className="c-card">
        <h2 style={{ marginBottom: 10 }}>{t(lang, "emergency.title")}</h2>
        {EMERGENCY.map((e) => (
          <a key={e.number} className="c-phone" href={`tel:${e.number}`}>
            <span>{t(lang, e.label)}</span><strong>{e.number}</strong>
          </a>
        ))}
      </section>

      <SmsDemo lang={lang} />

      <p className="muted small c-foot">{t(lang, "foot")}</p>
      {lang === "ta" && <p className="muted small c-foot">{t(lang, "note.draft")}</p>}

      {reportOpen && (
        <ReportModal
          location={coords ?? undefined}
          defaultZoneId={area.id}
          onClose={() => setReportOpen(false)}
          lang={lang}
        />
      )}
      <Toasts showLinks={false} kinds={["info"]} />
    </div>
  );
}
