// SQLite persistence via Node's built-in driver (Node >= 22.5, no native build step).
// The server keeps working copies in memory and writes through here on every change.
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const DATA_DIR = path.join(__dirname, "data");

function openDb(file = path.join(DATA_DIR, "urbanpulse.db")) {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS reports    (id TEXT PRIMARY KEY, ts INTEGER NOT NULL, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS incidents  (id TEXT PRIMARY KEY, ts INTEGER NOT NULL, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS broadcasts (id TEXT PRIMARY KEY, ts INTEGER NOT NULL, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS settings   (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'officer', 'viewer')),
      password_hash TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS audit (
      id TEXT PRIMARY KEY,
      ts INTEGER NOT NULL,
      username TEXT,
      role TEXT,
      action TEXT NOT NULL,
      details TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS audit_ts ON audit (ts DESC);
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
  `);

  const RECORD_TABLES = new Set(["reports", "incidents", "broadcasts"]);
  const check = (table) => {
    if (!RECORD_TABLES.has(table)) throw new Error(`unknown table ${table}`);
    return table;
  };

  return {
    raw: db,

    // record tables: newest first, capped
    load(table, limit) {
      return db.prepare(`SELECT data FROM ${check(table)} ORDER BY ts DESC LIMIT ?`).all(limit).map((r) => JSON.parse(r.data));
    },
    save(table, record, ts) {
      db.prepare(`INSERT INTO ${check(table)} (id, ts, data) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data`)
        .run(record.id, ts, JSON.stringify(record));
    },
    clearRecords() {
      db.exec("DELETE FROM reports; DELETE FROM incidents; DELETE FROM broadcasts;");
    },

    // audit trail survives "clear demo data" on purpose; only the oldest entries past the cap are pruned
    logAudit({ id, ts, username, role, action, details }, keep = 2000) {
      db.prepare("INSERT INTO audit (id, ts, username, role, action, details) VALUES (?, ?, ?, ?, ?, ?)")
        .run(id, ts, username ?? null, role ?? null, action, JSON.stringify(details ?? {}));
      db.prepare("DELETE FROM audit WHERE id NOT IN (SELECT id FROM audit ORDER BY ts DESC LIMIT ?)").run(keep);
    },
    listAudit({ action, limit = 500 } = {}) {
      const rows = action
        ? db.prepare("SELECT * FROM audit WHERE action = ? ORDER BY ts DESC LIMIT ?").all(action, limit)
        : db.prepare("SELECT * FROM audit ORDER BY ts DESC LIMIT ?").all(limit);
      return rows.map((r) => ({ ...r, details: JSON.parse(r.details) }));
    },

    getSetting(key, fallback) {
      const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
      return row ? JSON.parse(row.value) : fallback;
    },
    setSetting(key, value) {
      db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, JSON.stringify(value));
    },
  };
}

module.exports = { openDb };
