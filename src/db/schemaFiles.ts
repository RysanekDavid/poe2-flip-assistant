import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * DDL files in execution order. coachSchema.sql and toolsSchema.sql reference tables schema.sql
 * creates (`users`, `balance_snapshots`), so the order is load-bearing. All are idempotent
 * (CREATE ... IF NOT EXISTS).
 */
const SCHEMA_FILES = [
  "src/db/schema.sql",
  "src/db/coachSchema.sql",
  "src/db/opsSchema.sql",
  "src/db/toolsSchema.sql",
] as const;

/** The full application DDL, as getDb() applies it before running migrations. */
export function applicationSchemaSql(root: string = process.cwd()): string {
  return SCHEMA_FILES.map((file) => readFileSync(join(root, file), "utf8")).join("\n");
}
