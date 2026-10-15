const test = require("node:test");
const assert = require("node:assert");
const { MAX_PEOPLE, occupied, freeBeds, checkIn, checkOut, tokenMatches, newToken } = require("./checkin");

const NOW = 1_700_000_000_000;
const shelter = { id: "s1", capacity: 10 };

test("checkIn: records a household and reports the beds left", () => {
  const r = checkIn({}, shelter, 4, NOW);
  assert.strictEqual(r.free, 6);
  assert.strictEqual(r.household.people, 4);
  assert.strictEqual(r.household.ts, NOW);
  assert.match(r.household.id, /^[0-9a-f-]{36}$/);
  assert.strictEqual(occupied(r.state, "s1"), 4);
});

test("checkIn: never takes a shelter over capacity", () => {
  const first = checkIn({}, shelter, 8, NOW);
  const second = checkIn(first.state, shelter, 3, NOW);
  assert.strictEqual(second.full, true);
  assert.strictEqual(second.free, 2);
  assert.strictEqual(second.state, undefined);
  const exact = checkIn(first.state, shelter, 2, NOW);
  assert.strictEqual(exact.free, 0);
  assert.strictEqual(occupied(exact.state, "s1"), 10);
});

test("checkIn: rejects headcounts outside 1 to MAX_PEOPLE and non-integers", () => {
  for (const people of [0, -1, MAX_PEOPLE + 1, 2.5, "3", NaN, undefined]) {
    assert.ok(checkIn({}, { id: "s1", capacity: 100 }, people, NOW).error, `expected error for ${people}`);
  }
  assert.ok(checkIn({}, { id: "s1", capacity: 100 }, MAX_PEOPLE, NOW).household);
});

test("checkIn: does not mutate the state it is given", () => {
  const before = {};
  checkIn(before, shelter, 2, NOW);
  assert.deepStrictEqual(before, {});
});

test("checkOut: removes only the named household and frees its beds", () => {
  const a = checkIn({}, shelter, 3, NOW);
  const b = checkIn(a.state, shelter, 5, NOW);
  const out = checkOut(b.state, "s1", a.household.id);
  assert.strictEqual(out.household.people, 3);
  assert.strictEqual(freeBeds(out.state, shelter), 5);
  assert.deepStrictEqual(out.state.s1.map((h) => h.id), [b.household.id]);
});

test("checkOut: unknown household or shelter gives null", () => {
  const a = checkIn({}, shelter, 1, NOW);
  assert.strictEqual(checkOut(a.state, "s1", "nope"), null);
  assert.strictEqual(checkOut(a.state, "s2", a.household.id), null);
  assert.strictEqual(checkOut({}, "s1", a.household.id), null);
});

test("occupied: sums people per shelter across households", () => {
  let state = {};
  state = checkIn(state, { id: "s1", capacity: 100 }, 4, NOW).state;
  state = checkIn(state, { id: "s1", capacity: 100 }, 6, NOW).state;
  state = checkIn(state, { id: "s2", capacity: 100 }, 2, NOW).state;
  assert.strictEqual(occupied(state, "s1"), 10);
  assert.strictEqual(occupied(state, "s2"), 2);
  assert.strictEqual(occupied(state, "s3"), 0);
  assert.strictEqual(freeBeds(state, { id: "s1", capacity: 12 }), 2);
  assert.strictEqual(freeBeds(state, { id: "s1", capacity: 4 }), 0);
});

test("tokenMatches: exact match only, and never on mismatched or missing values", () => {
  const token = newToken();
  assert.strictEqual(tokenMatches(token, token), true);
  assert.strictEqual(tokenMatches(token, token.slice(1) + "0"), false);
  assert.strictEqual(tokenMatches(token, token.slice(0, -1)), false);
  assert.strictEqual(tokenMatches(token, undefined), false);
  assert.strictEqual(tokenMatches(undefined, token), false);
  assert.strictEqual(tokenMatches(token, 42), false);
});

test("newToken: 16 random bytes as hex, different each time", () => {
  const a = newToken();
  assert.match(a, /^[0-9a-f]{32}$/);
  assert.notStrictEqual(a, newToken());
});
