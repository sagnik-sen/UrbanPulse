import { useEffect, useRef, useState } from "react";
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
          </div>
        ))}
      </section>

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
