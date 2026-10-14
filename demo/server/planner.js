// Group evacuation planning, shared by the live app and the offline experiments so both
// run exactly the same logic.
const { score } = require("./evacuation");
const { assignEvacuees, assignGreedyNearest } = require("./assignment");

// a group leaving `delay` minutes after now experiences the risk model shifted by that delay
const shifted = (risk, delay) => (delay ? { at: (p, m) => risk.at(p, m + delay) } : risk);

// cheapest candidate route for a group to a shelter under a risk model
function bestRoute(candidates, group, shelter, risk, reserved = {}) {
  let best = null;
  for (const r of candidates) {
    const s = score(r, shelter, shifted(risk, group.delay || 0), reserved);
    if (!best || s.cost < best.cost) best = s;
  }
  return best;
}

// groups:   [{ origin: { id, ... }, people, delay? }]  (origin ids must be unique)
// shelters: [{ id, capacity, occupancy, ... }]
// candidatesFor(originId, shelterId) -> candidate routes
// method:   "independent" (each group picks alone, ignoring others), "greedy" (one group at a
//           time in `order`, shelters fill up), or "optimal" (joint min-cost assignment)
function planGroups({ groups, shelters, candidatesFor, risk, method, order, reserved = {} }) {
  const beds = (s) => s.capacity - s.occupancy - (reserved[s.id] || 0);
  const open = shelters.filter((s) => beds(s) > 0);
  const routes = {};
  for (const g of groups) for (const s of open) routes[`${g.origin.id}|${s.id}`] = bestRoute(candidatesFor(g.origin.id, s.id) || [], g, s, risk, reserved);

  const assignments = [];
  if (method === "independent") {
    for (const g of groups) {
      let best = null;
      for (const s of open) {
        const r = routes[`${g.origin.id}|${s.id}`];
        if (r && (!best || r.cost < best.route.cost)) best = { shelter: s, route: r };
      }
      if (best) assignments.push({ group: g, shelter: best.shelter, route: best.route, people: g.people });
    }
    const placed = assignments.reduce((s, a) => s + a.people, 0);
    return { assignments, unassigned: groups.reduce((s, g) => s + g.people, 0) - placed };
  }

  const problem = {
    sources: (method === "greedy" && order ? order.map((i) => groups[i]) : groups).map((g) => ({ id: g.origin.id, people: g.people })),
    sinks: open.map((s) => ({ id: s.id, beds: beds(s) })),
    cost: (o, s) => routes[`${o}|${s}`]?.cost ?? Infinity,
  };
  const result = method === "greedy" ? assignGreedyNearest(problem) : assignEvacuees(problem);
  for (const f of result.flows) {
    assignments.push({ group: groups.find((g) => g.origin.id === f.source), shelter: open.find((s) => s.id === f.sink), route: routes[`${f.source}|${f.sink}`], people: f.people });
  }
  return { assignments, unassigned: result.unassigned.reduce((s, u) => s + u.people, 0) };
}

// Splits `total` across `caps` in proportion to each cap, never above a cap, summing exactly to `total`.
function allocate(total, caps) {
  const sum = caps.reduce((s, c) => s + c, 0);
  if (total >= sum) return [...caps];
  const out = caps.map((c) => Math.floor((total * c) / sum));
  let rest = total - out.reduce((s, x) => s + x, 0);
  for (let i = 0; rest > 0; i = (i + 1) % caps.length) {
    if (out[i] < caps[i]) {
      out[i]++;
      rest--;
    }
  }
  return out;
}

// Vulnerable-resident priority. `vulnerableByZone` is the aggregate from vulnerable.js summarize().
// A zone's registered people are shared out over its origin groups (groups are per origin, and a
// zone has several), capped at each group's people, with accessible-needing people (mobility +
// medical) placed in the accessible split first.
function splitZone(zoneGroups, reg) {
  const people = zoneGroups.reduce((s, g) => s + g.people, 0);
  const priority = Math.min(reg?.total ?? 0, people);
  const accessible = Math.min((reg?.mobility ?? 0) + (reg?.medical ?? 0), priority);
  const caps = zoneGroups.map((g) => g.people);
  const acc = allocate(accessible, caps);
  const other = allocate(priority - accessible, caps.map((c, i) => c - acc[i]));
  return zoneGroups.map((_, i) => ({ accessible: acc[i], priority: other[i] }));
}

function tierMetrics(people, rows) {
  const assigned = rows.reduce((s, a) => s + a.people, 0);
  const travel = rows.reduce((s, a) => s + a.route.durationMin * a.people, 0);
  const cost = rows.reduce((s, a) => s + a.route.cost * a.people, 0);
  return {
    people,
    assigned,
    unassigned: people - assigned,
    meanTravelMin: assigned ? travel / assigned : 0,
    meanCost: assigned ? cost / assigned : 0,
  };
}

// Three stages on the beds left by earlier stages, each an optimal min-cost assignment:
//   accessible: mobility + medical need, accessible shelters only
//   priority:   elderly + infant, any shelter
//   general:    everyone else in the group
// Shelter objects are copied with adjusted occupancy, so the caller's shelters are never changed.
function planWithPriority({ groups, shelters, candidatesFor, risk, vulnerableByZone = {}, reserved = {} }) {
  const byZone = {};
  for (const g of groups) (byZone[g.origin.zoneId] ??= []).push(g);
  const split = new Map();
  for (const zoneGroups of Object.values(byZone)) {
    const parts = splitZone(zoneGroups, vulnerableByZone[zoneGroups[0].origin.zoneId]);
    zoneGroups.forEach((g, i) => split.set(g, parts[i]));
  }

  const people = {
    accessible: groups.map((g) => ({ ...g, people: split.get(g).accessible })),
    priority: groups.map((g) => ({ ...g, people: split.get(g).priority })),
    general: groups.map((g) => ({ ...g, people: g.people - split.get(g).accessible - split.get(g).priority })),
  };
  const pools = { accessible: shelters.filter((s) => s.accessible), priority: shelters, general: shelters };

  const taken = {};
  const tiers = {};
  const assignments = [];
  for (const tier of ["accessible", "priority", "general"]) {
    const live = people[tier].filter((g) => g.people > 0);
    const withRoom = pools[tier].map((s) => ({ ...s, occupancy: s.occupancy + (taken[s.id] || 0) }));
    const result = live.length
      ? planGroups({ groups: live, shelters: withRoom, candidatesFor, risk, method: "optimal", reserved })
      : { assignments: [] };
    for (const a of result.assignments) {
      taken[a.shelter.id] = (taken[a.shelter.id] || 0) + a.people;
      assignments.push({ ...a, tier });
    }
    tiers[tier] = tierMetrics(people[tier].reduce((s, g) => s + g.people, 0), result.assignments);
  }
  return { assignments, unassigned: Object.values(tiers).reduce((s, m) => s + m.unassigned, 0), tiers };
}

module.exports = { planGroups, planWithPriority, bestRoute, shifted };
