/* Shared setup for the test:tools:* scripts. Run via src/scripts/runWithTestEnv.ts, which points
 * DB_PATH at a temp file. */
import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import type Database from "better-sqlite3";
import { config } from "../../config/env";
import { getDb } from "../../db/database";

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

/** Module specifier `importedBy` would use for `panel`: "../../tools/regex/RegexTool". */
function importSpecifier(importedBy: string, panel: string): string {
  const rel = relative(dirname(importedBy), panel).split(sep).join("/").replace(/\.tsx?$/, "");
  return rel.startsWith(".") ? rel : `./${rel}`;
}

/**
 * A tool panel is still wired into the app: `panelPath` (repo-relative .tsx) exports `component`,
 * and `importedBy` (the shell tab that renders it) imports that module, statically or lazily — so
 * moving or renaming a panel fails test:tools instead of silently dropping it from the UI.
 */
export function assertPanelExport(panelPath: string, component: string, importedBy: string): void {
  const panel = join(process.cwd(), panelPath);
  const host = join(process.cwd(), importedBy);
  assert.ok(existsSync(panel), `panel file missing: ${panelPath}`);
  assert.ok(existsSync(host), `importing file missing: ${importedBy}`);
  assert.match(readFileSync(panel, "utf8"), new RegExp(`export function ${component}\\b`), `${panelPath} must export ${component}`);
  const specifier = importSpecifier(host, panel);
  const source = readFileSync(host, "utf8");
  assert.ok(
    source.includes(`from "${specifier}"`) || source.includes(`import("${specifier}")`),
    `${importedBy} must import ${specifier} (the ${component} panel)`,
  );
  assert.match(source, new RegExp(`\\b${component}\\b`), `${importedBy} must reference ${component}`);
}

export function insertUser(db: Database.Database, name: string): number {
  const result = db
    .prepare("INSERT INTO users (name, password_hash, api_key, role) VALUES (?, 'x', ?, 'member')")
    .run(name, `test-key-${name}`);
  return Number(result.lastInsertRowid);
}
