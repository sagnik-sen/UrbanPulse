import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { MapContainer, TileLayer, CircleMarker, Popup, Tooltip, useMapEvents } from "react-leaflet";
import { useFloodData } from "../FloodDataContext";
import { STATUS, CATEGORIES, SEVERITY, REPORT_STATUS } from "../constants";
import MapReady from "../MapReady";
import ReportModal, { DEPTHS } from "../ReportModal";
import { DangerZones, RouteLayer, RouteSummary, useEvacuation } from "../EvacuationRoute";

function MapClicks({ onClick }) {
  useMapEvents({ click(e) { onClick(e.latlng); } });
  return null;
}

export default function LiveMap() {
  const { locations, reports, shelters } = useFloodData();
  const [params, setParams] = useSearchParams();
  const [mode, setMode] = useState(params.get("evacFrom") ? "evacuate" : "report");
  const [clicked, setClicked] = useState(null);
  const [layers, setLayers] = useState({ zones: true, shelters: true, reports: true });
  const evac = useEvacuation();
  const { planFrom } = evac;
  const deepLinked = useRef(false);

  // /map?evacFrom=<zoneId> plans from that zone's centre once zone data has loaded
  useEffect(() => {
    const zoneId = params.get("evacFrom");
    const zone = locations.find((l) => l.id === zoneId);
    if (!zone || deepLinked.current) return;
    deepLinked.current = true;
    planFrom(zone.lat, zone.lng);
    setParams({}, { replace: true });
  }, [params, locations, planFrom, setParams]);

  const toggle = (k) => setLayers((prev) => ({ ...prev, [k]: !prev[k] }));
  const onMapClick = (latlng) => (mode === "report" ? setClicked(latlng) : planFrom(latlng.lat, latlng.lng));

  return (
    <section className="panel" style={{ padding: 0, overflow: "hidden" }}>
      <div className="panel-head" style={{ padding: "18px 18px 0", flexWrap: "wrap", gap: 12 }}>
        <h2>Live Risk Map</h2>
        <div className="layer-toggles">
          {[["zones", "Sensor zones"], ["shelters", "Relief shelters"], ["reports", "Citizen reports"]].map(([k, label]) => (
            <label key={k} className="check">
              <input type="checkbox" checked={layers[k]} onChange={() => toggle(k)} /> {label}
            </label>
          ))}
        </div>
      </div>

      <div className="map-toolbar">
        <span className="muted small">Map click:</span>
        <div className="segmented compact" role="radiogroup" aria-label="Map click action">
          <label className={`segment ${mode === "report" ? "on" : ""}`}>
            <input type="radio" name="mapmode" checked={mode === "report"} onChange={() => setMode("report")} />📍 File report
          </label>
          <label className={`segment ${mode === "evacuate" ? "on" : ""}`}>
            <input type="radio" name="mapmode" checked={mode === "evacuate"} onChange={() => setMode("evacuate")} />🧭 Plan evacuation
          </label>
        </div>
        <span className="muted small">
          {mode === "report" ? "Click where flooding is happening." : "Click a starting point. Routes use real roads and avoid danger zones (red rings)."}
        </span>
      </div>

      <div className="map-wrap">
        <MapContainer className={`dark-map ${mode === "evacuate" ? "evac-mode" : ""}`} center={[12.98, 80.23]} zoom={12} style={{ height: "620px", width: "100%" }}>
          <TileLayer attribution='&copy; OpenStreetMap contributors &middot; routing &copy; OSRM' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <MapReady />
          <MapClicks onClick={onMapClick} />
          <DangerZones locations={locations} />

          {layers.zones && locations.map((loc) => (
            <CircleMarker key={loc.id} bubblingMouseEvents={false} center={[loc.lat, loc.lng]} radius={16} pathOptions={{ color: STATUS[loc.risk].color, fillColor: STATUS[loc.risk].color, fillOpacity: 0.7, weight: 2 }}>
              <Tooltip direction="top" offset={[0, -14]}>{loc.name} · {loc.level}%</Tooltip>
              <Popup>
                <strong>{loc.name}</strong><br />
                Water level: {loc.level}% ({STATUS[loc.risk].label})<br />
                {loc.forecastHours != null && <>Forecast to critical: ~{loc.forecastHours}h<br /></>}
                <Link to={`/sensors/${loc.id}`}>Open zone detail →</Link>
              </Popup>
            </CircleMarker>
          ))}

          {layers.shelters && shelters.map((s) => (
            <CircleMarker key={s.id} bubblingMouseEvents={false} center={[s.lat, s.lng]} radius={9} pathOptions={{ color: "#ffffff", fillColor: "#199e70", fillOpacity: 1, weight: 2 }}>
              <Popup><strong>🏫 {s.name}</strong><br />Occupancy: {s.occupancy}/{s.capacity} ({Math.round((s.occupancy / s.capacity) * 100)}%)</Popup>
            </CircleMarker>
          ))}

          {layers.reports && reports.map((r) => (
            <CircleMarker key={r.id} bubblingMouseEvents={false} center={[r.lat, r.lng]} radius={6} pathOptions={{ color: "#ffffff", fillColor: SEVERITY[r.severity].color, fillOpacity: 1, weight: 1.5 }}>
              <Popup>
                <strong>{CATEGORIES[r.category]}</strong> · {SEVERITY[r.severity].label} severity<br />
                {r.depth && <>Water: {r.depth}-deep (~{DEPTHS[r.depth].cm} cm)<br /></>}
                {r.description}<br />
                <span style={{ color: "#666" }}>{r.reporter} · {REPORT_STATUS[r.status].label}</span>
              </Popup>
            </CircleMarker>
          ))}

          <RouteLayer plan={evac.plan} />
        </MapContainer>

        <div className="map-legend">
          <div className="legend-title">Legend</div>
          {Object.values(STATUS).map((s) => (
            <div key={s.label} className="legend-chip"><span className="legend-swatch" style={{ background: s.color }} />Zone · {s.label}</div>
          ))}
          <div className="legend-chip"><span className="legend-swatch ring-dashed" />Flood radius (avoided)</div>
          <div className="legend-chip"><span className="legend-swatch ring" style={{ background: "#199e70" }} />Relief shelter</div>
          <div className="legend-chip"><span className="legend-swatch small ring" style={{ background: "#fab219" }} />Citizen report</div>
          <div className="legend-chip"><span className="legend-line" />Evacuation route</div>
        </div>

        <div className="route-overlay">
          <RouteSummary plan={evac.plan} loading={evac.loading} error={evac.error} onClear={evac.clear} />
        </div>
      </div>

      {clicked && <ReportModal location={clicked} onClose={() => setClicked(null)} />}
    </section>
  );
}
