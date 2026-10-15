import { useEffect, useRef, useState } from "react";
import { useFloodData } from "./FloodDataContext";
import { CATEGORIES, SEVERITY } from "./constants";
import { t } from "./i18n";

function nearest(locations, lat, lng) {
  return locations.reduce((best, l) => {
    const d = (l.lat - lat) ** 2 + (l.lng - lng) ** 2;
    return !best || d < best.d ? { loc: l, d } : best;
  }, null)?.loc;
}

// water depth as people describe it; cm is a rough body-height reference for the control room
// the severity a chosen depth implies (same mapping as fusion-live.js); the reporter can still change it
const DEPTH_SEVERITY = { ankle: "low", knee: "medium", waist: "high", chest: "high" };

export const DEPTHS = {
  ankle: { cm: 10, en: "Ankle deep", ta: "கணுக்கால் ஆழம்", waterY: 56 },
  knee: { cm: 50, en: "Knee deep", ta: "முழங்கால் ஆழம்", waterY: 44 },
  waist: { cm: 100, en: "Waist deep", ta: "இடுப்பு ஆழம்", waterY: 27 },
  chest: { cm: 130, en: "Chest deep", ta: "மார்பு ஆழம்", waterY: 15 },
};

const DEPTH_TEXT = {
  en: { question: "How deep is the water where you are?", unsure: "Not sure", cm: "cm" },
  ta: { question: "நீங்கள் இருக்கும் இடத்தில் தண்ணீர் எவ்வளவு ஆழம்?", unsure: "தெரியவில்லை", cm: "செ.மீ." },
};

// a person standing in water up to the line; the body is 60 units tall
function DepthPicture({ waterY }) {
  return (
    <svg width="36" height="54" viewBox="0 0 40 60" aria-hidden="true">
      <rect x="0" y={waterY} width="40" height={60 - waterY} fill="#3987e5" opacity="0.45" />
      <line x1="0" x2="40" y1={waterY} y2={waterY} stroke="#7fb2f0" strokeWidth="2" />
      <circle cx="20" cy="6" r="5" fill="currentColor" />
      <rect x="14" y="12" width="12" height="22" rx="3" fill="currentColor" />
      <rect x="14" y="34" width="5" height="26" fill="currentColor" />
      <rect x="21" y="34" width="5" height="26" fill="currentColor" />
    </svg>
  );
}

// reporter trust is keyed on this id; if storage is blocked, it lasts only for this page load
const DEVICE_KEY = "urbanpulse.citizen.device";
let pageDeviceId;
function citizenDeviceId() {
  try {
    const saved = localStorage.getItem(DEVICE_KEY);
    if (saved) return saved;
    const id = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, id);
    return id;
  } catch {
    pageDeviceId ??= crypto.randomUUID();
    return pageDeviceId;
  }
}

