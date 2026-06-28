/* Read-only DB size analysis. Run: DB_PATH=./data/poe2flip.db npx tsx src/scripts/analyzeDb.ts */
import Database from "better-sqlite3";
import { config } from "../config/env";

const db = new Database(config.dbPath, { readonly: true });

const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as Array<{ name: string }>).map((t) => t.name);

console.log(`DB: ${config.dbPath}\n`);
console.log("table".padEnd(24), "rows".padStart(12), "  oldest → newest (if timestamped)");
console.log("-".repeat(80));

const TIME_COL: Record<string, string> = {
  price_snapshots: "fetched_at",
  price_book_obs: "seen_at",
  alerts: "created_at",
  hunt_hits: "created_at",
  balance_snapshots: "created_at",
  trades: "traded_at",
  flips: "created_at",
};

const rows: Array<{ name: string; count: number }> = [];
for (const t of tables) {
  const count = (db.prepare(`SELECT COUNT(*) AS c FROM "${t}"`).get() as { c: number }).c;
  rows.push({ name: t, count });
}
rows.sort((a, b) => b.count - a.count);

for (const { name, count } of rows) {
  let span = "";
  const col = TIME_COL[name];
  if (col && count > 0) {
    try {
      const r = db.prepare(`SELECT MIN(${col}) AS lo, MAX(${col}) AS hi FROM "${name}"`).get() as { lo: string; hi: string };
      span = `  ${r.lo} → ${r.hi}`;
    } catch {
      /* no such column */
    }
  }
  console.log(name.padEnd(24), String(count).padStart(12), span);
}

// page-level size if dbstat is compiled in
try {
  const big = db.prepare("SELECT name, SUM(pgsize) AS bytes FROM dbstat GROUP BY name ORDER BY bytes DESC LIMIT 8").all() as Array<{ name: string; bytes: number }>;
  console.log("\nlargest objects (dbstat, bytes):");
  for (const b of big) console.log("  ", String(Math.round(b.bytes / 1024 / 1024)).padStart(5), "MB ", b.name);
} catch {
  console.log("\n(dbstat not available in this build — relying on row counts)");
}

const pageCount = (db.prepare("PRAGMA page_count").get() as { page_count: number }).page_count;
const pageSize = (db.prepare("PRAGMA page_size").get() as { page_size: number }).page_size;
const freelist = (db.prepare("PRAGMA freelist_count").get() as { freelist_count: number }).freelist_count;
console.log(`\nfile: ${Math.round((pageCount * pageSize) / 1024 / 1024)} MB · ${pageCount} pages × ${pageSize}B · freelist ${freelist} pages (${Math.round((freelist * pageSize) / 1024 / 1024)} MB reclaimable by VACUUM)`);
db.close();
