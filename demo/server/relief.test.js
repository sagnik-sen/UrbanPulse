const test = require("node:test");
const assert = require("node:assert");
const relief = require("./relief");
const { AMOUNT_RS, SHOPS, collectionHours, normaliseCard, cardKey, schedule, firstOpenAt, emptyState, issueToken, lookupToken, pay, summary, istDate } = relief;

const PEPPER = "test-pepper";
const CARD = "1234 5678 9012";
const KEY = cardKey(PEPPER, CARD);
// 10:00 IST on a Monday, well inside the first day's collection hours
const MORNING = Date.parse("2026-10-19T10:00:00+05:30");

test("cardKey: same card gives the same key, normalised for spaces, dashes and case", () => {
  assert.strictEqual(cardKey(PEPPER, CARD), cardKey(PEPPER, "123456789012"));
  assert.strictEqual(cardKey(PEPPER, "tn-1234-5678-9012"), cardKey(PEPPER, "TN1234 5678 9012"));
  assert.match(KEY, /^[0-9a-f]{64}$/);
});

test("cardKey: a different card or a different pepper gives a different key", () => {
  assert.notStrictEqual(cardKey(PEPPER, "123456789012"), cardKey(PEPPER, "123456789013"));
  assert.notStrictEqual(cardKey("other-pepper", "123456789012"), cardKey(PEPPER, "123456789012"));
});

test("cardKey: rejects numbers outside 10 to 16 alphanumeric characters", () => {
  assert.strictEqual(normaliseCard("12345"), null);
  assert.strictEqual(normaliseCard("12345678901234567"), null);
  assert.strictEqual(normaliseCard("12345!7890"), null);
  assert.strictEqual(cardKey(PEPPER, "short"), null);
});

test("state never holds the raw card number", () => {
  const state = emptyState();
  issueToken(state, { cardKey: KEY, zoneId: "velachery", now: MORNING });
  const json = JSON.stringify(state);
  assert.ok(!json.includes("123456789012"));
  assert.ok(!json.includes("1234 5678 9012"));
  assert.ok(json.includes(KEY));
});

test("issueToken: one token per card, a repeat returns the same token and books nothing new", () => {
  const state = emptyState();
  const first = issueToken(state, { cardKey: KEY, zoneId: "velachery", now: MORNING });
  const again = issueToken(state, { cardKey: KEY, zoneId: "velachery", now: MORNING + 60_000 });
  assert.strictEqual(first.issued, true);
  assert.strictEqual(again.issued, false);
  assert.strictEqual(again.token.code, first.token.code);
  assert.strictEqual(Object.keys(state.tokens).length, 1);
  const booked = Object.values(state.slots).flatMap((s) => Object.values(s)).reduce((n, x) => n + x, 0);
  assert.strictEqual(booked, 1);
});

test("issueToken: token code is RF- plus six uppercase base32 characters", () => {
  const state = emptyState();
  const { token } = issueToken(state, { cardKey: KEY, zoneId: "omr", now: MORNING });
  assert.match(token.code, /^RF-[A-Z2-7]{6}$/);
});

test("pay: succeeds once, then the token is spent", () => {
  const state = emptyState();
  const { token } = issueToken(state, { cardKey: KEY, zoneId: "velachery", now: MORNING });
  const ok = pay(state, { tokenCode: token.code, cardKey: KEY, shopId: token.shopId, now: MORNING });
  assert.strictEqual(ok.amountRs, AMOUNT_RS);
  assert.strictEqual(ok.error, undefined);
  const again = pay(state, { tokenCode: token.code, cardKey: KEY, shopId: token.shopId, now: MORNING });
  assert.match(again.error, /already been paid/);
  assert.strictEqual(again.status, 409);
});

test("pay: rejects an unknown token, a wrong card and a wrong shop", () => {
  const state = emptyState();
  const { token } = issueToken(state, { cardKey: KEY, zoneId: "velachery", now: MORNING });
  assert.strictEqual(pay(state, { tokenCode: "RF-AAAAAA", cardKey: KEY, shopId: token.shopId, now: MORNING }).status, 404);
  const otherCard = cardKey(PEPPER, "999999999999");
  assert.strictEqual(pay(state, { tokenCode: token.code, cardKey: otherCard, shopId: token.shopId, now: MORNING }).status, 409);
  const otherShop = SHOPS.find((s) => s.zoneId === "velachery" && s.id !== token.shopId).id;
  const wrongShop = pay(state, { tokenCode: token.code, cardKey: KEY, shopId: otherShop, now: MORNING });
  assert.match(wrongShop.error, /Collect this token at/);
  assert.strictEqual(wrongShop.status, 409);
  assert.strictEqual(state.tokens[KEY].paidAt, null, "rejected pays leave the token unpaid");
});

