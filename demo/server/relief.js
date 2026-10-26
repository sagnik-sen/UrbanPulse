// Flood relief distribution ledger: ration-card tokens for a cash payment at a ration (PDS) shop, and
// the scheduling that spreads those visits across shops and hours. Pure: no database, no server state.
//
// After Cyclone Michaung (December 2023) Tamil Nadu paid Rs 6,000 per ration card to about 24.25 lakh
// families (Rs 1,486 crore) in Chennai and affected taluks of three neighbouring districts. Families got
// tokens naming a date and time to collect cash at their shop; there were queues and "chaos in PDS
// shops", and people without tokens had to apply at the shops. Sources: dtnext.in (Cyclonic Michaung,
// CM launches Rs 6,000 one-time assistance) and outlookindia.com (Rs 6,000 flood relief to ration
// cardholders in 4 flood-affected districts).
//
// Privacy: a ration card number is never stored. Each card is keyed by HMAC-SHA256(pepper, card), so the
// state holds only a one-way key. Audit entries carry shop, zone, amount, slot and counts, never a key.
const { createHmac, randomBytes } = require("node:crypto");

const AMOUNT_RS = 6000;
const DAYS = 7; // scheme length on the live server (demo); the experiment uses its own
const IST_MS = 5.5 * 3600_000; // Chennai is UTC+05:30 with no daylight saving
const BREAK = [13, 15]; // lunch break 13:00-15:00, as in the 2023 scheme
const CARD_FORMAT = /^[A-Z0-9]{10,16}$/; // real TN smart-card numbers are 12 digits; the demo accepts a range
const CODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; // RFC 4648 base32

// ILLUSTRATIVE ration shops, not a real list: two per demo zone, perHour = households served per hour.
const SHOPS = [
  { id: "rs-pal-1", name: "Fair Price Shop 1, Pallikaranai", zoneId: "pallikaranai", lat: 12.939, lng: 80.2135, perHour: 60 },
  { id: "rs-pal-2", name: "Fair Price Shop 2, Pallikaranai", zoneId: "pallikaranai", lat: 12.9352, lng: 80.2098, perHour: 45 },
  { id: "rs-vel-1", name: "Fair Price Shop 1, Velachery", zoneId: "velachery", lat: 12.9768, lng: 80.2195, perHour: 70 },
  { id: "rs-vel-2", name: "Fair Price Shop 2, Velachery", zoneId: "velachery", lat: 12.9742, lng: 80.223, perHour: 50 },
  { id: "rs-omr-1", name: "Fair Price Shop 1, Sholinganallur", zoneId: "omr", lat: 12.9025, lng: 80.2296, perHour: 60 },
  { id: "rs-omr-2", name: "Fair Price Shop 2, Sholinganallur", zoneId: "omr", lat: 12.8995, lng: 80.2262, perHour: 80 },
  { id: "rs-tna-1", name: "Fair Price Shop 1, T Nagar", zoneId: "tnagar", lat: 13.0433, lng: 80.2359, perHour: 55 },
  { id: "rs-tna-2", name: "Fair Price Shop 2, T Nagar", zoneId: "tnagar", lat: 13.0401, lng: 80.2322, perHour: 65 },
  { id: "rs-ada-1", name: "Fair Price Shop 1, Adyar", zoneId: "adyar", lat: 13.0028, lng: 80.2581, perHour: 50 },
  { id: "rs-ada-2", name: "Fair Price Shop 2, Adyar", zoneId: "adyar", lat: 12.9996, lng: 80.2548, perHour: 75 },
  { id: "rs-myl-1", name: "Fair Price Shop 1, Mylapore", zoneId: "mylapore", lat: 13.0355, lng: 80.2636, perHour: 60 },
  { id: "rs-myl-2", name: "Fair Price Shop 2, Mylapore", zoneId: "mylapore", lat: 13.0322, lng: 80.2601, perHour: 40 },
];
const SHOP_NAME = Object.fromEntries(SHOPS.map((s) => [s.id, s.name]));

