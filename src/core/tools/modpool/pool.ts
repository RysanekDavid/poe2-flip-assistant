import { tradeSearchUrl } from "../../../lib/tradeLink";
import type {
  BookMissing,
  ModLiveValue,
  ModPoolQuery,
  ModPoolResponse,
  ModPoolRow,
  PoolClassView,
} from "../../../lib/tools/modPoolContract";
import { referenceValue, type ReferenceValue } from "../../priceBook";
import type { StatIndex } from "../../statResolver";
import { comboFor, type AffixSide, type CraftCatalog } from "../craftmoves/catalog";
import { familyGates, floorsFor, type FamilyGate } from "../craftmoves/gates";
import { bookSignal, resolveTier, tierTemplate, type ObsLookup, type ResolvedTier } from "./bookSignal";
import { liveQuery } from "./liveValue";

/**
 * The mod pool of one base at one item level: every prefix/suffix family it can roll, the top tier
 * this ilvl reaches, what each verified currency floor cuts, and the market signals for items that
 * carry the mod. Pure given the stat index, the book lookup and the live cache — the tests drive it
 * without network or trade2.
 */

export class UnknownBaseError extends Error {
  constructor(itemClass: string, base: string) {
    super(`"${base}" is not a craftable ${itemClass} base in the craft catalog`);
    this.name = "UnknownBaseError";
  }
}

export class ModNotSearchableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModNotSearchableError";
  }
}

/** "[DNT] Carving Knife": RePoE keeps GGG's do-not-translate placeholder bases, which never drop. */
const PLACEHOLDER_BASE = /^\[DNT\]/i;

/** Class → its catalog bases, alphabetical: what the base picker offers. */
export function poolClasses(cat: CraftCatalog): PoolClassView[] {
  const byClass = new Map<string, PoolClassView["bases"]>();
  for (const [name, base] of Object.entries(cat.bases)) {
    if (PLACEHOLDER_BASE.test(name) || !comboFor(cat, base.itemClass, name)) continue;
    const list = byClass.get(base.itemClass) ?? [];
    list.push({ name, ambiguous: base.ambiguous });
    byClass.set(base.itemClass, list);
  }
  return [...byClass]
    .map(([itemClass, bases]) => ({ itemClass, bases: bases.sort((a, b) => a.name.localeCompare(b.name)) }))
    .sort((a, b) => a.itemClass.localeCompare(b.itemClass));
}

/** Every family the base rolls, gated at `ilvl` with the floors of currency used on `rarity`. */
export function poolGates(cat: CraftCatalog, sel: ModPoolQuery): FamilyGate[] {
  const combo = cat.bases[sel.base]?.itemClass === sel.itemClass ? comboFor(cat, sel.itemClass, sel.base) : null;
  if (!combo) throw new UnknownBaseError(sel.itemClass, sel.base);
  return familyGates(combo, cat, { itemClass: sel.itemClass, ilvl: sel.ilvl, present: new Set(), floors: floorsFor(sel.rarity) });
}

export interface PoolInputs {
  league: string;
  /** null = the trade2 stat catalog was unreachable; `bookError` says why. */
  idx: StatIndex | null;
  bookError: string | null;
  obs: ObsLookup;
  /** Fresh shared live value for a stat at a roll (min_roll key: 0 = presence-only), else null. */
  live: (statId: string, minRoll: number) => ModLiveValue | null;
  cacheHours: number;
  exaltPerDivine: number | null;
  patch: { data: string; repoe: string };
}

interface RowCtx {
  sel: ModPoolQuery;
  inputs: PoolInputs;
  baseline: ReferenceValue;
}

function missingReason(idx: StatIndex | null, resolved: ResolvedTier | null): BookMissing | null {
  if (!idx) return "unavailable";
  if (!resolved) return "unresolved";
  return resolved.bookRef == null ? "not-signed" : null;
}

function poolRow(g: FamilyGate, ctx: RowCtx): ModPoolRow {
  const top = g.topReachable;
  if (!top) return { ...g, search: null, book: null, bookMissing: "no-tier", live: null, tradeUrl: null };
  const { sel, inputs } = ctx;
  const t = tierTemplate(top.text);
  const resolved = inputs.idx ? resolveTier(t, inputs.idx) : null;
  const bookMissing = missingReason(inputs.idx, resolved);
  const book = resolved?.bookRef != null ? bookSignal(inputs.obs(resolved.bookRef), ctx.baseline, resolved.viaPseudo) : null;
  const live = resolved ? inputs.live(resolved.statId, t.minRoll ?? 0) : null;
  const query = resolved ? liveQuery({ baseType: sel.base, statId: resolved.statId, minRoll: t.minRoll, ilvl: sel.ilvl }) : null;
  return {
    ...g,
    search: { line: t.line, lines: t.lines, partial: t.partial, statId: resolved?.statId ?? null, minRoll: t.minRoll },
    book,
    bookMissing,
    live,
    tradeUrl: live?.searchUrl ?? (query ? tradeSearchUrl(inputs.league, query) : null),
  };
}

/** The whole pool response for one selection. Pure given `inputs`. */
export function assemblePool(cat: CraftCatalog, sel: ModPoolQuery, inputs: PoolInputs): ModPoolResponse {
  const gates = poolGates(cat, sel);
  // the base-wide baseline is read only when the catalog is up: without it no row has a book signal
  const baseline = referenceValue(inputs.idx ? inputs.obs(null) : []);
  const rows = gates.map((g) => poolRow(g, { sel, inputs, baseline }));
  return {
    kind: "pool",
    league: inputs.league,
    itemClass: sel.itemClass,
    base: sel.base,
    ambiguous: cat.bases[sel.base]?.ambiguous ?? false,
    ilvl: sel.ilvl,
    rarity: sel.rarity,
    rows,
    coverage: {
      families: rows.length,
      resolved: rows.filter((r) => r.search?.statId != null).length,
      withSamples: rows.filter((r) => (r.book?.samples ?? 0) > 0).length,
    },
    baseline: { valueDiv: baseline.valueDiv, samples: baseline.samples },
    bookError: inputs.bookError,
    cacheHours: inputs.cacheHours,
    exaltPerDivine: inputs.exaltPerDivine,
    patch: inputs.patch,
  };
}

/** What the live value of one family searches: its reachable top tier's stat and lowest roll. */
export function liveTargetOf(
  cat: CraftCatalog,
  sel: ModPoolQuery,
  family: string,
  side: AffixSide,
  idx: StatIndex,
): { statId: string; minRoll: number | null; line: string } {
  const gate = poolGates(cat, sel).find((g) => g.family === family && g.side === side);
  if (!gate) throw new ModNotSearchableError(`${sel.base} cannot roll the ${side} family ${family}`);
  if (!gate.topReachable) throw new ModNotSearchableError(`no ${family} tier rolls at item level ${sel.ilvl}`);
  const t = tierTemplate(gate.topReachable.text);
  const resolved = resolveTier(t, idx);
  if (!resolved) throw new ModNotSearchableError(`"${t.line}" has no trade2 stat — it cannot be searched`);
  return { statId: resolved.statId, minRoll: t.minRoll, line: t.line };
}
