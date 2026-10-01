/*
 * Server-side reader for the strategy KB (src/data/poe2/strategies/*.json). Curated and immutable
 * for a release, so one parse per process. Any defect throws — a malformed file, an id that is not
 * its filename, a ref that is not in the entity catalog, a master node poe2db does not list, a
 * conversion that cannot be priced — because a silently skipped strategy would look like "no
 * strategy for this".
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { entityById } from "../entities/load";
import { masterNodeHome } from "./masters";
import { strategyRefs, strategySchema, type Conversion, type FarmStrategy, type Strategy, type StrategyKind } from "./schema";

export const STRATEGIES_DIR = join(process.cwd(), "src", "data", "poe2", "strategies");

let cached: readonly Strategy[] | null = null;

function parseFile(dir: string, file: string): Strategy {
  const path = join(dir, file);
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`strategy ${path} is not readable JSON`, { cause: error });
  }
  const parsed = strategySchema.safeParse(raw);
  if (!parsed.success) {
    const where = parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`);
    throw new Error(`strategy ${path} is malformed (${where.join("; ")})`);
  }
  const id = file.replace(/\.json$/, "");
  if (parsed.data.id !== id) throw new Error(`strategy ${path} has id "${parsed.data.id}"; it must equal the filename "${id}"`);
  return parsed.data;
}

/** Every ref must name a real catalog row, under that row's current name. */
function checkRefs(strategy: Strategy): void {
  for (const ref of strategyRefs(strategy)) {
    const row = entityById(ref.id);
    if (!row) throw new Error(`strategy ${strategy.id}: ref "${ref.id}" is not in the entity catalog`);
    if (row.name !== ref.name) throw new Error(`strategy ${strategy.id}: ref "${ref.id}" is named "${row.name}", not "${ref.name}"`);
  }
}

/** A conversion is there to be priced: a leg that never trades on the exchange could only ever show "—". */
function checkConversions(strategy: Strategy, conversions: readonly Conversion[]): void {
  for (const conversion of conversions) {
    for (const leg of [...conversion.inputs, ...conversion.outputs]) {
      if (entityById(leg.ref.id)?.exchange_id == null) throw new Error(`strategy ${strategy.id}: conversion leg "${leg.ref.id}" is not an exchange item`);
    }
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

function checkStrategy(strategy: Strategy): void {
  checkRefs(strategy);
  switch (strategy.kind) {
    case "farm":
      checkMaster(strategy);
      return;
    case "roll_and_sell":
    case "trade":
      checkConversions(strategy, strategy.price_refs);
      return;
  }
}

/** Every strategy in `dir`, validated, ordered by id. Exposed with a dir for tests. */
export function readStrategies(dir: string): Strategy[] {
  const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
  if (files.length === 0) throw new Error(`no strategy files in ${dir}`);
  const strategies = files.map((file) => parseFile(dir, file));
  for (const strategy of strategies) checkStrategy(strategy);
  return strategies;
}

/** The committed strategy KB (parsed once per process; throws on any defect). */
export function loadStrategies(): readonly Strategy[] {
  cached ??= readStrategies(STRATEGIES_DIR);
  return cached;
}

/** The strategies of one kind, narrowed to that kind's type. */
export function strategiesOfKind<K extends StrategyKind>(strategies: readonly Strategy[], kind: K): Extract<Strategy, { kind: K }>[] {
  return strategies.filter((s): s is Extract<Strategy, { kind: K }> => s.kind === kind);
}