// hours a shop serves: startHour up to endHour, skipping the lunch break
function collectionHours(startHour = 9, endHour = 17) {
  const out = [];
  for (let h = startHour; h < endHour; h++) if (h < BREAK[0] || h >= BREAK[1]) out.push(h);
  return out;
}

// "9-13 and 15-17" gives 9, 10, 11, 12, 15, 16: six one-hour slots a day
const hoursDefault = collectionHours();

// returns the card number as the HMAC input, or null when it is not a plausible card number
function normaliseCard(raw) {
  const card = String(raw ?? "").replace(/[\s-]/g, "").toUpperCase();
  return CARD_FORMAT.test(card) ? card : null;
}

// hex HMAC-SHA256 of the normalised card number, or null for an invalid number
function cardKey(pepper, raw) {
  const card = normaliseCard(raw);
  return card ? createHmac("sha256", pepper).update(card).digest("hex") : null;
}

// the scheme's calendar in IST: day 0 is startDate, and slot (day, hour) runs hour:00 to hour+1:00
const addDays = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const istDate = (now) => new Date(now + IST_MS).toISOString().slice(0, 10);
const dateOf = (startDate, day) => (startDate ? addDays(startDate, day) : null);
const slotStartMs = (startDate, day, hour) => Date.parse(`${addDays(startDate, day)}T${String(hour).padStart(2, "0")}:00:00+05:30`);
const at = (day, hour) => day * 24 + hour; // one number per slot, ordered in time
const slotKey = (day, hour) => `${day}-${hour}`;

// assigns each household a shop in its own zone and a one-hour slot. Earliest slot first; among shops
// with a free slot at the same time, the one with fewer bookings so far wins, so zones balance.
// booked: { [shopId]: { "day-hour": n } } already taken. from: first slot index that may be used.
// Returns one entry per household, { shopId, day, hour }, or null when the zone has no room left.
function schedule(households, shops, { days = DAYS, startHour = 9, endHour = 17, booked = {}, from = 0 } = {}) {
  const hours = collectionHours(startHour, endHour);
  const load = structuredClone(booked);
  const slots = [];
  for (let day = 0; day < days; day++) for (const hour of hours) if (at(day, hour) >= from) slots.push({ day, hour, index: at(day, hour) });
  return households.map((h) => {
    let best = null;
    for (const shop of shops) {
      if (shop.zoneId !== h.zoneId) continue;
      const used = (load[shop.id] ??= {});
      const slot = slots.find((s) => (used[slotKey(s.day, s.hour)] ?? 0) < shop.perHour);
      if (!slot) continue;
      const total = Object.values(used).reduce((sum, n) => sum + n, 0);
      if (!best || slot.index < best.slot.index || (slot.index === best.slot.index && total < best.total)) best = { shop, slot, total };
    }
    if (!best) return null;
    const key = slotKey(best.slot.day, best.slot.hour);
    load[best.shop.id][key] = (load[best.shop.id][key] ?? 0) + 1;
    return { shopId: best.shop.id, day: best.slot.day, hour: best.slot.hour };
  });
}

// first slot index whose start is still ahead of `now`, or null once the scheme is over
function firstOpenAt(startDate, now, days = DAYS) {
  for (let day = 0; day < days; day++) {
    for (const hour of hoursDefault) if (slotStartMs(startDate, day, hour) > now) return at(day, hour);
  }
  return null;
}

const emptyState = () => ({ startDate: null, tokens: {}, slots: {} });

// 32 random bytes, hex: the HMAC key for card numbers, generated once when no RELIEF_PEPPER is set
const newPepper = () => randomBytes(32).toString("hex");

const randomCode = () => `RF-${Array.from(randomBytes(6), (b) => CODE_ALPHABET[b % 32]).join("")}`;

// the token shape a citizen or staff member sees; the card key never leaves the state
function view(state, t) {
  return { code: t.code, shopId: t.shopId, shopName: SHOP_NAME[t.shopId], zoneId: t.zoneId, day: dateOf(state.startDate, t.day), hour: t.hour, paid: t.paidAt != null };
}

