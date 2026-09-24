// Water-level simulator shared by the live server and the offline experiments.
// All randomness goes through an injected rng so experiment runs are reproducible from a seed.

const ZONE_DEFS = [
  { id: "pallikaranai", name: "Pallikaranai Marshland", lat: 12.9375, lng: 80.2119, base: 35, amplitude: 20, phase: 0, population: 185000 },
  { id: "velachery", name: "Velachery", lat: 12.9756, lng: 80.2207, base: 40, amplitude: 22, phase: 5, population: 260000 },
  { id: "omr", name: "OMR (Sholinganallur)", lat: 12.9010, lng: 80.2279, base: 30, amplitude: 18, phase: 10, population: 210000 },
  { id: "tnagar", name: "T Nagar", lat: 13.0418, lng: 80.2341, base: 25, amplitude: 15, phase: 3, population: 240000 },
  { id: "adyar", name: "Adyar", lat: 13.0012, lng: 80.2565, base: 28, amplitude: 16, phase: 8, population: 195000 },
  { id: "mylapore", name: "Mylapore", lat: 13.0339, lng: 80.2619, base: 32, amplitude: 17, phase: 14, population: 170000 },
];

const SHELTER_DEFS = [
  { id: "s1", name: "Corporation School, Velachery", zoneId: "velachery", lat: 12.9790, lng: 80.2180, capacity: 400 },
  { id: "s2", name: "Community Hall, Adyar", zoneId: "adyar", lat: 13.0067, lng: 80.2520, capacity: 300 },
  { id: "s3", name: "Govt. Hr. Sec. School, Sholinganallur", zoneId: "omr", lat: 12.9050, lng: 80.2330, capacity: 500 },
  { id: "s4", name: "Kalyana Mandapam, T Nagar", zoneId: "tnagar", lat: 13.0380, lng: 80.2290, capacity: 350 },
  { id: "s5", name: "Relief Centre, Mylapore", zoneId: "mylapore", lat: 13.0300, lng: 80.2680, capacity: 250 },
  { id: "s6", name: "Marriage Hall, Medavakkam", zoneId: "pallikaranai", lat: 12.9200, lng: 80.1920, capacity: 300 },
];

const RAIN_BURST_CHANCE = 0.008; // per zone per tick
const RAIN_BURST_DECAY = 0.9;
const STORM_DECAY = 0.97; // injected storms linger ~1-2 min so there's time to respond in a demo

function createZones() {
  return ZONE_DEFS.map((z) => ({ ...z, level: z.base, prevLevel: z.base, surge: 0, storm: 0, dangerTicks: 0 }));
}

function createShelters() {
  return SHELTER_DEFS.map((s) => ({ ...s, occupancy: 0 }));
}

// advance every zone one tick (t is the tick number after incrementing)
function stepZones(zones, t, rng, { stormDecay = STORM_DECAY } = {}) {
  for (const z of zones) {
    z.prevLevel = z.level;
    if (rng() < RAIN_BURST_CHANCE) z.surge += 20 + rng() * 15;
    z.surge *= RAIN_BURST_DECAY;
    z.storm *= stormDecay;
    const oscillation = z.base + z.amplitude * Math.sin((t + z.phase) / 12);
    const noise = (rng() - 0.5) * 4;
    z.level = Math.max(0, Math.min(100, oscillation + noise + z.surge + z.storm));
  }
}

function injectStorm(zones, zoneId, amount) {
  for (const z of zones) if (zoneId === "all" || z.id === zoneId) z.storm += amount;
}

// mulberry32: tiny, fast, good-enough PRNG for simulation (not for security)
function seededRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

module.exports = { ZONE_DEFS, SHELTER_DEFS, createZones, createShelters, stepZones, injectStorm, seededRng };
