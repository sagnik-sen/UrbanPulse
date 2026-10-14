// Volunteer boat rescue: what a request costs for a boat, how boats are matched to requests, and
// the validation and public response shaping the routes use. Pure: no server state lives here.
//
// In the 2015 Chennai floods fishermen's boats and volunteers carried out a large share of rescues,
// coordinated over social media. Here citizens post requests, volunteer boats register, and the
// control room matches them (optimal min-cost assignment, or first-come as a baseline).
const { randomUUID } = require("node:crypto");
const { assignEvacuees, assignGreedyNearest } = require("./assignment");
const { distanceKm } = require("./risk");
const { ZONE_DEFS } = require("./simulator");

const PRIORITY_MINUTES = { medical: 30, disabled: 20, elderly: 15, child: 15 }; // a request's bonus is the largest of its needs
const BOAT_KMH = 8; // flooded-street boat speed (assumption)
const AGING_MIN_PER_MIN = 0.5; // each minute waiting is worth half a minute of travel, so older requests go first
const NEEDS = Object.keys(PRIORITY_MINUTES);
const BOAT_STATUSES = ["available", "busy", "offline"];
const REQUEST_STATUSES = ["open", "assigned", "rescued", "cancelled"];
const MATCH_METHODS = ["optimal", "greedy"];
const CHENNAI = { minLat: 12.6, maxLat: 13.4, minLng: 79.9, maxLng: 80.5 };

const priorityBonus = (request) => Math.max(0, ...request.needs.map((n) => PRIORITY_MINUTES[n] || 0));
const travelMin = (from, to) => (distanceKm(from, to) / BOAT_KMH) * 60;
const fits = (request, boat) => boat.status === "available" && boat.capacity >= request.people;

// Infinity when the boat cannot take these people; otherwise travel minutes less the rewards for
// priority and waiting, so a lower cost is a better pairing (and can be negative)
function cost(request, boat, now) {
  if (!fits(request, boat)) return Infinity;
  const waitedMin = (now - request.ts) / 60000;
  return travelMin(boat, request) - priorityBonus(request) - waitedMin * AGING_MIN_PER_MIN;
}

// Min-cost max-flow over open requests (one boat each) and free boats. The flow solver drops
// Infinity pairs and runs Bellman-Ford, which handles the negative costs: the bipartite graph starts
// with no cycles and successive shortest paths never creates a negative one.
function matchOptimal(requests, boats, now) {
  const open = requests.filter((r) => r.status === "open");
  const free = boats.filter((b) => b.status === "available");
  const reqById = new Map(open.map((r) => [r.id, r]));
  const boatById = new Map(free.map((b) => [b.id, b]));
  const { flows } = assignEvacuees({
    sources: open.map((r) => ({ id: r.id, people: 1 })),
    sinks: free.map((b) => ({ id: b.id, beds: 1 })),
    cost: (rid, bid) => cost(reqById.get(rid), boatById.get(bid), now),
  });
  return flows.map((f) => ({ requestId: f.source, boatId: f.sink, minutes: travelMin(boatById.get(f.sink), reqById.get(f.source)) }));
}

// Baseline: requests in arrival order, each takes the nearest free boat that can carry them.
function matchGreedy(requests, boats) {
  const open = requests.filter((r) => r.status === "open").sort((a, b) => a.ts - b.ts);
  const free = boats.filter((b) => b.status === "available");
  const reqById = new Map(open.map((r) => [r.id, r]));
  const boatById = new Map(free.map((b) => [b.id, b]));
  const { flows } = assignGreedyNearest({
    sources: open.map((r) => ({ id: r.id, people: 1 })),
    sinks: free.map((b) => ({ id: b.id, beds: 1 })),
    cost: (rid, bid) => (fits(reqById.get(rid), boatById.get(bid)) ? travelMin(boatById.get(bid), reqById.get(rid)) : Infinity),
  });
  return flows.map((f) => ({ requestId: f.source, boatId: f.sink, minutes: travelMin(boatById.get(f.sink), reqById.get(f.source)) }));
}

// ---- validation: every parser returns { value } or { error } ----

const inChennai = (lat, lng) =>
  typeof lat === "number" && typeof lng === "number" && lat >= CHENNAI.minLat && lat <= CHENNAI.maxLat && lng >= CHENNAI.minLng && lng <= CHENNAI.maxLng;

