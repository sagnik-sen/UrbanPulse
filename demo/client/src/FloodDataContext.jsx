import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { io } from "socket.io-client";

export const SERVER_URL = "http://localhost:4000";
const FloodDataContext = createContext(null);

const fmtTime = (ts) => new Date(ts).toLocaleTimeString();

async function api(path, method, body) {
  const res = await fetch(`${SERVER_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

// module-level so its identity is stable across the provider's per-tick re-renders
async function planEvacuation(lat, lng) {
  const res = await fetch(`${SERVER_URL}/api/evacuation-route?lat=${lat}&lng=${lng}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Could not plan a route");
  return data;
}

export function FloodDataProvider({ children }) {
  const [locations, setLocations] = useState([]);
  const [history, setHistory] = useState({});
  const [trend, setTrend] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [reports, setReports] = useState([]);
  const [broadcasts, setBroadcasts] = useState([]);
  const [shelters, setShelters] = useState([]);
  const [teams, setTeams] = useState([]);
  const [thresholds, setThresholds] = useState({ warning: 40, danger: 70 });
  const [connected, setConnected] = useState(false);
  const [toasts, setToasts] = useState([]);

  const pushToast = useCallback((toast) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, ...toast }].slice(-4));
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 6000);
  }, []);

  const dismissToast = (id) => setToasts((prev) => prev.filter((t) => t.id !== id));

  useEffect(() => {
    let cancelled = false;
    fetch(`${SERVER_URL}/api/state`)
      .then((r) => r.json())
      .then((s) => {
        if (cancelled) return;
        setLocations(s.locations);
        setHistory(Object.fromEntries(Object.entries(s.history).map(([id, arr]) => [id, arr.map((p) => ({ time: fmtTime(p.ts), level: p.level }))])));
        setIncidents(s.incidents);
        setReports(s.reports);
        setBroadcasts(s.broadcasts);
        setShelters(s.shelters);
        setTeams(s.teams);
        setThresholds(s.thresholds);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const socket = io(SERVER_URL);
    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));

    socket.on("sensor-update", (payload) => {
      setLocations(payload);
      const time = fmtTime(payload[0]?.ts ?? Date.now());
      setHistory((prev) => {
        const next = { ...prev };
        payload.forEach((p) => { next[p.id] = [...(next[p.id] || []), { time, level: p.level }].slice(-200); });
        return next;
      });
      setTrend((prev) => {
        const point = { time };
        payload.forEach((p) => { point[p.id] = p.level; });
        point.avg = Math.round(payload.reduce((s, p) => s + p.level, 0) / payload.length);
        return [...prev, point].slice(-40);
      });
    });

    const upsert = (setter) => (item) => setter((prev) => (prev.some((x) => x.id === item.id) ? prev.map((x) => (x.id === item.id ? item : x)) : [item, ...prev]));

    socket.on("incident-opened", (inc) => {
      upsert(setIncidents)(inc);
      pushToast({ kind: "danger", title: "New incident", text: `${inc.zoneName} crossed danger threshold (${inc.peakLevel}%)`, link: "/incidents" });
    });
    socket.on("incident-updated", upsert(setIncidents));
    socket.on("citizen-report", (r) => {
      upsert(setReports)(r);
      if (r.severity === "high") pushToast({ kind: "warning", title: "High-severity citizen report", text: `${r.zoneName}: ${r.description}`, link: "/reports" });
    });
    socket.on("report-updated", upsert(setReports));
    socket.on("broadcast", upsert(setBroadcasts));
    socket.on("shelters-update", setShelters);
    socket.on("thresholds-updated", setThresholds);

    return () => socket.disconnect();
  }, [pushToast]);

  const value = {
    locations, history, trend, incidents, reports, broadcasts, shelters, teams, thresholds, connected, toasts,
    pushToast,
    dismissToast,
    submitReport: (body) => api("/api/citizen-report", "POST", body),
    setReportStatus: (id, status) => api(`/api/citizen-report/${id}`, "PATCH", { status }),
    updateIncident: (id, body) => api(`/api/incidents/${id}`, "PATCH", body),
    sendBroadcast: (body) => api("/api/broadcasts", "POST", body),
    triggerStorm: (zoneId, intensity) => api("/api/simulate/storm", "POST", { zoneId, intensity }),
    updateThresholds: (next) => api("/api/thresholds", "PUT", next).then(setThresholds),
    planEvacuation,
  };

  return <FloodDataContext.Provider value={value}>{children}</FloodDataContext.Provider>;
}

export function useFloodData() {
  const ctx = useContext(FloodDataContext);
  if (!ctx) throw new Error("useFloodData must be used within FloodDataProvider");
  return ctx;
}
