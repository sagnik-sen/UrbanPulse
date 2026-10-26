const test = require("node:test");
const assert = require("node:assert");
const { rateLimit, _reset } = require("./ratelimit");

// the parts of Express's req/res the middleware touches
function fakeRes() {
  return {
    headers: {},
    statusCode: 200,
    body: null,
    set(k, v) { this.headers[k] = v; return this; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}
function hit(mw, ip) {
  const res = fakeRes();
  let passed = false;
  mw({ ip }, res, () => { passed = true; });
  return { passed, res };
}

test("allows max requests, calls next(), then answers 429 with Retry-After", () => {
  _reset();
  let t = 0;
  const mw = rateLimit({ windowMs: 60_000, max: 3, name: "a", now: () => t });
  for (let i = 0; i < 3; i++) {
    const ok = hit(mw, "1.2.3.4");
    assert.strictEqual(ok.passed, true);
    assert.strictEqual(ok.res.body, null);
  }
  const denied = hit(mw, "1.2.3.4");
  assert.strictEqual(denied.passed, false);
  assert.strictEqual(denied.res.statusCode, 429);
  assert.strictEqual(denied.res.headers["Retry-After"], "60");
  assert.deepStrictEqual(denied.res.body, { error: "Too many requests. Try again in 60 seconds." });

  t = 15_000;
  assert.strictEqual(hit(mw, "1.2.3.4").res.headers["Retry-After"], "45");
});

test("separate client keys are counted independently", () => {
  _reset();
  const mw = rateLimit({ windowMs: 60_000, max: 1, name: "b", now: () => 0 });
  assert.strictEqual(hit(mw, "10.0.0.1").passed, true);
  assert.strictEqual(hit(mw, "10.0.0.1").passed, false);
  assert.strictEqual(hit(mw, "10.0.0.2").passed, true);
});

test("the window resets after windowMs", () => {
  _reset();
  let t = 0;
  const mw = rateLimit({ windowMs: 60_000, max: 1, name: "c", now: () => t });
  assert.strictEqual(hit(mw, "10.0.0.1").passed, true);
  assert.strictEqual(hit(mw, "10.0.0.1").passed, false);
  t = 59_999;
  assert.strictEqual(hit(mw, "10.0.0.1").passed, false);
  t = 60_000;
  assert.strictEqual(hit(mw, "10.0.0.1").passed, true);
});

test("the map stays bounded: past 10,000 keys the oldest windows are dropped", () => {
  _reset();
  const mw = rateLimit({ windowMs: 60_000, max: 1, name: "d", now: () => 0 });
  assert.strictEqual(hit(mw, "ip-0").passed, true);
  assert.strictEqual(hit(mw, "ip-0").passed, false);
  for (let i = 1; i < 20_000; i++) hit(mw, `ip-${i}`);
  // the most recent windows are still tracked
  assert.strictEqual(hit(mw, "ip-19999").passed, false);
  // ip-0 was the oldest and was evicted, so it starts again with a full allowance
  assert.strictEqual(hit(mw, "ip-0").passed, true);
});

test("requests from this machine are never limited; other addresses are", () => {
  _reset();
  const mw = rateLimit({ windowMs: 60_000, max: 1, name: "e", now: () => 0 });
  for (const ip of ["127.0.0.1", "::1", "::ffff:127.0.0.1"]) {
    for (let i = 0; i < 5; i++) assert.strictEqual(hit(mw, ip).passed, true);
  }
  assert.strictEqual(hit(mw, "192.168.1.20").passed, true);
  assert.strictEqual(hit(mw, "192.168.1.20").passed, false);
});