const text = (v, max) => (typeof v === "string" && v.trim().length > 0 && v.trim().length <= max ? v.trim() : null);

function validateRequest(input) {
  const body = input || {};
  if (!inChennai(body.lat, body.lng)) return { error: "Location must be within the Chennai metro area" };
  if (!Number.isInteger(body.people) || body.people < 1 || body.people > 30) return { error: "People must be a whole number from 1 to 30" };
  if (!Array.isArray(body.needs) || body.needs.some((n) => !NEEDS.includes(n))) return { error: `Needs must be any of: ${NEEDS.join(", ")}` };
  const note = typeof body.note === "string" ? body.note.trim() : "";
  if (note.length > 200) return { error: "Note must be 200 characters or fewer" };
  const contact = typeof body.contact === "string" ? body.contact.replace(/[\s-]/g, "") : "";
  if (contact && !/^\+?\d{1,19}$/.test(contact)) return { error: "Phone number must be digits, optionally starting with +" };
  return { value: { lat: body.lat, lng: body.lng, people: body.people, needs: [...new Set(body.needs)], note, contact: contact || null } };
}

function validateBoat(input) {
  const body = input || {};
  const name = text(body.name, 40);
  const owner = text(body.owner, 40);
  if (!name) return { error: "Boat name is required (40 characters or fewer)" };
  if (!owner) return { error: "Owner is required (40 characters or fewer)" };
  if (!Number.isInteger(body.capacity) || body.capacity < 2 || body.capacity > 20) return { error: "Capacity must be a whole number from 2 to 20" };
  if (!inChennai(body.lat, body.lng)) return { error: "Location must be within the Chennai metro area" };
  const status = body.status ?? "available";
  if (!BOAT_STATUSES.includes(status)) return { error: `Status must be one of: ${BOAT_STATUSES.join(", ")}` };
  return { value: { name, owner, capacity: body.capacity, lat: body.lat, lng: body.lng, status } };
}

function validateBoatPatch(input) {
  const body = input || {};
  const patch = {};
  if (body.status !== undefined) {
    if (!BOAT_STATUSES.includes(body.status)) return { error: `Status must be one of: ${BOAT_STATUSES.join(", ")}` };
    patch.status = body.status;
  }
  if (body.lat !== undefined || body.lng !== undefined) {
    if (!inChennai(body.lat, body.lng)) return { error: "Location must be within the Chennai metro area" };
    patch.lat = body.lat;
    patch.lng = body.lng;
  }
  if (Object.keys(patch).length === 0) return { error: "Nothing to change: send a status or a location" };
  return { value: patch };
}

// ---- response shaping: what leaves the server ----

// the request as the citizen and the public see it: the staff-only phone number is removed
function publicRequest({ contact, ...rest }) {
  return rest;
}

// the only thing a citizen's status poll gets back
function requestStatus(request, boats) {
  return {
    status: request.status,
    boatName: boats.find((b) => b.id === request.boatId)?.name ?? null,
    assignedAt: request.assignedAt,
    rescuedAt: request.rescuedAt,
  };
}

// Demo fleet, seeded only when no boats are registered. Names and owners are illustrative, not real
// registrations, and the positions are the zone centres.
const DEMO_FLEET = [
  { name: "Marshland Boat 1", owner: "Medavakkam fishermen's co-op", capacity: 6 },
  { name: "Velachery Rescue 1", owner: "Velachery residents' volunteers", capacity: 8 },
  { name: "Akkarai Boat 1", owner: "Akkarai fishermen's association", capacity: 10 },
  { name: "T Nagar Rescue 1", owner: "T Nagar youth volunteers", capacity: 12 },
  { name: "Adyar Boat Club 1", owner: "Adyar Boat Club volunteers", capacity: 4 },
  { name: "Kapaleeshwarar Boat 1", owner: "Mylapore fishermen's association", capacity: 7 },
];

function demoBoats(now) {
  return ZONE_DEFS.map((z, i) => ({ id: randomUUID(), ...DEMO_FLEET[i], lat: z.lat, lng: z.lng, status: "available", ts: now }));
}

module.exports = {
  PRIORITY_MINUTES,
  BOAT_KMH,
  REQUEST_STATUSES,
  MATCH_METHODS,
  cost,
  matchOptimal,
  matchGreedy,
  validateRequest,
  validateBoat,
  validateBoatPatch,
  publicRequest,
  requestStatus,
  demoBoats,
};
