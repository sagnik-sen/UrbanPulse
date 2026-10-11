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
    CREATE TABLE IF NOT EXISTS anchor_batches (
      id INTEGER PRIMARY KEY,
      root TEXT NOT NULL,
      count INTEGER NOT NULL,
      tx_hash TEXT NOT NULL,
      anchored_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS audit_anchor (
      audit_id TEXT PRIMARY KEY,
      batch_id INTEGER NOT NULL,
      pos INTEGER NOT NULL,
      leaf TEXT NOT NULL
    );
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

    // append-only: entries are never pruned (and survive "clear demo data"), since anchored
    // batches are verified by recomputing their Merkle root from every entry in them
    logAudit({ id, ts, username, role, action, details }) {
      db.prepare("INSERT INTO audit (id, ts, username, role, action, details) VALUES (?, ?, ?, ?, ?, ?)")
        .run(id, ts, username ?? null, role ?? null, action, JSON.stringify(details ?? {}));
    },
    listAudit({ action, limit = 500 } = {}) {
      const sql = `SELECT a.*, x.batch_id, b.tx_hash FROM audit a
        LEFT JOIN audit_anchor x ON x.audit_id = a.id LEFT JOIN anchor_batches b ON b.id = x.batch_id
        ${action ? "WHERE a.action = ?" : ""} ORDER BY a.ts DESC LIMIT ?`;
      const rows = action ? db.prepare(sql).all(action, limit) : db.prepare(sql).all(limit);
      return rows.map((r) => ({ ...r, details: JSON.parse(r.details) }));
    },

    // blockchain anchoring (anchor.js): rows come back raw so hashes match the stored text exactly
    unanchoredAudit(limit) {
      return db.prepare("SELECT a.* FROM audit a LEFT JOIN audit_anchor x ON x.audit_id = a.id WHERE x.audit_id IS NULL ORDER BY a.ts, a.id LIMIT ?").all(limit);
    },
    saveAnchorBatch({ id, root, count, txHash, anchoredAt }, rows) {
      db.exec("BEGIN");
      try {
        db.prepare("INSERT INTO anchor_batches (id, root, count, tx_hash, anchored_at) VALUES (?, ?, ?, ?, ?)").run(id, root, count, txHash, anchoredAt);
        const link = db.prepare("INSERT INTO audit_anchor (audit_id, batch_id, pos, leaf) VALUES (?, ?, ?, ?)");
        rows.forEach((r, pos) => link.run(r.id, id, pos, r.leaf));
        db.exec("COMMIT");
      } catch (err) {
        db.exec("ROLLBACK");
        throw err;
      }
    },
    anchorBatches() {
      return db.prepare("SELECT * FROM anchor_batches ORDER BY id").all();
    },
    // anchor records of a batch in anchoring order, with the entry each points to (entry columns null if deleted)
    batchEntries(batchId) {
      return db.prepare(`SELECT x.audit_id, x.leaf, a.id, a.ts, a.username, a.role, a.action, a.details
        FROM audit_anchor x LEFT JOIN audit a ON a.id = x.audit_id WHERE x.batch_id = ? ORDER BY x.pos`).all(batchId);
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
