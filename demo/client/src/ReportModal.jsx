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

export default function ReportModal({ location, defaultZoneId, onClose, lang = "en" }) {
  const { locations, submitReport, pushToast } = useFloodData();
  const [zoneId, setZoneId] = useState(defaultZoneId ?? locations[0]?.id ?? "");
  const [category, setCategory] = useState("waterlogging");
  const [severity, setSeverity] = useState("medium");
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
      await submitReport({ lat, lng, category, severity, description: description.trim(), reporter: reporter.trim() });
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