export default function ReportModal({ location, defaultZoneId, onClose, lang = "en" }) {
  const { locations, submitReport, pushToast } = useFloodData();
  const [zoneId, setZoneId] = useState(defaultZoneId ?? locations[0]?.id ?? "");
  const [category, setCategory] = useState("waterlogging");
  const [severity, setSeverity] = useState("medium");
  const [depth, setDepth] = useState(null);
  const [description, setDescription] = useState("");
  const [reporter, setReporter] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const firstField = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // parent re-renders every sensor tick with a fresh onClose; run once so focus isn't stolen mid-typing
  useEffect(() => {
    firstField.current?.focus();
    const onKey = (e) => e.key === "Escape" && onCloseRef.current();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const zone = location ? nearest(locations, location.lat, location.lng) : locations.find((l) => l.id === zoneId);

  const submit = async (e) => {
    e.preventDefault();
    if (!description.trim()) {
      setError(t(lang, "report.needDescription"));
      return;
    }
    const lat = location ? location.lat : zone.lat + (Math.random() - 0.5) * 0.01;
    const lng = location ? location.lng : zone.lng + (Math.random() - 0.5) * 0.01;
    setSubmitting(true);
    try {
      await submitReport({ lat, lng, category, severity, depth, description: description.trim(), reporter: reporter.trim(), deviceId: citizenDeviceId() });
      pushToast({ kind: "info", title: t(lang, "report.filed"), text: t(lang, "report.routed", { zone: zone?.name ?? t(lang, "report.nearestZone") }) });
      onClose();
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal" role="dialog" aria-modal="true" aria-labelledby="report-title" onSubmit={submit}>
        <div className="modal-head">
          <h2 id="report-title">{t(lang, "report.title")}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={t(lang, "report.close")}>×</button>
        </div>

        <div className="modal-body">
          {location ? (
            <div className="location-chip">
              📍 {location.lat.toFixed(4)}, {location.lng.toFixed(4)} · {t(lang, "report.nearestZone")} <strong>{zone?.name}</strong>
            </div>
          ) : (
            <label className="field">
              <span className="field-label">{t(lang, "report.zone")}</span>
              <select className="input" value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </label>
          )}

          <label className="field">
            <span className="field-label">{t(lang, "report.issue")}</span>
            <select ref={firstField} className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
              {Object.keys(CATEGORIES).map((k) => <option key={k} value={k}>{t(lang, `category.${k}`)}</option>)}
            </select>
          </label>

          <fieldset className="field">
            <legend className="field-label">{t(lang, "report.severity")}</legend>
            <div className="segmented">
              {Object.entries(SEVERITY).map(([k, v]) => (
                <label key={k} className={`segment ${severity === k ? "on" : ""}`}>
                  <input type="radio" name="severity" value={k} checked={severity === k} onChange={() => setSeverity(k)} />
                  <span className="badge-dot" style={{ background: v.color }} />
                  {t(lang, `severity.${k}`)}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="field">
            <legend className="field-label">{DEPTH_TEXT[lang].question}</legend>
            <div className="segmented" style={{ flexWrap: "wrap" }}>
              {Object.entries(DEPTHS).map(([k, d]) => (
                <label key={k} className={`segment ${depth === k ? "on" : ""}`} style={{ flex: "1 1 40%", flexDirection: "column", padding: 10, fontSize: 14 }}>
                  <input type="radio" name="depth" value={k} checked={depth === k} onChange={() => { setDepth(k); setSeverity(DEPTH_SEVERITY[k]); }} />
                  <DepthPicture waterY={d.waterY} />
                  <span>{d[lang]} · ~{d.cm} {DEPTH_TEXT[lang].cm}</span>
                </label>
              ))}
              <label className={`segment ${depth === null ? "on" : ""}`} style={{ flex: "1 1 100%", padding: 10, fontSize: 14 }}>
                <input type="radio" name="depth" checked={depth === null} onChange={() => setDepth(null)} />
                <span>{DEPTH_TEXT[lang].unsure}</span>
              </label>
            </div>
          </fieldset>

          <label className="field">
            <span className="field-label">{t(lang, "report.description")}</span>
            <textarea
              className="input"
              rows={3}
              maxLength={500}
              placeholder={t(lang, "report.placeholder")}
              value={description}
              onChange={(e) => { setDescription(e.target.value); setError(""); }}
            />
            <span className="field-hint">{description.length}/500</span>
          </label>

          <label className="field">
            <span className="field-label">{t(lang, "report.name")} <span className="muted">{t(lang, "report.optional")}</span></span>
            <input className="input" maxLength={60} value={reporter} onChange={(e) => setReporter(e.target.value)} placeholder={t(lang, "report.anonymous")} />
          </label>

          {error && <div className="form-error" role="alert">{error}</div>}
        </div>

        <div className="modal-foot">
          <button type="button" className="btn ghost" onClick={onClose}>{t(lang, "report.cancel")}</button>
          <button type="submit" className="btn" disabled={submitting}>{submitting ? t(lang, "report.submitting") : t(lang, "report.submit")}</button>
        </div>
      </form>
    </div>
  );
}
