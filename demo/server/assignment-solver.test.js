const test = require("node:test");
const assert = require("node:assert");
const { assignEvacuees } = require("./assignment");
const { seededRng } = require("./simulator");

// Reference: the original Bellman-Ford successive-shortest-paths solver, kept verbatim so the
// shipped solver is checked against the implementation it replaced.
function referenceMinCostMaxFlow(nodeCount, edges, s, t) {
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

function referenceAssign({ sources, sinks, cost }) {
  const S = 0;
  const srcNode = (i) => 1 + i;
  const sinkNode = (j) => 1 + sources.length + j;
  const T = 1 + sources.length + sinks.length;
  const edges = [];
  sources.forEach((src, i) => edges.push({ from: S, to: srcNode(i), cap: Math.max(0, Math.floor(src.people)), cost: 0 }));
  sinks.forEach((snk, j) => edges.push({ from: sinkNode(j), to: T, cap: Math.max(0, Math.floor(snk.beds)), cost: 0 }));
  const pairs = [];
  sources.forEach((src, i) => sinks.forEach((snk, j) => {
    const c = cost(src.id, snk.id);
    if (Number.isFinite(c)) {
      pairs.push({ source: src.id, sink: snk.id, perPerson: c, edge: edges.length });
      edges.push({ from: srcNode(i), to: sinkNode(j), cap: Math.floor(src.people), cost: c });
    }
  }));
  const { E, totalFlow, totalCost } = referenceMinCostMaxFlow(T + 1, edges, S, T);
  const flows = pairs.map((p) => ({ source: p.source, sink: p.sink, perPerson: p.perPerson, people: E[2 * p.edge].flow })).filter((f) => f.people > 0);
  return { flows, totalFlow, totalCost };
}

function randomInstance(rng) {
  const ns = 1 + Math.floor(rng() * 40);
  const nt = 1 + Math.floor(rng() * 60);
  const integerCosts = rng() < 0.5; // integer costs produce many exact ties
  const sources = Array.from({ length: ns }, (_, i) => ({ id: `s${i}`, people: rng() < 0.1 ? 0 : Math.floor(rng() * 400) }));
  const sinks = Array.from({ length: nt }, (_, j) => ({ id: `k${j}`, beds: rng() < 0.2 ? 0 : Math.floor(rng() * 300) }));
  const table = new Map();
  for (const src of sources) {
    for (const snk of sinks) {
      const c = rng() < 0.15 ? Infinity : integerCosts ? Math.floor(rng() * 6) : rng() * 50;
      table.set(`${src.id}|${snk.id}`, c);
    }
  }
  return { sources, sinks, cost: (a, b) => table.get(`${a}|${b}`) };
}

test("assignment matches the Bellman-Ford reference on 300 random instances", () => {
  const rng = seededRng(2024);
  for (let trial = 0; trial < 300; trial++) {
    const inst = randomInstance(rng);
    const ref = referenceAssign(inst);
    const got = assignEvacuees(inst);
    assert.equal(got.assigned, ref.totalFlow, `trial ${trial}: assigned people`);
    assert.ok(Math.abs(got.totalCost - ref.totalCost) <= 1e-6, `trial ${trial}: cost ${got.totalCost} vs ${ref.totalCost}`);
    assert.deepEqual(got.flows, ref.flows, `trial ${trial}: per-pair flows`);

    const placed = got.flows.reduce((s, f) => s + f.people, 0);
    assert.equal(placed, got.assigned, `trial ${trial}: flows add up`);
    for (const snk of inst.sinks) {
      const load = got.flows.filter((f) => f.sink === snk.id).reduce((s, f) => s + f.people, 0);
      assert.ok(load <= Math.max(0, Math.floor(snk.beds)), `trial ${trial}: ${snk.id} over capacity`);
    }
  }
});

test("hand-checked: the cheaper plan wins when both zones can reach both shelters", () => {
  const cost = (a, b) => ({ "A|X": 1, "A|Y": 5, "B|X": 1, "B|Y": 2 })[`${a}|${b}`];
  const r = assignEvacuees({ sources: [{ id: "A", people: 10 }, { id: "B", people: 10 }], sinks: [{ id: "X", beds: 10 }, { id: "Y", beds: 10 }], cost });
  assert.equal(r.assigned, 20);
  assert.equal(r.totalCost, 30);
  assert.deepEqual(r.flows.map((f) => [f.source, f.sink, f.people]), [["A", "X", 10], ["B", "Y", 10]]);
});

test("hand-checked: an augmenting path reroutes an earlier assignment", () => {
  // A can use X (cost 0) or Y (cost 1); B can only use X. Greedy would strand B.
  const cost = (a, b) => ({ "A|X": 0, "A|Y": 1, "B|X": 0 })[`${a}|${b}`] ?? Infinity;
  const r = assignEvacuees({ sources: [{ id: "A", people: 1 }, { id: "B", people: 1 }], sinks: [{ id: "X", beds: 1 }, { id: "Y", beds: 1 }], cost });
  assert.equal(r.assigned, 2);
  assert.equal(r.totalCost, 1);
  assert.deepEqual(r.unassigned, []);
});

test("hand-checked: capacity limits and zero beds leave people unassigned", () => {
  const r = assignEvacuees({ sources: [{ id: "A", people: 50 }], sinks: [{ id: "X", beds: 30 }], cost: () => 3 });
  assert.equal(r.assigned, 30);
  assert.equal(r.totalCost, 90);
  assert.deepEqual(r.unassigned, [{ source: "A", people: 20 }]);

  const none = assignEvacuees({ sources: [{ id: "A", people: 5 }], sinks: [{ id: "X", beds: 0 }], cost: () => 1 });
  assert.equal(none.assigned, 0);
  assert.deepEqual(none.unassigned, [{ source: "A", people: 5 }]);
});
