import {
  itemValuesAgeHours,
  latestSnapshots,
  replaceScoutValues,
  SCOUT_LINEAGE_SOURCE,
  SCOUT_UNIQUE_SOURCE,
  scoutKeysOf,
  scoutValueMap,
  type ScoutValueSource,
} from "../db/marketQueries";
import { scoutKey } from "../lib/scoutKey";
import { fetchScout, fetchScoutLineage, fetchScoutRates, type ScoutLineageGem } from "../api/scoutClient";
import { getDefaultLeague } from "./leagueState";

/**
 * Market valuation: resolve any stash item to a Divine value, generically, so every tab
 * (currency, essence, fragment, abyss, uniques…) gets a real worth instead of relying on
 * the item's own listing price (which is often a "~price 99999 mirror" showcase sentinel).
 *
 * Two sources, both already in our DB so a scan does ZERO network calls:
 *   - poe.ninja: every currency-exchange item, valued LIVE from price_snapshots (poller-fresh)
 *   - poe2scout: priced uniques and lineage gems, cached in item_values; the poller refreshes
 *     each on its own ~6h cadence (refreshUniqueValues / refreshLineageValues)
 */
export interface ItemValue {
  div: number; // total value (unit × stack)
  source: "ninja" | "scout";
}

export interface Valuer {
  value(name: string, stackSize: number): ItemValue | null;
}

/** Build a resolver from one league's cached DB maps (no network). ninja wins over scout. */
export function buildValuer(league: string = getDefaultLeague()): Valuer {
  const ninja = new Map<string, number>();
  for (const s of latestSnapshots(league)) ninja.set(s.itemName.toLowerCase(), s.baseValue);
  // uniques and lineage gems both sit in stashes; both are poe2scout values
  const scout = scoutValueMap(league);

  return {
    value(name: string, stackSize: number): ItemValue | null {
      const key = name.toLowerCase();
      const qty = stackSize > 0 ? stackSize : 1;
      const n = ninja.get(key);
      if (n != null) return { div: n * qty, source: "ninja" };
      const u = scout.get(key);
      if (u != null) return { div: u * qty, source: "scout" };
      return null;
    },
  };
}

export const REFRESH_AFTER_H = 6;

type ValueRow = { nameKey: string; div: number; source: ScoutValueSource };

/**
 * Exalted prices → item_values rows in Divine, one per name. A 0 price is KEPT as a 0 row: it
 * records "listed by poe2scout, no current price" (readers skip value 0), distinct from "not
 * listed at all". A name listed twice keeps its higher price, so a priced listing beats a 0 one.
 */
export function scoutRows(items: ReadonlyArray<{ name: string; priceExalt: number }>, exaltPerDivine: number, source: ScoutValueSource): ValueRow[] {
  if (!(exaltPerDivine > 0)) throw new Error(`scout valuation needs a positive ex/div rate, got ${exaltPerDivine}`);
  const byKey = new Map<string, ValueRow>();
  for (const i of items) {
    if (i.priceExalt < 0) throw new Error(`poe2scout price for "${i.name}" is negative (${i.priceExalt}) — response changed shape?`);
    const row = { nameKey: i.name.toLowerCase(), div: i.priceExalt / exaltPerDivine, source };
    const prior = byKey.get(row.nameKey);
    if (!prior || row.div > prior.div) byKey.set(row.nameKey, row);
  }
  return [...byKey.values()];
}

/** Lineage gems → item_values rows (see scoutRows). */
export const lineageRows = (gems: readonly ScoutLineageGem[], exaltPerDivine: number): ValueRow[] => scoutRows(gems, exaltPerDivine, SCOUT_LINEAGE_SOURCE);

/**
 * item_values is keyed by name alone (so every name-keyed reader — stash valuation, the regex tool —
 * stays unambiguous), which means a unique and a lineage gem with the same name cannot both be
 * stored. The rows whose name another source already holds are split off (compared by scoutKey,
 * so a curly apostrophe cannot sneak past) and reported; the rest are written.
 */
export function splitCollisions(rows: readonly ValueRow[], otherKeys: ReadonlySet<string>): { keep: ValueRow[]; collided: string[] } {
  const other = new Set([...otherKeys].map(scoutKey));
  const keep = rows.filter((r) => !other.has(scoutKey(r.nameKey)));
  return { keep, collided: rows.filter((r) => other.has(scoutKey(r.nameKey))).map((r) => r.nameKey) };
}

/** One source refresh's outcome; `collided` names were skipped, not written (see splitCollisions). */
export interface RefreshResult {
  written: number;
  collided: string[];
}

/** The heartbeat `problem` for a refresh: collisions turn the row red, naming them. */
export function refreshProblem(r: RefreshResult): string | null {
  return r.collided.length > 0 ? `skipped ${r.collided.length} name(s) the other scout list holds: ${r.collided.slice(0, 5).join(", ")}` : null;
}

const fresh = (league: string, source: ScoutValueSource): boolean => {
  const age = itemValuesAgeHours(league, source);
  return age != null && age < REFRESH_AFTER_H;
};

const otherSource = (s: ScoutValueSource): ScoutValueSource => (s === SCOUT_UNIQUE_SOURCE ? SCOUT_LINEAGE_SOURCE : SCOUT_UNIQUE_SOURCE);

/** Replace-write one source's rows (stale names vanish), skipping names the other source holds. */
export function storeScoutRows(league: string, source: ScoutValueSource, rows: readonly ValueRow[]): RefreshResult {
  const { keep, collided } = splitCollisions(rows, scoutKeysOf(league, otherSource(source)));
  replaceScoutValues(league, source, keep);
  return { written: keep.length, collided };
}

const NOTHING: RefreshResult = { written: 0, collided: [] };

/** Refresh `league`'s poe2scout unique prices (≤ once per 6h); nothing written while still fresh. */
export async function refreshUniqueValues(league: string = getDefaultLeague()): Promise<RefreshResult> {
  if (fresh(league, SCOUT_UNIQUE_SOURCE)) return NOTHING;
  const { items, rates } = await fetchScout(league);
  return storeScoutRows(league, SCOUT_UNIQUE_SOURCE, scoutRows(items.filter((i) => i.name), rates.exaltPerDivine, SCOUT_UNIQUE_SOURCE));
}

/**
 * Refresh `league`'s lineage-gem prices (≤ once per 6h), on their own age: a failing lineage fetch
 * stays visibly stale instead of hiding behind a fresh uniques timestamp.
 */
export async function refreshLineageValues(league: string = getDefaultLeague()): Promise<RefreshResult> {
  if (fresh(league, SCOUT_LINEAGE_SOURCE)) return NOTHING;
  const rates = await fetchScoutRates(league);
  return storeScoutRows(league, SCOUT_LINEAGE_SOURCE, lineageRows(await fetchScoutLineage(league), rates.exaltPerDivine));
}
