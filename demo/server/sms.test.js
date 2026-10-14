const test = require("node:test");
const assert = require("node:assert");
const { handleSms } = require("./sms");

const ZONES = [
  { id: "velachery", name: "Velachery", lat: 12.9756, lng: 80.2207, risk: "danger", level: 82, forecastHours: null },
  { id: "adyar", name: "Adyar", lat: 13.0012, lng: 80.2565, risk: "safe", level: 20, forecastHours: null },
  { id: "pallikaranai", name: "Pallikaranai Marshland", lat: 12.9375, lng: 80.2119, risk: "warning", level: 55, forecastHours: 0.6 },
  { id: "omr", name: "OMR (Sholinganallur)", lat: 12.901, lng: 80.2279, risk: "safe", level: 30, forecastHours: null },
];
const SHELTERS = [
  { id: "s1", name: "Corporation School, Velachery", zoneId: "velachery", lat: 12.979, lng: 80.218, capacity: 400, occupancy: 400 },
  { id: "s2", name: "Community Hall, Adyar", zoneId: "adyar", lat: 13.0067, lng: 80.252, capacity: 300, occupancy: 120 },
  { id: "s3", name: "Govt. Hr. Sec. School, Sholinganallur", zoneId: "omr", lat: 12.905, lng: 80.233, capacity: 500, occupancy: 100 },
];
const RAIN = { velachery: { imdObserved: "heavy", imdForecast: "none" }, adyar: { imdObserved: "none", imdForecast: "none" } };
const MESSAGE = "FLOOD WARNING: Water levels critical in Velachery. Move to higher ground or the nearest relief shelter. Verify: UP-1A2B3C4D";

function ctx({ status = "verified", message = MESSAGE, seen = [], shelters = SHELTERS } = {}) {
  return {
    zones: ZONES,
    shelters,
    rain: RAIN,
    findAlert: async (code) => {
      seen.push(code);
      return status === "notfound" ? { status } : { status, alert: { code, zone: "Velachery", severity: "danger", message } };
    },
  };
}

test("VERIFY reports each alert status with the same meaning as the web check", async () => {
  const cases = [
    ["verified", "GENUINE official alert UP-1A2B3C4D"],
    ["pending", "PENDING"],
    ["tampered", "ALTERED"],
    ["unreachable", "CANNOT CHECK"],
    ["notfound", "NOT an official alert"],
  ];
  for (const [status, start] of cases) {
    const reply = await handleSms("VERIFY UP-1A2B3C4D", ctx({ status }));
    assert.ok(reply.startsWith(start), `${status}: ${reply}`);
  }
});

test("a forwarded alert with its code inside is verified, and the code is looked up in upper case", async () => {
  const seen = [];
  const reply = await handleSms(MESSAGE, ctx({ seen }));
  assert.ok(reply.startsWith("GENUINE"));
  await handleSms("verify up-1a2b3c4d", ctx({ seen }));
  assert.deepStrictEqual(seen, ["UP-1A2B3C4D", "UP-1A2B3C4D"]);
});

test("VERIFY without a code asks for one, without looking anything up", async () => {
  const seen = [];
  const reply = await handleSms("VERIFY", ctx({ seen }));
  assert.ok(reply.startsWith("Send VERIFY UP-XXXXXXXX"));
  assert.deepStrictEqual(seen, []);
});

test("SHELTER finds the nearest shelter with free beds, in English and Tamil", async () => {
  const english = await handleSms("  shelter   VELACHERY ", ctx());
  assert.ok(english.startsWith("Community Hall, Adyar"), english);
  assert.ok(english.includes("180 free beds of 300"), english);
  const tamil = await handleSms("முகாம் Velachery", ctx());
  assert.strictEqual(tamil, english);
});

test("SHELTER says so when no shelter has free beds", async () => {
  const full = SHELTERS.map((s) => ({ ...s, occupancy: s.capacity }));
  const reply = await handleSms("SHELTER Adyar", ctx({ shelters: full }));
  assert.ok(reply.startsWith("No shelter has free beds"), reply);
});

test("STATUS gives risk, water level, forecast and rain when there is some", async () => {
  const velachery = await handleSms("STATUS velachery", ctx());
  assert.strictEqual(velachery, "Velachery: DANGER, water level 82%. Past 24 h rain: Heavy rain.");
  const tamil = await handleSms("நிலை Adyar", ctx());
  assert.strictEqual(tamil, "Adyar: SAFE, water level 20%.");
  const marsh = await handleSms("STATUS pallikaranai", ctx());
  assert.ok(marsh.includes("WARNING, water level 55%."), marsh);
  assert.ok(marsh.includes("Danger possible in about 0.6 h."), marsh);
});

test("area names match by exact name, prefix or any part of the name", async () => {
  assert.ok((await handleSms("STATUS marsh", ctx())).startsWith("Pallikaranai Marshland"));
  assert.ok((await handleSms("STATUS sholinganallur", ctx())).startsWith("OMR (Sholinganallur)"));
  assert.ok((await handleSms("STATUS omr", ctx())).startsWith("OMR (Sholinganallur)"));
});

test("an unknown area gets the list of areas", async () => {
  const reply = await handleSms("SHELTER Nowhere", ctx());
  assert.strictEqual(reply, "No area matches that name. Areas: Velachery, Adyar, Pallikaranai Marshland, OMR (Sholinganallur).");
});

test("SHELTER and STATUS without an area ask for one", async () => {
  assert.ok((await handleSms("SHELTER", ctx())).includes("Add an area name"));
  assert.ok((await handleSms("நிலை", ctx())).includes("Add an area name"));
});

test("HELP, its Tamil word, unknown text and empty text all get the menu", async () => {
  const menu = await handleSms("HELP", ctx());
  assert.ok(menu.startsWith("UrbanPulse SMS. VERIFY"));
  assert.strictEqual(await handleSms("உதவி", ctx()), menu);
  assert.strictEqual(await handleSms("hello there", ctx()), menu);
  assert.strictEqual(await handleSms("   ", ctx()), menu);
  assert.strictEqual(await handleSms(undefined, ctx()), menu);
  assert.ok(menu.length <= 300);
});

test("replies never exceed 300 characters, however long the input or the stored alert", async () => {
  const longAlert = "X".repeat(300);
  assert.ok((await handleSms(`VERIFY UP-1A2B3C4D ${"y".repeat(900)}`, ctx({ message: longAlert }))).length <= 300);
  const verified = await handleSms("UP-1A2B3C4D", ctx({ message: longAlert }));
  assert.ok(verified.length <= 300 && verified.endsWith("..."), verified);
  assert.ok((await handleSms("z".repeat(2000), ctx())).length <= 300);
});
