// Fixed-window request limiter, per client IP, held in memory. Counts reset on restart and are not
// shared between processes, which is enough for one demo server.
// index.js trusts X-Forwarded-For from loopback (the Vite proxy), so req.ip is the real client.
// Requests from this machine itself (the presenter's own browser) are not limited; every other device is.
const MAX_KEYS = 10_000;
const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
const stores = new Set();

function rateLimit({ windowMs, max, name = "limit", now = Date.now }) {
  // windows are inserted in start-time order, so the first Map entry is always the oldest:
  // expired windows are pruned from the front and the size cap evicts from the front
  const windows = new Map();
  stores.add(windows);

  return function limiter(req, res, next) {
    if (LOOPBACK.has(req.ip)) return next();
    const t = now();
    for (const [key, w] of windows) {
      if (t - w.start < windowMs) break;
      windows.delete(key);
    }

    const key = `${name}|${req.ip}`;
    let w = windows.get(key);
    if (!w) {
      if (windows.size >= MAX_KEYS) windows.delete(windows.keys().next().value);
      w = { start: t, count: 0 };
      windows.set(key, w);
    }

    if (w.count >= max) {
      const retryAfter = Math.ceil((w.start + windowMs - t) / 1000);
      res.set("Retry-After", String(retryAfter));
      return res.status(429).json({ error: `Too many requests. Try again in ${retryAfter} seconds.` });
    }
    w.count += 1;
    next();
  };
}

function _reset() {
  for (const windows of stores) windows.clear();
}

module.exports = { rateLimit, _reset };
