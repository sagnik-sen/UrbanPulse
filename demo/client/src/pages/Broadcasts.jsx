import { useState } from "react";
import QRCode from "qrcode";
import { useFloodData } from "../FloodDataContext";
import { useAuth } from "../AuthContext";
import { timeAgo, formatCount } from "../constants";
import { VERIFIER_URL, encode } from "../verifier";
import { explainReason } from "../AlertReason";

const TEMPLATES = [
  { label: "Evacuation order", severity: "danger", text: "EVACUATE NOW: Rising flood waters in your area. Proceed to the nearest relief shelter. Do not attempt to cross flooded roads." },
  { label: "Heavy rain advisory", severity: "warning", text: "ADVISORY: Heavy rainfall expected over the next 6 hours. Avoid non-essential travel and keep emergency supplies ready." },
  { label: "Power shutdown", severity: "warning", text: "SAFETY: Power supply suspended in low-lying areas as a precaution against electrocution. Stay away from fallen wires." },
  { label: "All clear", severity: "info", text: "ALL CLEAR: Water levels have receded. Roads are reopening. Report any damage via the UrbanPulse app." },
];

const SEV_COLOR = { info: "#3987e5", warning: "#fab219", danger: "#d03b3b" };
const CHANNEL_LABEL = { sms: "SMS", push: "App push", siren: "Sirens" };

