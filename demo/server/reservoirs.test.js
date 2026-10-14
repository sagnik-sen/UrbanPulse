const test = require("node:test");
const assert = require("node:assert");
const { RESERVOIRS, releaseImpact } = require("./reservoirs");
const { ZONE_DEFS } = require("./simulator");

test("release impact stays on the 0-100 scale and never falls as flow rises", () => {
  let previous = -1;
  for (let cusecs = 100; cusecs <= 60000; cusecs += 100) {
    const impact = releaseImpact(cusecs);
    assert.ok(impact >= 0 && impact <= 35, `cusecs ${cusecs} gave ${impact}`);
    assert.ok(impact >= previous, `impact fell at ${cusecs} cusecs`);
    previous = impact;
  }
  assert.equal(releaseImpact(60000), 35);
});

test("every downstream zone of every reservoir is a known monitored zone", () => {
  const zoneIds = new Set(ZONE_DEFS.map((z) => z.id));
  for (const r of RESERVOIRS) {
    assert.ok(r.downstream.length > 0, `${r.id} has no downstream zones`);
    for (const id of r.downstream) assert.ok(zoneIds.has(id), `${r.id} -> unknown zone ${id}`);
  }
});
