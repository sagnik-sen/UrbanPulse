// Last public state seen on this phone, so the citizen app still shows something without a connection.
const KEY = "urbanpulse.citizen.snapshot";

// returns the savedAt time, or null when the browser refuses storage
export function saveSnapshot(publicState) {
  const savedAt = Date.now();
  try {
    localStorage.setItem(KEY, JSON.stringify({
      savedAt,
      locations: publicState.locations,
      broadcasts: publicState.broadcasts,
      shelters: publicState.shelters,
      rainfall: publicState.rainfall ?? null,
    }));
    return savedAt;
  } catch {
    return null;
  }
}

export function loadSnapshot() {
  try {
    const snap = JSON.parse(localStorage.getItem(KEY));
    return Array.isArray(snap?.locations) ? snap : null;
  } catch {
    return null;
  }
}