export default function Broadcasts() {
  const { broadcasts, locations, sendBroadcast, pushToast } = useFloodData();
  const { can } = useAuth();
  const [zoneId, setZoneId] = useState("all");
  const [severity, setSeverity] = useState("warning");
  const [channels, setChannels] = useState(["sms", "push"]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [posterBusy, setPosterBusy] = useState(null);
  const [posterNote, setPosterNote] = useState(null);
  const [poster, setPoster] = useState(null);

  const makePoster = async (code) => {
    setPosterBusy(code);
    setPosterNote(null);
    try {
      const res = await fetch(`/api/alerts/verify/${code}`);
      const data = await res.json();
      if (data.status !== "verified") {
        setPosterNote({ code, text: data.status === "pending" ? "Seal it first: anchor the audit log, then try again." : `Cannot make a poster QR yet (status: ${data.status ?? "not found"}).` });
        return;
      }
      const url = VERIFIER_URL + "#" + encode(data.proof, data.txHash);
      const dataUrl = await QRCode.toDataURL(url, { errorCorrectionLevel: "L", margin: 2, width: 512 });
      setPoster({ code, url, dataUrl });
    } catch (err) {
      setPosterNote({ code, text: err.message });
    } finally {
      setPosterBusy(null);
    }
  };

  const recipients = zoneId === "all"
    ? locations.reduce((s, l) => s + l.population, 0)
    : locations.find((l) => l.id === zoneId)?.population ?? 0;

  const toggleChannel = (c) => setChannels((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));

  const send = async (e) => {
    e.preventDefault();
    if (!message.trim()) return setError("Message cannot be empty.");
    if (channels.length === 0) return setError("Pick at least one channel.");
    setSending(true);
    try {
      await sendBroadcast({ zoneId, severity, channels, message: message.trim() });
      pushToast({ kind: "info", title: "Broadcast sent", text: `Reached ~${formatCount(recipients)} residents` });
      setMessage("");
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="grid-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
      {!can.manage ? (
        <div className="panel">
          <div className="panel-head"><h2>Compose Public Alert</h2></div>
          <p className="muted small">Only control-room admins can send public alerts. Automated alerts still go out when an incident opens, and you can follow everything in the history.</p>
        </div>
      ) : (
      <form className="panel" onSubmit={send}>
        <div className="panel-head"><h2>Compose Public Alert</h2></div>

        <div className="template-row">
          {TEMPLATES.map((t) => (
            <button type="button" key={t.label} className="chip-btn" onClick={() => { setMessage(t.text); setSeverity(t.severity); setError(""); }}>{t.label}</button>
          ))}
        </div>

        <label className="field">
          <span className="field-label">Target area</span>
          <select className="input" value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
            <option value="all">All monitored zones</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>

        <fieldset className="field">
          <legend className="field-label">Severity</legend>
          <div className="segmented">
            {Object.keys(SEV_COLOR).map((k) => (
              <label key={k} className={`segment ${severity === k ? "on" : ""}`}>
                <input type="radio" name="bseverity" checked={severity === k} onChange={() => setSeverity(k)} />
                <span className="badge-dot" style={{ background: SEV_COLOR[k] }} />{k[0].toUpperCase() + k.slice(1)}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="field">
          <legend className="field-label">Channels</legend>
          <div className="check-row">
            {Object.entries(CHANNEL_LABEL).map(([k, v]) => (
              <label key={k} className="check"><input type="checkbox" checked={channels.includes(k)} onChange={() => toggleChannel(k)} /> {v}</label>
            ))}
          </div>
        </fieldset>

        <label className="field">
          <span className="field-label">Message</span>
          <textarea className="input" rows={4} maxLength={280} value={message} onChange={(e) => { setMessage(e.target.value); setError(""); }} placeholder="Pick a template above or write your own" />
          <span className="field-hint">{message.length}/280 (+ verification code) · est. {formatCount(recipients)} recipients</span>
        </label>

        {error && <div className="form-error" role="alert">{error}</div>}
        <button className="btn" type="submit" disabled={sending}>{sending ? "Sending…" : "Send broadcast"}</button>
      </form>
      )}

      <div className="panel">
        <div className="panel-head">
          <h2>Broadcast History</h2>
          <span className="muted small">{broadcasts.length} sent</span>
        </div>
        <div className="feed" style={{ maxHeight: 560 }}>
          {broadcasts.length === 0 && <div className="empty">No broadcasts yet. Automated alerts appear here when an incident opens.</div>}
          {broadcasts.map((b) => (
            <div key={b.id} className="feed-item" style={{ borderLeft: `3px solid ${SEV_COLOR[b.severity] ?? SEV_COLOR.info}` }}>
              <div style={{ flex: 1 }}>
                <div className="feed-meta">
                  <span className={`source-tag ${b.source}`}>{b.source === "auto" ? "AUTOMATED" : "MANUAL"}</span>
                  <span>{b.zoneName}</span>
                  <span>·</span>
                  <span>{b.channels.map((c) => CHANNEL_LABEL[c]).join(", ")}</span>
                </div>
                <div className="feed-text">{b.message}</div>
                {b.reason && <div className="muted small" style={{ marginTop: 4 }}>{explainReason(b.reason, "en").join(" ")}</div>}
                <div className="feed-time">{timeAgo(b.ts)} · ~{formatCount(b.recipients)} recipients{b.code && <> · code <span className="mono">{b.code}</span></>}</div>
                {b.code && (
                  <button type="button" className="btn ghost" style={{ marginTop: 8, padding: "3px 10px", fontSize: 12 }} disabled={posterBusy === b.code} onClick={() => makePoster(b.code)}>
                    {posterBusy === b.code ? "Making QR…" : "Poster QR"}
                  </button>
                )}
                {posterNote?.code === b.code && <div className="form-error" style={{ marginTop: 8, marginBottom: 0 }}>{posterNote.text}</div>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {poster && (
        <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setPoster(null)}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="poster-title">
            <div className="modal-head">
              <h2 id="poster-title">Poster QR for <span className="mono">{poster.code}</span></h2>
              <button type="button" className="icon-btn" onClick={() => setPoster(null)} aria-label="Close">×</button>
            </div>
            <div className="modal-body">
              {!VERIFIER_URL && <div className="form-error">The verifier page is not published yet, so this QR does not open it. Set VITE_VERIFIER_URL in client/.env.local first.</div>}
              <img src={poster.dataUrl} alt={`QR code for alert ${poster.code}`} width={256} height={256} style={{ alignSelf: "center", background: "#fff", borderRadius: 8 }} />
              <span className="muted small">URL length: {poster.url.length} characters</span>
              <a className="btn ghost" href={poster.dataUrl} download={`urbanpulse-alert-${poster.code}.png`} style={{ alignSelf: "center" }}>Download PNG</a>
              <div className="mono" style={{ fontSize: 12, wordBreak: "break-all", userSelect: "text", background: "#111", border: "1px solid #2c2c2a", borderRadius: 8, padding: 8 }}>{poster.url}</div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
