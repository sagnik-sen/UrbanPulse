import { useCallback, useEffect, useRef, useState } from "react";
import { Circle, CircleMarker, Polyline, Tooltip, useMap } from "react-leaflet";
import { useFloodData } from "./FloodDataContext";

export function useEvacuation() {
  const { planEvacuation } = useFloodData();
  const [state, setState] = useState({ plan: null, loading: false, error: "" });
  const requestId = useRef(0);

  const planFrom = useCallback(async (lat, lng) => {
    const id = ++requestId.current; // a newer click wins over a slower earlier request
    setState((s) => ({ ...s, loading: true, error: "" }));
    try {
      const plan = await planEvacuation(lat, lng);
      if (id === requestId.current) setState({ plan: { ...plan, plannedAt: Date.now() }, loading: false, error: "" });
    } catch (err) {
      if (id === requestId.current) setState({ plan: null, loading: false, error: err.message });
    }
  }, [planEvacuation]);

  const clear = useCallback(() => {
    requestId.current++;
    setState({ plan: null, loading: false, error: "" });
  }, []);

  return { ...state, planFrom, clear };
}

const ZONE_RADIUS_M = 1500; // matches server ZONE_RADIUS_KM, the radius routing treats as flooded

export function DangerZones({ locations }) {
  return locations
    .filter((l) => l.risk === "danger")
    .map((l) => (
      <Circle key={l.id} center={[l.lat, l.lng]} radius={ZONE_RADIUS_M} interactive={false}
        pathOptions={{ color: "#d03b3b", weight: 1, dashArray: "4 4", fillColor: "#d03b3b", fillOpacity: 0.12 }} />
    ));
}

export function RouteLayer({ plan }) {
  const map = useMap();

  useEffect(() => {
    if (plan) map.fitBounds(plan.route.coords, { padding: [60, 60], maxZoom: 15 });
  }, [plan, map]);

  if (!plan) return null;
  const dashed = plan.source === "fallback" ? "8 8" : undefined;
  return (
    <>
      <Polyline positions={plan.route.coords} pathOptions={{ color: "#ffffff", weight: 9, opacity: 0.9 }} interactive={false} />
      <Polyline positions={plan.route.coords} pathOptions={{ color: "#3987e5", weight: 5, dashArray: dashed }} interactive={false} />
      <CircleMarker center={[plan.from.lat, plan.from.lng]} radius={8} pathOptions={{ color: "#fff", fillColor: "#3987e5", fillOpacity: 1, weight: 3 }}>
        <Tooltip permanent direction="top" offset={[0, -8]}>Start</Tooltip>
      </CircleMarker>
      <CircleMarker center={[plan.shelter.lat, plan.shelter.lng]} radius={12} pathOptions={{ color: "#fff", fillColor: "#199e70", fillOpacity: 1, weight: 3 }}>
        <Tooltip permanent direction="top" offset={[0, -12]}>🏫 {plan.shelter.name}</Tooltip>
      </CircleMarker>
    </>
  );
}

export function RouteSummary({ plan, loading, error, onClear }) {
  if (loading) return <div className="route-card"><div className="muted small">Finding the safest route…</div></div>;
  if (error) return <div className="route-card"><div className="form-error" style={{ margin: 0 }}>{error}</div></div>;
  if (!plan) return null;

  const { route, shelter } = plan;
  const free = shelter.capacity - shelter.occupancy;
  const startsInFlood = plan.originZone.risk === "danger";

  return (
    <div className="route-card" role="region" aria-label="Evacuation route">
      <div className="route-card-head">
        <strong>Evacuate to {shelter.name}</strong>
        {onClear && <button className="icon-btn" onClick={onClear} aria-label="Clear route">×</button>}
      </div>
      <div className="route-stats">
        <div><span className="route-num">{route.distanceKm}</span> km</div>
        <div><span className="route-num">{route.durationMin}</span> min drive</div>
        <div><span className="route-num">{free}</span> beds free</div>
      </div>
      {route.expectedFloodKm >= 0.1 ? (
        <div className="route-note danger">
          ⚠ ~{route.expectedFloodKm} km likely flooded by the time you pass{startsInFlood ? ", mostly unavoidable leaving " + plan.originZone.name : ""}. Move slowly, avoid moving water.
        </div>
      ) : (
        <div className="route-note safe">✓ Route expected to stay clear of floodwater along the way</div>
      )}
      {plan.avoided.length > 0 && <div className="route-note">↪ Rerouted around {plan.avoided.join(", ")}</div>}
      {plan.source === "fallback" && <div className="route-note">Road routing unavailable, showing straight-line direction only.</div>}
      <div className="muted small">Planned {new Date(plan.plannedAt).toLocaleTimeString()} using the live forecast{onClear ? " · click the map to re-plan" : ""}</div>
    </div>
  );
}