test("lookupToken: returns the token for a card that has one, null otherwise", () => {
  const state = emptyState();
  const { token } = issueToken(state, { cardKey: KEY, zoneId: "adyar", now: MORNING });
  assert.deepStrictEqual(lookupToken(state, KEY), token);
  assert.strictEqual(lookupToken(state, cardKey(PEPPER, "999999999999")), null);
});

test("collectionHours: 9 to 13 and 15 to 17, six slots", () => {
  assert.deepStrictEqual(collectionHours(), [9, 10, 11, 12, 15, 16]);
});

test("schedule: never exceeds perHour in a slot and only uses the household's zone shops", () => {
  const households = Array.from({ length: 900 }, (_, i) => ({ zoneId: i % 3 === 0 ? "omr" : "tnagar" }));
  const shops = SHOPS.filter((s) => s.zoneId === "omr" || s.zoneId === "tnagar");
  const out = schedule(households, shops, { days: 3 });
  const perSlot = new Map();
  out.forEach((a, i) => {
    assert.ok(a, "every household fits");
    const shop = shops.find((s) => s.id === a.shopId);
    assert.strictEqual(shop.zoneId, households[i].zoneId);
    const key = `${a.shopId}|${a.day}|${a.hour}`;
    perSlot.set(key, (perSlot.get(key) ?? 0) + 1);
  });
  for (const [key, n] of perSlot) {
    const shop = shops.find((s) => s.id === key.split("|")[0]);
    assert.ok(n <= shop.perHour, `${key} holds ${n}, over ${shop.perHour}`);
  }
});

test("schedule: returns null once the zone has no room left", () => {
  const shops = [{ id: "one", zoneId: "z", perHour: 1 }];
  const out = schedule([{ zoneId: "z" }, { zoneId: "z" }, { zoneId: "z" }], shops, { days: 1, startHour: 9, endHour: 10 });
  assert.ok(out[0]);
  assert.strictEqual(out[1], null);
  assert.strictEqual(out[2], null);
});

test("schedule: balances a zone's shops at the same slot time", () => {
  const shops = [
    { id: "a", zoneId: "z", perHour: 10 },
    { id: "b", zoneId: "z", perHour: 10 },
  ];
  const out = schedule([{ zoneId: "z" }, { zoneId: "z" }], shops, { days: 1 });
  assert.strictEqual(out[0].hour, out[1].hour);
  assert.notStrictEqual(out[0].shopId, out[1].shopId);
});

test("IST mapping: a UTC evening can be the next IST day, and slots after a fixed time are open", () => {
  // 23:00 UTC on 15 Oct is 04:30 IST on 16 Oct
  const lateUtc = Date.parse("2026-10-15T23:00:00Z");
  assert.strictEqual(istDate(lateUtc), "2026-10-16");
  // 12:30 IST on 16 Oct: the 9, 10, 11 and 12 slots have started, so the first open one is 15:00 that day
  const midday = Date.parse("2026-10-16T12:30:00+05:30");
  assert.strictEqual(firstOpenAt("2026-10-16", midday), 15);
  // 04:30 IST: nothing has started, so day 0 at 9:00 opens first
  assert.strictEqual(firstOpenAt("2026-10-16", lateUtc), 9);
});

test("issueToken: a token issued at 12:30 IST gets the 15:00 slot of the scheme's first day", () => {
  const state = emptyState();
  const now = Date.parse("2026-10-16T12:30:00+05:30");
  const { token } = issueToken(state, { cardKey: KEY, zoneId: "velachery", now });
  assert.strictEqual(state.startDate, "2026-10-16");
  assert.strictEqual(token.day, "2026-10-16");
  assert.strictEqual(token.hour, 15);
});

test("summary: totals equal the paid tokens times Rs 6,000", () => {
  const state = emptyState();
  const cards = ["111111111111", "222222222222", "333333333333"].map((c) => cardKey(PEPPER, c));
  const tokens = cards.map((key, i) => issueToken(state, { cardKey: key, zoneId: i === 0 ? "adyar" : "omr", now: MORNING }).token);
  pay(state, { tokenCode: tokens[0].code, cardKey: cards[0], shopId: tokens[0].shopId, now: MORNING });
  pay(state, { tokenCode: tokens[1].code, cardKey: cards[1], shopId: tokens[1].shopId, now: MORNING });
  const s = summary(state);
  assert.strictEqual(s.totals.issued, 3);
  assert.strictEqual(s.totals.paid, 2);
  assert.strictEqual(s.totals.amountRs, 2 * AMOUNT_RS);
  assert.strictEqual(s.shops.reduce((n, x) => n + x.amountRs, 0), s.totals.amountRs);
  const booked = s.shops.flatMap((x) => x.slots).reduce((n, x) => n + x.booked, 0);
  assert.strictEqual(booked, 3);
});
