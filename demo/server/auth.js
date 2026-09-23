const { randomBytes, randomUUID, scryptSync, timingSafeEqual } = require("node:crypto");

const COOKIE = "up_session";
const SESSION_MS = 12 * 60 * 60 * 1000;
const MAX_FAILED = 10;
const LOCKOUT_MS = 15 * 60 * 1000;
const ROLES = ["admin", "officer", "viewer"];

// demo accounts; override passwords with env vars outside a classroom demo
const SEED_USERS = [
  { username: "admin", name: "Control Room Admin", role: "admin", password: process.env.UP_ADMIN_PASSWORD || "admin123" },
  { username: "officer", name: "Field Officer, Velachery", role: "officer", password: process.env.UP_OFFICER_PASSWORD || "officer123" },
  { username: "viewer", name: "GCC Observer", role: "viewer", password: process.env.UP_VIEWER_PASSWORD || "viewer123" },
];

function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

function verifyPassword(password, stored) {
  const [scheme, saltHex, hashHex] = String(stored).split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(String(password), Buffer.from(saltHex, "hex"), expected.length);
  return timingSafeEqual(actual, expected);
}

function parseCookies(header) {
  const out = {};
  for (const part of String(header || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

const publicUser = (u) => ({ id: u.id, username: u.username, name: u.name, role: u.role });

function createAuth(rawDb) {
  const insertUser = rawDb.prepare("INSERT OR IGNORE INTO users (id, username, name, role, password_hash) VALUES (?, ?, ?, ?, ?)");
  for (const u of SEED_USERS) insertUser.run(randomUUID(), u.username, u.name, u.role, hashPassword(u.password));

  const failed = new Map(); // username -> { count, since }

  return {
    login(username, password) {
      const key = String(username || "").toLowerCase();
      const f = failed.get(key);
      if (f && f.count >= MAX_FAILED && Date.now() - f.since < LOCKOUT_MS) return { error: "Too many failed attempts. Try again in 15 minutes.", status: 429 };

      const user = rawDb.prepare("SELECT * FROM users WHERE username = ?").get(key);
      // same message whether the user exists or not
      if (!user || !verifyPassword(password, user.password_hash)) {
        const next = f && Date.now() - f.since < LOCKOUT_MS ? { count: f.count + 1, since: f.since } : { count: 1, since: Date.now() };
        failed.set(key, next);
        return { error: "Invalid username or password", status: 401 };
      }
      failed.delete(key);

      const token = randomBytes(32).toString("hex");
      rawDb.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)").run(token, user.id, Date.now() + SESSION_MS);
      return { token, user: publicUser(user) };
    },

    userFromCookieHeader(header) {
      const token = parseCookies(header)[COOKIE];
      if (!token) return null;
      const row = rawDb.prepare(
        "SELECT u.*, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?"
      ).get(token);
      if (!row) return null;
      if (row.expires_at < Date.now()) {
        rawDb.prepare("DELETE FROM sessions WHERE token = ?").run(token);
        return null;
      }
      return publicUser(row);
    },

    logout(header) {
      const token = parseCookies(header)[COOKIE];
      if (token) rawDb.prepare("DELETE FROM sessions WHERE token = ?").run(token);
    },

    sessionCookie(token) {
      // no Secure flag: the demo runs on plain http://localhost
      return `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_MS / 1000}`;
    },
    clearedCookie() {
      return `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
    },
  };
}

// express middleware factories
function attachUser(auth) {
  return (req, res, next) => {
    req.user = auth.userFromCookieHeader(req.headers.cookie);
    next();
  };
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Please sign in" });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: "Your role doesn't allow this action" });
    next();
  };
}

module.exports = { createAuth, attachUser, requireRole, hashPassword, verifyPassword, parseCookies, ROLES, SEED_USERS };
