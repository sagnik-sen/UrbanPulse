// Reservoir desk data. The reservoir figures are ILLUSTRATIVE, not Water Resources Department data.
const RESERVOIRS = [
  { id: "chembarambakkam", name: "Chembarambakkam Lake", river: "Adyar", capacityMcft: 3645, storagePct: 82, downstream: ["adyar", "tnagar", "mylapore"] },
  { id: "porur", name: "Porur Lake", river: "Adyar", capacityMcft: 47, storagePct: 76, downstream: ["velachery", "pallikaranai"] },
];

// Simulated water-level rise (0-100 scale) in each downstream zone for a release. This is a
// simulation of the demo, not a hydrological model: it grows with flow and is capped at 35.
function releaseImpact(cusecs) {
  return Math.min(35, Math.round(cusecs / 1000) * 3);
}

module.exports = { RESERVOIRS, releaseImpact };
