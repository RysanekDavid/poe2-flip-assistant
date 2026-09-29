/*
 * Server-side reader for the strategy KB (src/data/poe2/strategies/*.json). Curated and immutable
 * for a release, so one parse per process. Any defect throws — a malformed file, an id that is not
 * its filename, a yield that is not in the entity catalog, a master node poe2db does not list —
 * because a silently skipped strategy would look like "no strategy for this mechanic".
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { entityById } from "../entities/load";
import { masterNodeHome } from "./masters";
import { farmStrategySchema, type FarmStrategy } from "./schema";

export const STRATEGIES_DIR = join(process.cwd(), "src", "data", "poe2", "strategies");

let cached: readonly FarmStrategy[] | null = null;

function parseFile(dir: string, file: string): FarmStrategy {
  const path = join(dir, file);
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`strategy ${path} is not readable JSON`, { cause: error });
  }
  const parsed = farmStrategySchema.safeParse(raw);
  if (!parsed.success) {
    const where = parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`);
    throw new Error(`strategy ${path} is malformed (${where.join("; ")})`);
  }
  const id = file.replace(/\.json$/, "");
  if (parsed.data.id !== id) throw new Error(`strategy ${path} has id "${parsed.data.id}"; it must equal the filename "${id}"`);
  return parsed.data;
}

/** Yield refs must name a real catalog row, under that row's current name. */
function checkRefs(strategy: FarmStrategy): void {
  for (const { ref } of strategy.yields) {
    const row = entityById(ref.id);
    if (!row) throw new Error(`strategy ${strategy.id}: yield "${ref.id}" is not in the entity catalog`);
    if (row.name !== ref.name) throw new Error(`strategy ${strategy.id}: yield "${ref.id}" is named "${row.name}", not "${ref.name}"`);
  }
}

function checkMaster(strategy: FarmStrategy): void {
  const { master, nodes } = strategy.atlas_master;
  if (master === "any" && nodes.length > 0) throw new Error(`strategy ${strategy.id}: "any" master cannot list nodes`);
  const names = new Set<string>();
  for (const node of nodes) {
    const home = masterNodeHome(node.name);
    if (!home || home.master !== master || home.tier !== node.tier) {
      const actual = home ? `${home.master} T${home.tier}` : "no master";
      throw new Error(`strategy ${strategy.id}: node "${node.name}" is listed as ${master} T${node.tier}; poe2db has ${actual}`);
    }
    if (names.has(node.name)) throw new Error(`strategy ${strategy.id}: node "${node.name}" listed twice`);
    names.add(node.name);
  }
}

/** Every strategy in `dir`, validated, ordered by id. Exposed with a dir for tests. */
export function readStrategies(dir: string): FarmStrategy[] {
  const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
  if (files.length === 0) throw new Error(`no strategy files in ${dir}`);
  const strategies = files.map((file) => parseFile(dir, file));
  for (const strategy of strategies) {
    checkRefs(strategy);
    checkMaster(strategy);
  }
  return strategies;
}

/** The committed strategy KB (parsed once per process; throws on any defect). */
export function loadStrategies(): readonly FarmStrategy[] {
  cached ??= readStrategies(STRATEGIES_DIR);
  return cached;
}
