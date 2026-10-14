const test = require("node:test");
const assert = require("node:assert");
const { PARAMS, logit, trustOf, updateTrust, zoneProbability } = require("./fusion");

const NOW = 100;
const high = (deviceId, tick = NOW) => ({ deviceId, severity: "high", tick });

test("unseen devices start at the prior trust and updates move the record", () => {
  assert.equal(trustOf(undefined), 0.25);
  assert.equal(trustOf({ a: 3, b: 1 }), 0.75);
  assert.deepEqual(updateTrust(undefined, "verified"), { a: 2, b: 3 });
  assert.deepEqual(updateTrust(undefined, "rejected"), { a: 1, b: 4 });
  const record = { a: 2, b: 2 };
  assert.deepEqual(updateTrust(record, "verified"), { a: 3, b: 2 });
  assert.deepEqual(record, { a: 2, b: 2 }, "input record is not mutated");
  assert.throws(() => updateTrust(record, "maybe"));
});

test("no sensor and no reports gives the prior", () => {
  const p = zoneProbability({ reading: null, reports: [], now: NOW, trust: new Map() });
  assert.ok(Math.abs(p - PARAMS.PRIOR) < 1e-12);
});

test("a high reading drives the zone above the declaration threshold", () => {
  const p = zoneProbability({ reading: 80, reports: [], now: NOW, trust: new Map() });
  assert.ok(p > PARAMS.DECLARE_P);
  const low = zoneProbability({ reading: 50, reports: [], now: NOW, trust: new Map() });
  assert.ok(low < PARAMS.DECLARE_P);
});

test("report evidence decays with age and is ignored after four half-lives", () => {
  const trust = new Map([["e", { a: 5, b: 3 }]]);
  const p = (age) => zoneProbability({ reading: null, reports: [{ deviceId: "e", severity: "high", tick: NOW - age }], now: NOW, trust });
  assert.ok(p(0) > p(15) && p(15) > p(30) && p(30) > PARAMS.PRIOR);
  assert.ok(p(60) > PARAMS.PRIOR, "still counts at exactly four half-lives");
  assert.ok(Math.abs(p(61) - PARAMS.PRIOR) < 1e-12, "ignored beyond four half-lives");
  assert.ok(Math.abs(p(-1) - PARAMS.PRIOR) < 1e-12, "future reports are ignored");
});

test("twenty fresh-device reports cannot exceed the new-device cap", () => {
  const reports = Array.from({ length: 20 }, (_, i) => high(`fresh-${i}`));
  const L = logit(zoneProbability({ reading: null, reports, now: NOW, trust: new Map() }));
  const cap = logit(PARAMS.PRIOR) + PARAMS.NEW_DEVICE_CAP;
  assert.ok(L <= cap + 1e-9);
  assert.ok(Math.abs(L - cap) < 1e-9, "twenty reports reach the cap exactly");
});

test("total report contribution never exceeds REPORT_CAP", () => {
  const trust = new Map(Array.from({ length: 50 }, (_, i) => [`e${i}`, { a: 20, b: 1 }]));
  const established = Array.from({ length: 50 }, (_, i) => high(`e${i}`));
  const fresh = Array.from({ length: 20 }, (_, i) => high(`fresh-${i}`));
  const L = logit(zoneProbability({ reading: null, reports: [...established, ...fresh], now: NOW, trust }));
  assert.ok(L - logit(PARAMS.PRIOR) <= PARAMS.REPORT_CAP + 1e-9);
  assert.ok(Math.abs(L - logit(PARAMS.PRIOR) - PARAMS.REPORT_CAP) < 1e-9, "heavy established support reaches the cap");
});
