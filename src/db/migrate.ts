/** Applies schema.sql + coachSchema.sql (idempotent) and reports table state. Run: npm run db:migrate */
import { config } from "../config/env";
import { getDb } from "./database";

const db = getDb();
const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
  .all() as Array<{ name: string }>;

console.log(`DB ready at ${config.dbPath}`);
console.log("Tables:", tables.map((t) => t.name).join(", "));
