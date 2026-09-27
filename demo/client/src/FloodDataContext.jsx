import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { io } from "socket.io-client";
import { useAuth } from "./AuthContext";

// same-origin: Vite proxies /api and /socket.io to the backend in dev
const SERVER_URL = "";
const FloodDataContext = createContext(null);

const fmtTime = (ts) => new Date(ts).toLocaleTimeString();

async function api(path, method, body) {
  const res = await fetch(`${SERVER_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(data.error || "Request failed"), { status: res.status });
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
  const { user, expire } = useAuth();
  const userId = user?.id;
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
  const [rainfall, setRainfall] = useState(null);
  const [rainLink, setRainLinkState] = useState(true);
  const [liveAudit, setLiveAudit] = useState([]); // pushed only to admins' sockets

  const pushToast = useCallback((toast) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, ...toast }].slice(-4));
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 6000);
  }, []);

  const dismissToast = (id) => setToasts((prev) => prev.filter((t) => t.id !== id));

  // staff get the full picture; the public citizen app gets levels, shelters and alerts only
  useEffect(() => {
    let cancelled = false;
    fetch(`${SERVER_URL}${userId ? "/api/state" : "/api/public-state"}`)
      .then((r) => {
        if (r.status === 401) expire();
        return r.ok ? r.json() : null;
      })
      .then((s) => {
        if (cancelled || !s) return;
        setLocations(s.locations);
        setHistory(Object.fromEntries(Object.entries(s.history ?? {}).map(([id, arr]) => [id, arr.map((p) => ({ time: fmtTime(p.ts), level: p.level }))])));
        setIncidents(s.incidents ?? []);
        setReports(s.reports ?? []);
        setBroadcasts(s.broadcasts);
        setShelters(s.shelters);
        setTeams(s.teams ?? []);
        setThresholds(s.thresholds);
        setRainfall(s.rainfall ?? null);
        setRainLinkState(s.rainLink ?? true);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [userId, expire]);

  useEffect(() => {
    const socket = io();
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
    socket.on("rainfall-update", setRainfall);
    setLiveAudit([]);
    socket.on("audit-entry", (e) => setLiveAudit((prev) => [e, ...prev].slice(0, 200)));
    socket.on("rain-link-updated", ({ rainLink: on }) => setRainLinkState(on));
    socket.on("data-cleared", ({ thresholds: t }) => {
      setIncidents([]);
      setReports([]);
      setBroadcasts([]);
      setThresholds(t);
    });

    return () => socket.disconnect();
  }, [pushToast, userId]); // reconnect on sign-in/out so the server re-checks the session and room

  // any 401 means the session is gone: drop to the sign-in screen
  const call = (promise) => promise.catch((err) => {
    if (err.status === 401) expire();
    throw err;
  });

  const value = {
    locations, history, trend, incidents, reports, broadcasts, shelters, teams, thresholds, connected, toasts, rainfall, rainLink, liveAudit,
    pushToast,
    dismissToast,
    submitReport: (body) => api("/api/citizen-report", "POST", body),
    setReportStatus: (id, status) => call(api(`/api/citizen-report/${id}`, "PATCH", { status })),
    updateIncident: (id, body) => call(api(`/api/incidents/${id}`, "PATCH", body)),
    sendBroadcast: (body) => call(api("/api/broadcasts", "POST", body)),
    triggerStorm: (zoneId, intensity) => call(api("/api/simulate/storm", "POST", { zoneId, intensity })),
    updateThresholds: (next) => call(api("/api/thresholds", "PUT", next)).then(setThresholds),
    planEvacuation,
    clearDemoData: () => call(api("/api/admin/clear-data", "POST", {})),
    setRainLink: (enabled) => call(api("/api/settings/rain-link", "PUT", { enabled })).then((r) => setRainLinkState(r.rainLink)),
    fetchAudit: (action) => call(fetch(`${SERVER_URL}/api/audit?limit=500${action ? `&action=${encodeURIComponent(action)}` : ""}`).then(async (r) => {
      const data = await r.json();
      if (!r.ok) throw Object.assign(new Error(data.error || "Request failed"), { status: r.status });
      return data;
    })),
    buildEvacuationPlan: (body) => call(api("/api/evacuation-plan", "POST", body)),
    issueEvacuationOrder: (body) => call(api("/api/evacuation-plan/execute", "POST", body)),
  };

  return <FloodDataContext.Provider value={value}>{children}</FloodDataContext.Provider>;
}

export function useFloodData() {
  const ctx = useContext(FloodDataContext);
  if (!ctx) throw new Error("useFloodData must be used within FloodDataProvider");
  return ctx;
}
