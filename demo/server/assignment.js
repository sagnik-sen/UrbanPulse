// Capacity-aware evacuee assignment as a min-cost max-flow problem.
//
//   source ──(evacuees in zone)──> zone ──(route cost per person)──> shelter ──(free beds)──> sink
//
// Successive shortest paths (Bellman-Ford on the residual graph) gives the exact optimum:
// the largest number of people housed, at the lowest total cost among all such plans.
// Graphs here are tiny (zones x shelters), so this runs in well under a millisecond.

function minCostMaxFlow(nodeCount, edges, s, t) {
  const graph = Array.from({ length: nodeCount }, () => []);
  const E = [];
  const addEdge = (u, v, cap, cost) => {
    graph[u].push(E.length);
    E.push({ to: v, cap, cost, flow: 0 });
    graph[v].push(E.length);
    E.push({ to: u, cap: 0, cost: -cost, flow: 0 });
  };
  for (const e of edges) addEdge(e.from, e.to, e.cap, e.cost);

  let totalFlow = 0;
  let totalCost = 0;
  for (;;) {
    const dist = Array(nodeCount).fill(Infinity);
    const prevEdge = Array(nodeCount).fill(-1);
    dist[s] = 0;
    for (let iter = 0; iter < nodeCount - 1; iter++) {
      let changed = false;
      for (let u = 0; u < nodeCount; u++) {
        if (dist[u] === Infinity) continue;
        for (const id of graph[u]) {
          const e = E[id];
          if (e.cap - e.flow > 0 && dist[u] + e.cost < dist[e.to] - 1e-9) {
            dist[e.to] = dist[u] + e.cost;
            prevEdge[e.to] = id;
            changed = true;
          }
        }
      }
      if (!changed) break;
    }
    if (dist[t] === Infinity) break;

    let push = Infinity;
    for (let v = t; v !== s; v = E[prevEdge[v] ^ 1].to) push = Math.min(push, E[prevEdge[v]].cap - E[prevEdge[v]].flow);
    for (let v = t; v !== s; v = E[prevEdge[v] ^ 1].to) {
      E[prevEdge[v]].flow += push;
      E[prevEdge[v] ^ 1].flow -= push;
    }
    totalFlow += push;
    totalCost += push * dist[t];
  }
  return { E, totalFlow, totalCost };
}

// sources: [{ id, people }], sinks: [{ id, beds }], cost(sourceId, sinkId) -> cost per person (Infinity = no route)
function assignEvacuees({ sources, sinks, cost }) {
  const S = 0;
  const srcNode = (i) => 1 + i;
  const sinkNode = (j) => 1 + sources.length + j;
  const T = 1 + sources.length + sinks.length;

  const edges = [];
  sources.forEach((src, i) => edges.push({ from: S, to: srcNode(i), cap: Math.max(0, Math.floor(src.people)), cost: 0 }));
  sinks.forEach((snk, j) => edges.push({ from: sinkNode(j), to: T, cap: Math.max(0, Math.floor(snk.beds)), cost: 0 }));
  const pairEdgeStart = edges.length;
  const pairs = [];
  sources.forEach((src, i) => sinks.forEach((snk, j) => {
    const c = cost(src.id, snk.id);
    if (Number.isFinite(c)) {
      pairs.push({ source: src.id, sink: snk.id, perPerson: c });
      edges.push({ from: srcNode(i), to: sinkNode(j), cap: Math.floor(src.people), cost: c });
    }
  }));

  const { E, totalFlow, totalCost } = minCostMaxFlow(T + 1, edges, S, T);

  // forward edges were added in order; each occupies E[2k]
  const flows = pairs
    .map((p, k) => ({ ...p, people: E[2 * (pairEdgeStart + k)].flow }))
    .filter((f) => f.people > 0);
  const unassigned = sources
    .map((src, i) => ({ source: src.id, people: Math.floor(src.people) - E[2 * i].flow }))
    .filter((u) => u.people > 0);

  return { flows, unassigned, assigned: totalFlow, totalCost };
}

// baseline: everyone from a zone goes to their cheapest shelter that still has room, zones in given order
function assignGreedyNearest({ sources, sinks, cost }) {
  const beds = Object.fromEntries(sinks.map((s) => [s.id, Math.floor(s.beds)]));
  const flows = [];
  const unassigned = [];
  let totalCost = 0;
  for (const src of sources) {
    let left = Math.floor(src.people);
    const ranked = sinks.map((s) => ({ id: s.id, c: cost(src.id, s.id) })).filter((x) => Number.isFinite(x.c)).sort((a, b) => a.c - b.c);
    for (const { id, c } of ranked) {
      if (left === 0) break;
      const take = Math.min(left, beds[id]);
      if (take > 0) {
        flows.push({ source: src.id, sink: id, perPerson: c, people: take });
        beds[id] -= take;
        left -= take;
        totalCost += take * c;
      }
    }
    if (left > 0) unassigned.push({ source: src.id, people: left });
  }
  return { flows, unassigned, assigned: flows.reduce((s, f) => s + f.people, 0), totalCost };
}

module.exports = { assignEvacuees, assignGreedyNearest, minCostMaxFlow };
