import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { MapContainer, TileLayer } from "react-leaflet";
import { useFloodData } from "../FloodDataContext";
import { STATUS, timeAgo, rainLabel, hourLabel } from "../constants";
import MapReady from "../MapReady";
import ReportModal from "../ReportModal";
import Toasts from "../Toasts";
import { DangerZones, RouteLayer, RouteSummary, useEvacuation } from "../EvacuationRoute";

const AREA_KEY = "urbanpulse.citizen.area";
const SEV_COLOR = { info: "#3987e5", warning: "#fab219", danger: "#d03b3b" };

const GUIDANCE = {
  danger: { title: "Flooding in your area", text: "Move to higher ground or the nearest relief shelter now. Do not walk or drive through moving water." },
  warning: { title: "Water levels rising", text: "Stay alert. Avoid low-lying roads and underpasses, and keep phones charged and documents in a waterproof bag." },
  safe: { title: "No flood risk right now", text: "Conditions are normal. Keep this page handy during the monsoon season." },
};

const EMERGENCY = [
  { label: "GCC Flood Helpline", number: "1913" },
  { label: "Emergency (Police / Fire / Ambulance)", number: "112" },
  { label: "TN State Disaster Control Room", number: "1070" },
];

const CHECK = {
  verified: { tone: "safe", title: "✓ Genuine official alert", text: "Issued by UrbanPulse and sealed on the Shardeum blockchain. The text below is exactly what was sent." },
  pending: { tone: "warning", title: "Official alert, seal pending", text: "Issued by UrbanPulse in the last few minutes. It is sealed on the blockchain within 5 minutes." },
  unreachable: { tone: "warning", title: "Official alert found", text: "The blockchain check is unavailable right now. Compare the text below with the message you received." },
  unavailable: { tone: "warning", title: "Official alert found", text: "Compare the text below with the message you received." },
  tampered: { tone: "danger", title: "✗ Record altered", text: "Our record of this alert no longer matches its blockchain seal. Do not act on it; call 1913." },
  notfound: { tone: "danger", title: "✗ Not an official alert", text: "No UrbanPulse alert has this code. Treat the message as a rumour and do not forward it." },
};

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
function AlertCheck({ request }) {
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
      const data = await res.json().catch(() => ({}));
      if (res.status === 404) setResult({ status: "notfound", code: c });
      else if (!res.ok) setResult({ error: data.error || "Could not check right now" });
      else setResult(data);
    } catch {
      setResult({ error: "Could not reach UrbanPulse. Check your connection." });
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

  const view = result?.status && CHECK[result.status];
  return (
    <section className="c-card" ref={cardRef}>
      <div className="c-card-head"><h2>Got a forwarded flood message?</h2></div>
      <p className="muted small" style={{ margin: "0 0 10px" }}>Every official alert ends with "Verify: UP-…". Paste the message or just its code to check it is real and unchanged.</p>
      <form className="inline-form" onSubmit={(e) => { e.preventDefault(); if (code.trim()) check(code); }}>
        <input className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Paste the message or UP-1A2B3C4D" aria-label="Alert message or code" autoCapitalize="characters" spellCheck={false} />
        <button className="btn" disabled={checking || !code.trim()}>{checking ? "Checking…" : "Check"}</button>
      </form>
      {result?.error && <div className="form-error" role="alert" style={{ marginTop: 10, marginBottom: 0 }}>{result.error}</div>}
      {view && (
        <div className={`c-status ${view.tone}`} role="status" style={{ marginTop: 12 }}>
          <div className="c-status-title" style={{ fontSize: 17 }}>{view.title}</div>
          <p className="small" style={{ margin: "4px 0 0" }}>{view.text}</p>
          {result.alert && (
            <>
              <div className="c-alert" style={{ borderLeftColor: SEV_COLOR[result.alert.severity] ?? SEV_COLOR.info, marginTop: 10, marginBottom: 6 }}>
                <div className="c-alert-meta"><span>{result.alert.code}</span><span>·</span><span>{result.alert.zone}</span><span>·</span><span>{new Date(result.alert.issuedAt).toLocaleString()}</span></div>
                <div className="c-alert-text">{result.alert.message}</div>
              </div>
              <div className="small" style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                {result.explorer && result.txHash && <a href={`${result.explorer}/tx/${result.txHash}`} target="_blank" rel="noreferrer">View blockchain record ↗</a>}
                {result.proof && <button type="button" className="link-btn" onClick={downloadProof}>Download proof</button>}
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

function forecastText(hours) {
  if (hours == null) return null;
  const minutes = Math.round(hours * 60);
  return minutes < 60 ? `about ${minutes} minutes` : `about ${hours} hours`;
}

export default function Citizen() {
  const { locations, broadcasts, connected, rainfall } = useFloodData();
  const [areaId, setAreaId] = useState(readSavedArea);
  const [coords, setCoords] = useState(null);
  const [geoError, setGeoError] = useState("");
  const [locating, setLocating] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [checkRequest, setCheckRequest] = useState(null);
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

  const chooseArea = (id) => {
    setAreaId(id);
    setCoords(null);
    autoPlannedFor.current = null;
    clear();
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) return setGeoError("Location isn't available on this device.");
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
        setGeoError("Couldn't get your location. Pick your area from the list instead.");
        setLocating(false);
      },
      { timeout: 8000 }
    );
  };

  if (!area) return <div className="citizen"><p className="muted" style={{ padding: 24 }}>Loading live flood data…</p></div>;

  const guide = GUIDANCE[area.risk];
  const soon = area.risk !== "danger" ? forecastText(area.forecastHours) : null;
  const alerts = broadcasts.filter((b) => b.zoneId === "all" || b.zoneId === area.id).slice(0, 5);
  const origin = coords ?? area;

  return (
    <div className="citizen">
      <header className="citizen-header">
        <div className="brand">
          <div className="brand-mark">UP</div>
          <div>
            <div className="brand-name">UrbanPulse Chennai</div>
            <div className="brand-sub">Citizen flood information</div>
          </div>
        </div>
        <span className="live-pill"><span className={`dot ${connected ? "on" : "off"}`} />{connected ? "Live" : "Offline"}</span>
      </header>

      <section className="c-card">
        <label className="field" style={{ marginBottom: 10 }}>
          <span className="field-label">Your area</span>
          <select className="input" value={area.id} onChange={(e) => chooseArea(e.target.value)}>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>
        <button className="btn ghost full" onClick={useMyLocation} disabled={locating}>{locating ? "Locating…" : "📍 Use my location"}</button>
        {coords && <div className="muted small" style={{ marginTop: 8 }}>Using your location · nearest sensor zone: {area.name}</div>}
        {geoError && <div className="form-error" role="alert" style={{ marginTop: 10, marginBottom: 0 }}>{geoError}</div>}
      </section>

      <section className={`c-status ${area.risk}`} aria-live="polite">
        <div className="c-status-top">
          <span className="badge"><span className="badge-dot" style={{ background: STATUS[area.risk].color }} />{STATUS[area.risk].label}</span>
          <span className="muted small">Water level {area.level}%</span>
        </div>
        <h1 className="c-status-title">{guide.title}</h1>
        <p className="c-status-text">{guide.text}</p>
        {soon && area.risk === "warning" && <p className="c-status-forecast">Forecast: may reach danger level in {soon}.</p>}
        {soon && area.risk === "safe" && <p className="c-status-forecast">Forecast: levels rising, danger possible in {soon}.</p>}
        {rainfall?.zones?.[area.id] && (() => {
          const r = rainfall.zones[area.id];
          return (
            <p className="c-rain">
              🌧 {rainLabel(r.currentMmPerHr)} now ({r.currentMmPerHr} mm/h) · {r.next24hMm} mm expected in the next 24 h
              {r.peakMmPerHr >= 2.5 && <> · heaviest around {hourLabel(r.peakAt)}</>}
            </p>
          );
        })()}
      </section>

      <section className="c-card">
        <div className="c-card-head">
          <h2>Nearest safe shelter</h2>
          {!evac.plan && !evac.loading && <button className="btn" onClick={() => planFrom(origin.lat, origin.lng)}>Show safe route</button>}
        </div>
        {(evac.plan || evac.loading || evac.error) ? (
          <>
            <div className="c-map">
              <MapContainer className="dark-map" center={[origin.lat, origin.lng]} zoom={13} style={{ height: "100%", width: "100%" }} scrollWheelZoom={false}>
                <TileLayer attribution='&copy; OpenStreetMap &middot; OSRM' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                <MapReady />
                <DangerZones locations={locations} />
                <RouteLayer plan={evac.plan} />
              </MapContainer>
            </div>
            <RouteSummary plan={evac.plan} loading={evac.loading} error={evac.error} />
          </>
        ) : (
          <p className="muted small">Get a driving route to the nearest shelter with space, avoiding flooded areas.</p>
        )}
      </section>

      <section className="c-card">
        <div className="c-card-head"><h2>Official alerts</h2><span className="muted small">{area.name} &amp; city-wide</span></div>
        {alerts.length === 0 && <p className="muted small">No alerts for your area.</p>}
        {alerts.map((b) => (
          <div key={b.id} className="c-alert" style={{ borderLeftColor: SEV_COLOR[b.severity] ?? SEV_COLOR.info }}>
            <div className="c-alert-meta">
              {Date.now() - b.ts < 60000 && <span className="new-pill">NEW</span>}
              <span>{b.zoneName}</span><span>·</span><span>{timeAgo(b.ts)}</span>
            </div>
            <div className="c-alert-text">{b.message}</div>
            {b.code && (
              <div className="c-alert-meta" style={{ marginTop: 6, marginBottom: 0 }}>
                <button type="button" className="link-btn" onClick={() => setCheckRequest({ code: b.code })}>Check it&apos;s genuine</button>
              </div>
            )}
          </div>
        ))}
      </section>

      <AlertCheck request={checkRequest} />

      <button className="btn danger c-report-btn" onClick={() => setReportOpen(true)}>🚨 Report flooding near me</button>

      <section className="c-card">
        <h2 style={{ marginBottom: 10 }}>Emergency numbers</h2>
        {EMERGENCY.map((e) => (
          <a key={e.number} className="c-phone" href={`tel:${e.number}`}>
            <span>{e.label}</span><strong>{e.number}</strong>
          </a>
        ))}
      </section>

      <p className="muted small c-foot">Demo prototype. Water levels are simulated, not official data.</p>

      {reportOpen && (
        <ReportModal
          location={coords ?? undefined}
          defaultZoneId={area.id}
          onClose={() => setReportOpen(false)}
        />
      )}
      <Toasts showLinks={false} kinds={["info"]} />
    </div>
  );
}
