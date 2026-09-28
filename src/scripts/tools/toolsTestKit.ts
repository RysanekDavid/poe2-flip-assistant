/* Shared setup for the test:tools:* scripts. Run via src/scripts/runWithTestEnv.ts, which points
 * DB_PATH at a temp file. */
import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import type Database from "better-sqlite3";
import { config } from "../../config/env";
import { getDb } from "../../db/database";
import { TOOLS, type ToolId } from "../../components/tools/toolRegistry";

/** A fresh temp DB with the full application schema; refuses to touch a real database. */
export function freshToolsDb(): Database.Database {
  if (!/scratchpad|tmp|temp/.test(config.dbPath)) {
    throw new Error(`refusing to run against ${config.dbPath} — point DB_PATH at a temp file.`);
  }
  for (const suffix of ["", "-wal", "-shm"]) rmSync(`${config.dbPath}${suffix}`, { force: true });
  const db = getDb();
  assert.equal(db.pragma("foreign_keys", { simple: true }), 1, "getDb() must enforce foreign keys");
  return db;
}

export function columnsOf(db: Database.Database, table: string): string[] {
  const rows = db.prepare(`PRAGMA table_info("${table}")`).all() as Array<{ name: string }>;
  assert.ok(rows.length > 0, `table ${table} must exist`);
  return rows.map((r) => r.name);
}

/** The registry entry has a panel file that exports the component ToolsTab lazy-imports. */
export function assertToolPanel(id: ToolId, component: string): void {
  const meta = TOOLS.find((t) => t.id === id);
  assert.ok(meta, `tool ${id} must be registered in toolRegistry.ts`);
  const path = join(process.cwd(), "src/components/tools", `${meta.module}.tsx`);
  assert.ok(existsSync(path), `panel file for ${id} missing: ${path}`);
  assert.match(readFileSync(path, "utf8"), new RegExp(`export function ${component}\\b`), `${path} must export ${component}`);
  const tab = readFileSync(join(process.cwd(), "src/components/tools/ToolsTab.tsx"), "utf8");
  assert.ok(tab.includes(`import("./${meta.module}")`), `ToolsTab must lazy-import ./${meta.module}`);
}

export function insertUser(db: Database.Database, name: string): number {
  const result = db
    .prepare("INSERT INTO users (name, password_hash, api_key, role) VALUES (?, 'x', ?, 'member')")
    .run(name, `test-key-${name}`);
  return Number(result.lastInsertRowid);
}
