// Live-demo helper: plays an insider who edits the database directly, behind the app's back.
//   node chain/tamper-demo.js         rewrite the newest anchored entry's details
//   node chain/tamper-demo.js --undo  put the original text back
// Then press "Verify on chain" on the Audit Log page.
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const db = new DatabaseSync(path.join(__dirname, "..", "data", "urbanpulse.db"));
const backup = path.join(__dirname, "..", "data", "tamper-backup.json");

if (process.argv.includes("--undo")) {
  if (!fs.existsSync(backup)) {
    console.log("nothing to undo");
    process.exit(0);
  }
  const { id, details } = JSON.parse(fs.readFileSync(backup, "utf8"));
  db.prepare("UPDATE audit SET details = ? WHERE id = ?").run(details, id);
  fs.unlinkSync(backup);
  console.log(`restored entry ${id}`);
  process.exit(0);
}

if (fs.existsSync(backup)) {
  console.log("an entry is already tampered; run with --undo first");
  process.exit(1);
}
const row = db.prepare("SELECT a.id, a.action, a.details FROM audit a JOIN audit_anchor x ON x.audit_id = a.id ORDER BY a.ts DESC LIMIT 1").get();
if (!row) {
  console.log("no anchored entries yet; press \"Anchor now\" on the Audit Log page first");
  process.exit(1);
}
fs.writeFileSync(backup, JSON.stringify({ id: row.id, details: row.details }));
const forged = { ...JSON.parse(row.details), ip: "203.0.113.7", note: "edited after the fact" };
db.prepare("UPDATE audit SET details = ? WHERE id = ?").run(JSON.stringify(forged), row.id);
console.log(`tampered with ${row.action} entry ${row.id}`);
