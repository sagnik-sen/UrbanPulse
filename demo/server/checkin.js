// Shelter check-in state. `state` maps shelterId to a list of households { id, people, ts }.
// Households are counts only: no names, phones or addresses. Functions return new state; nothing is mutated.
const { randomBytes, randomUUID, timingSafeEqual } = require("node:crypto");

const MAX_PEOPLE = 15;

function occupied(state, shelterId) {
  return (state[shelterId] || []).reduce((sum, h) => sum + h.people, 0);
}

function freeBeds(state, shelter) {
  return Math.max(0, shelter.capacity - occupied(state, shelter.id));
}

// { error } for a bad headcount, { full, free } when the shelter cannot take the household, else { state, household, free }
function checkIn(state, shelter, people, now) {
  if (!Number.isInteger(people) || people < 1 || people > MAX_PEOPLE) return { error: `People must be between 1 and ${MAX_PEOPLE}` };
  const free = freeBeds(state, shelter);
  if (people > free) return { full: true, free };
  const household = { id: randomUUID(), people, ts: now };
  return { state: { ...state, [shelter.id]: [...(state[shelter.id] || []), household] }, household, free: free - people };
}

// null when no household with that id is checked in at this shelter
function checkOut(state, shelterId, householdId) {
  const list = state[shelterId] || [];
  const household = list.find((h) => h.id === householdId);
  if (!household) return null;
  return { state: { ...state, [shelterId]: list.filter((h) => h.id !== householdId) }, household };
}

function tokenMatches(expected, given) {
  if (typeof expected !== "string" || typeof given !== "string") return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

function newToken() {
  return randomBytes(16).toString("hex");
}

module.exports = { MAX_PEOPLE, occupied, freeBeds, checkIn, checkOut, tokenMatches, newToken };
