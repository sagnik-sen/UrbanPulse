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

module.exports = { planGroups, bestRoute, shifted };
