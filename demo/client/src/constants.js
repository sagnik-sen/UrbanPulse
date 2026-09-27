// dataviz status palette (fixed, never themed)
export const STATUS = {
  safe: { color: "#0ca30c", label: "Safe" },
  warning: { color: "#fab219", label: "Warning" },
  danger: { color: "#d03b3b", label: "Danger" },
};

// dataviz categorical order, dark-mode steps, slots 1-6
export const ZONE_COLOR = {
  pallikaranai: "#3987e5",
  velachery: "#d95926",
  omr: "#199e70",
  tnagar: "#c98500",
  adyar: "#d55181",
  mylapore: "#008300",
};

export const CATEGORIES = {
  waterlogging: "Waterlogging",
  drain_blocked: "Blocked drain",
  road_closed: "Road impassable",
  power_hazard: "Electrical hazard",
  rescue_needed: "Rescue needed",
  other: "Other",
};

export const SEVERITY = {
  low: { label: "Low", color: "#0ca30c" },
  medium: { label: "Medium", color: "#fab219" },
  high: { label: "High", color: "#d03b3b" },
};

export const INCIDENT_STATUS = {
  active: { label: "Active", color: "#d03b3b" },
  responding: { label: "Responding", color: "#fab219" },
  cleared: { label: "Cleared", color: "#0ca30c" },
};

export const REPORT_STATUS = {
  open: { label: "Open", color: "#fab219" },
  in_progress: { label: "In progress", color: "#3987e5" },
  resolved: { label: "Resolved", color: "#0ca30c" },
};

export function timeAgo(ts) {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  return `${Math.round(s / 3600)}h ago`;
}

export function duration(start, end) {
  const s = Math.max(0, Math.round(((end ?? Date.now()) - start) / 1000));
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

export function formatCount(n) {
  return n >= 100000 ? `${(n / 100000).toFixed(1)} lakh` : n.toLocaleString("en-IN");
}

export function downloadCsv(filename, rows) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const escape = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// IMD-style hourly rainfall bands (mm/h); mirrors server/rainfall.js
export function rainLabel(mmPerHr) {
  if (!mmPerHr || mmPerHr <= 0) return "No rain";
  if (mmPerHr < 2.5) return "Light rain";
  if (mmPerHr < 7.6) return "Moderate rain";
  if (mmPerHr < 35) return "Heavy rain";
  return "Very heavy rain";
}

export function hourLabel(isoLocal) {
  const h = Number(String(isoLocal).slice(11, 13));
  return `${h % 12 || 12}${h < 12 ? "am" : "pm"}`;
}
