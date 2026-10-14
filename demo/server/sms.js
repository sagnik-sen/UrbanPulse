// Simulated SMS service for areas with no data connection. Pure: the server passes in its own data.
const { LABELS } = require("./imd");

const REPLY_MAX = 300;
const INPUT_MAX = 500;
const CODE = /UP-[0-9A-F]{8}/i;
const RISK = { safe: "SAFE", warning: "WARNING", danger: "DANGER" };
const KEYWORDS = { verify: ["VERIFY"], shelter: ["SHELTER", "முகாம்"], status: ["STATUS", "நிலை"] };
const HELP = "UrbanPulse SMS. VERIFY UP-XXXXXXXX (or forward the alert text). SHELTER <area> (முகாம்). STATUS <area> (நிலை). HELP (உதவி). Example: SHELTER Velachery";

const clip = (s) => (s.length <= REPLY_MAX ? s : `${s.slice(0, REPLY_MAX - 3)}...`);
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// "omr", "t nagar", "marsh" or "Adyar" all find a zone: exact name or id first, then prefix, then anywhere
function matchZone(zones, query) {
  const q = norm(query);
  if (!q) return null;
  const forms = (z) => [norm(z.id), norm(z.name)];
  return zones.find((z) => forms(z).includes(q))
    ?? zones.find((z) => forms(z).some((f) => f.startsWith(q)))
    ?? zones.find((z) => forms(z).some((f) => f.includes(q)))
    ?? null;
}

function verifyReply(code, r) {
  const a = r.alert;
  switch (r.status) {
    case "verified":
      return `GENUINE official alert ${code} (${a.zone}, ${a.severity}). It matches the blockchain record: ${a.message}`;
    case "pending":
      return `PENDING: alert ${code} is recorded but not yet sealed on the blockchain (within 5 minutes). Treat it as unverified for now.`;
    case "tampered":
      return `ALTERED: alert ${code} does not match its sealed record. Do not act on this text.`;
    case "unreachable":
    case "unavailable":
      return `CANNOT CHECK: the blockchain check is unavailable right now. Alert ${code} is not confirmed. Try again later.`;
    default:
      return `NOT an official alert: ${code} was not issued by UrbanPulse. Treat the message as unverified.`;
  }
}

function shelterReply(zone, shelters) {
  const dist = (s) => Math.hypot(s.lat - zone.lat, s.lng - zone.lng);
  const open = shelters.filter((s) => s.capacity > s.occupancy).sort((a, b) => dist(a) - dist(b))[0];
  if (!open) return "No shelter has free beds right now. Call 1070 (state helpline) for help.";
  const note = open.zoneId === zone.id ? "" : ` (nearest with free beds, outside ${zone.name})`;
  return `${open.name}${note}: ${open.capacity - open.occupancy} free beds of ${open.capacity}.`;
}

function statusReply(zone, rain) {
  const parts = [`${zone.name}: ${RISK[zone.risk]}, water level ${zone.level}%.`];
  if (zone.risk !== "danger" && zone.forecastHours != null) parts.push(`Danger possible in about ${zone.forecastHours} h.`);
  const r = rain?.[zone.id];
  if (r?.imdObserved && r.imdObserved !== "none") parts.push(`Past 24 h rain: ${LABELS[r.imdObserved]}.`);
  if (r?.imdForecast && r.imdForecast !== "none") parts.push(`Next 24 h rain: ${LABELS[r.imdForecast]}.`);
  return parts.join(" ");
}

// ctx: { zones, shelters, rain, findAlert(code) -> { status, alert? } }; returns the reply text (max 300 chars)
async function handleSms(input, ctx) {
  const text = String(input ?? "").slice(0, INPUT_MAX).trim().replace(/\s+/g, " ");
  // a forwarded alert carries its code inside the text, so any code means a verification
  const code = text.match(CODE)?.[0].toUpperCase();
  if (code) return clip(verifyReply(code, await ctx.findAlert(code)));

  const [first = "", ...rest] = text.split(" ");
  const word = first.toUpperCase();
  const area = rest.join(" ");
  if (KEYWORDS.verify.includes(word)) return "Send VERIFY UP-XXXXXXXX with the code from the alert, or forward the whole alert text.";
  if (KEYWORDS.shelter.includes(word) || KEYWORDS.status.includes(word)) {
    if (!area) return `Add an area name, for example ${KEYWORDS.shelter.includes(word) ? "SHELTER" : "STATUS"} Velachery.`;
    const zone = matchZone(ctx.zones, area);
    if (!zone) return clip(`No area matches that name. Areas: ${ctx.zones.map((z) => z.name).join(", ")}.`);
    return clip(KEYWORDS.shelter.includes(word) ? shelterReply(zone, ctx.shelters) : statusReply(zone, ctx.rain));
  }
  return HELP;
}

module.exports = { handleSms };
