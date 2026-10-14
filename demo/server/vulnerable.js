// Registrations of residents who need help to evacuate. Only the zone, the kind of help and a head
// count are kept: no names, phone numbers, addresses or coordinates, so nothing here can identify
// a person. Public endpoints only ever see the per-zone totals from summarize().
const CATEGORIES = ["elderly", "mobility", "medical", "infant"];
// these people need a shelter with step-free access and medical support
const NEEDS_ACCESSIBLE = new Set(["mobility", "medical"]);
const COUNT_MIN = 1;
const COUNT_MAX = 10;

// returns { value: { zoneId, category, count } } or { error }; extra fields in the body are dropped
function validate(body) {
  const zoneId = typeof body?.zoneId === "string" ? body.zoneId.trim() : "";
  if (!/^[a-z0-9-]{1,40}$/i.test(zoneId)) return { error: "Choose an area" };
  if (!CATEGORIES.includes(body?.category)) return { error: "Choose the kind of help needed" };
  const count = typeof body?.count === "number" || typeof body?.count === "string" ? Number(body.count) : NaN;
  if (!Number.isInteger(count) || count < COUNT_MIN || count > COUNT_MAX) return { error: `Count must be a whole number from ${COUNT_MIN} to ${COUNT_MAX}` };
  return { value: { zoneId, category: body.category, count } };
}

// { [zoneId]: { elderly, mobility, medical, infant, total } }
function summarize(registrations) {
  const out = {};
  for (const r of registrations) {
    if (!CATEGORIES.includes(r.category)) continue;
    const z = (out[r.zoneId] ??= { elderly: 0, mobility: 0, medical: 0, infant: 0, total: 0 });
    z[r.category] += r.count;
    z.total += r.count;
  }
  return out;
}

module.exports = { CATEGORIES, NEEDS_ACCESSIBLE, validate, summarize };
