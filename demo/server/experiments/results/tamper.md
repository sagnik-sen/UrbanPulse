# Audit-log tamper experiment (results)

200 seeded trials per attack, 300 entries per log, anchored in batches of 50. Chain: in-memory stand-in for the AuditAnchor contract;
anchoring and verification use the server's own code (db.js, anchor.js). Attacks are made directly on SQLite, as an insider with database access would.

## Detection by attack

| Attack | Detected | Pinpointed to the entry | Flagged at batch level | False alarms |
|---|---:|---:|---:|---:|
| none (control) | 0.0% | 0.0% | 0.0% | 0.0% |
| edit details (one character) | 100.0% | 100.0% | 0.0% | 0.0% |
| backdate timestamp (1 s) | 100.0% | 100.0% | 0.0% | 0.0% |
| change who did it | 100.0% | 100.0% | 0.0% | 0.0% |
| swap two entries' timestamps | 100.0% | 100.0% | 0.0% | 0.0% |
| edit an entry and rewrite its stored hash | 100.0% | 0.0% | 100.0% | 0.0% |
| delete an entry | 100.0% | 100.0% | 0.0% | 0.0% |
| delete an entry and its anchor record | 100.0% | 0.0% | 100.0% | 0.0% |
| insert a forged entry into a batch | 100.0% | 0.0% | 100.0% | 0.0% |
| delete a whole batch locally | 100.0% | 0.0% | 100.0% | 0.0% |
| edit before anchoring (blind spot) | 0.0% | 0.0% | 0.0% | 0.0% |

Detection of anchored entries holds by construction (a changed entry changes its keccak-256 leaf, and the root on-chain cannot be changed), so the
informative columns are precision and the blind spot. Edits made before an entry is anchored are sealed as if genuine.

## Cost of anchoring and verifying (local computation, batches of 500)

| Log entries | Batches (on-chain transactions) | Hash + build batches (ms) | Verify whole log (ms) |
|---:|---:|---:|---:|
| 1,000 | 2 | 19 | 17 |
| 10,000 | 20 | 191 | 174 |
| 100,000 | 200 | 3127 | 1995 |

Verification also reads each batch root from the chain once (cached afterwards); network time is not included above.

## Inclusion-proof size (what a citizen downloads to check one alert)

| Entries in batch | Sibling hashes (worst case) | Proof size (bytes) |
|---:|---:|---:|
| 1 | 0 | 0 |
| 2 | 1 | 32 |
| 10 | 4 | 128 |
| 50 | 6 | 192 |
| 100 | 7 | 224 |
| 500 | 9 | 288 |