// one token per card: a repeat request returns the same token and does not issue a second slot
function issueToken(state, { cardKey: key, zoneId, now }) {
  const existing = state.tokens[key];
  if (existing) return { token: view(state, existing), issued: false };
  state.startDate ??= istDate(now);
  const from = firstOpenAt(state.startDate, now);
  if (from == null) return { error: "This relief round has ended. Staff start a new round by clearing demo data." };
  const [assigned] = schedule([{ zoneId }], SHOPS, { booked: state.slots, from });
  if (!assigned) return { error: "No collection slots are left in this area" };
  const shop = (state.slots[assigned.shopId] ??= {});
  shop[slotKey(assigned.day, assigned.hour)] = (shop[slotKey(assigned.day, assigned.hour)] ?? 0) + 1;
  // linear scan for a free code: fine to a few thousand tokens, needs a code index before city scale
  let code = randomCode();
  while (Object.values(state.tokens).some((t) => t.code === code)) code = randomCode();
  const token = { code, zoneId, shopId: assigned.shopId, day: assigned.day, hour: assigned.hour, issuedAt: now, paidAt: null };
  state.tokens[key] = token;
  return { token: view(state, token), issued: true };
}

const lookupToken = (state, key) => (state.tokens[key] ? view(state, state.tokens[key]) : null);

// pays once. Checks in order: unknown token, another card's token, wrong shop, already paid.
// linear scan by code, same limit as issueToken
function pay(state, { tokenCode, cardKey: key, shopId, now }) {
  const code = String(tokenCode ?? "").trim().toUpperCase();
  const entry = Object.entries(state.tokens).find(([, t]) => t.code === code);
  if (!entry) return { error: "Token not found", status: 404 };
  const [owner, token] = entry;
  if (owner !== key) return { error: "This token belongs to a different ration card", status: 409 };
  if (token.shopId !== shopId) return { error: `Collect this token at ${SHOP_NAME[token.shopId]}`, status: 409 };
  if (token.paidAt != null) return { error: "This token has already been paid", status: 409 };
  token.paidAt = now;
  return { token: view(state, token), amountRs: AMOUNT_RS };
}

// staff check before paying: what the token says and whether this card and shop match, without paying.
// Card and shop are optional; a missing one is reported as null. Slot timing is advisory, as in pay().
function checkToken(state, { tokenCode, cardKey: key, shopId, now }) {
  const code = String(tokenCode ?? "").trim().toUpperCase();
  const entry = Object.entries(state.tokens).find(([, t]) => t.code === code);
  if (!entry) return null;
  const [owner, token] = entry;
  const start = slotStartMs(state.startDate, token.day, token.hour);
  const timing = now < start ? "early" : now < start + 3600_000 ? "on-time" : "late";
  return {
    token: view(state, token),
    paidAt: token.paidAt,
    cardMatches: key ? owner === key : null,
    shopMatches: shopId ? token.shopId === shopId : null,
    timing,
  };
}

// totals and per-shop figures; slots are the booked counts per date and hour
function summary(state) {
  const tokens = Object.values(state.tokens);
  const shops = SHOPS.map((s) => {
    const mine = tokens.filter((t) => t.shopId === s.id);
    const paid = mine.filter((t) => t.paidAt != null).length;
    const slots = Object.entries(state.slots[s.id] ?? {})
      .map(([key, booked]) => {
        const [day, hour] = key.split("-").map(Number);
        return { date: dateOf(state.startDate, day), hour, booked };
      })
      .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "") || a.hour - b.hour);
    return { id: s.id, name: s.name, zoneId: s.zoneId, perHour: s.perHour, issued: mine.length, paid, amountRs: paid * AMOUNT_RS, slots };
  });
  const sum = (key) => shops.reduce((n, s) => n + s[key], 0);
  return { amountRs: AMOUNT_RS, days: DAYS, startDate: state.startDate, totals: { issued: sum("issued"), paid: sum("paid"), amountRs: sum("amountRs") }, shops };
}

module.exports = { AMOUNT_RS, DAYS, SHOPS, collectionHours, normaliseCard, cardKey, newPepper, schedule, firstOpenAt, emptyState, issueToken, lookupToken, checkToken, pay, summary, istDate, dateOf };
