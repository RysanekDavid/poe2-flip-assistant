/*
 * Wire contract for the Regex tool's "Search on trade" link: the panel sends the selected mod
 * lines (templates, not ids — trade2 is matched by text) plus the filters trade2 can express, the
 * route answers with a prefilled trade2 URL. Only /api/trade2/data is read (cached 24h); no search
 * is run, so the trade2 search budget is untouched. Anything the link cannot carry is reported by
 * name — the player must never think a trade search applies a filter it silently dropped.
 */
import { z } from "zod";
import { POOL_HEADERS, RARITIES } from "../../core/tools/regex/pools/headers";
import { POOL_TABS, type RegexPool } from "../../core/tools/regex/pools/schema";
import {
  CORRUPTED_FILTERS,
  MATCH_MODES,
  MOD_STATES,
  ValueRangeSchema,
  WAYSTONE_TIER_MAX,
  WAYSTONE_TIER_MIN,
  thresholdKey,
  type PoolTabSelection,
} from "./regexPoolContract";

/** Same bound as a selection's mod count; a mod rarely has more than two lines. */
export const TRADE_MAX_LINES = 800;
const intValue = z.number().int().min(0).max(100_000);

export const TradeLinkLineSchema = z.object({
  template: z.string().min(1).max(200),
  state: z.enum(MOD_STATES),
  min: intValue.nullable(),
  max: intValue.nullable(),
});
export type TradeLinkLine = z.infer<typeof TradeLinkLineSchema>;

const tier = z.number().int().min(WAYSTONE_TIER_MIN).max(WAYSTONE_TIER_MAX);

export const TradeLinkRequestSchema = z.object({
  tab: z.enum(POOL_TABS),
  match: z.enum(MATCH_MODES),
  lines: z.array(TradeLinkLineSchema).max(TRADE_MAX_LINES),
  tier: z.object({ min: tier, max: tier }).refine((t) => t.min <= t.max, "tier min is above max").nullable(),
  corrupted: z.enum(CORRUPTED_FILTERS),
  /** One rarity (trade2 filters exactly one); null = any. */
  rarity: z.enum(RARITIES).nullable(),
  /** One base type, e.g. a single tablet type ("Breach Tablet"); null = any. */
  baseType: z.string().min(1).max(80).nullable(),
  /** Header property ranges by header id (itemRarity, packSize, itemLevel…). */
  props: z.record(z.string().min(1).max(40), ValueRangeSchema).refine((r) => Object.keys(r).length <= 20, "too many properties"),
});
export type TradeLinkRequest = z.infer<typeof TradeLinkRequestSchema>;

export const TradeLinkResponseSchema = z.object({
  url: z.string().url(),
  league: z.string(),
  matched: z.number().int(),
  /** Selected lines/properties trade2 has no filter for — the link searches without them. */
  unmatched: z.array(z.string()),
});
export type TradeLinkResponse = z.infer<typeof TradeLinkResponseSchema>;

export interface TradeLinkPlan {
  request: TradeLinkRequest;
  /** Selection parts the request cannot express at all (shown next to "not on trade"). */
  dropped: string[];
}

function modLines(pool: RegexPool, selection: PoolTabSelection): TradeLinkLine[] {
  const seen = new Set<string>();
  const lines: TradeLinkLine[] = [];
  for (const mod of pool.mods) {
    const state = selection.mods[mod.id];
    if (!state) continue;
    mod.lines.forEach((line, i) => {
      if (seen.has(line.template)) return;
      seen.add(line.template);
      // trade2 compares a multi-number line by its average, which is not what the player typed
      const range = state === "want" && line.numeric.count === 1 ? selection.thresholds[thresholdKey(mod.id, i, 0)] : undefined;
      lines.push({ template: line.template, state, min: range?.min ?? null, max: range?.max ?? null });
    });
  }
  return lines;
}

function tabletBase(pool: RegexPool, selection: PoolTabSelection, dropped: string[]): string | null {
  if (selection.tab !== "tablet" || selection.types.length === 0) return null;
  const bases = pool.bases.filter((b) => (pool.baseBands[b] ?? []).some((band) => (selection.types as readonly string[]).includes(band)));
  if (bases.length === 1) return bases[0] ?? null;
  dropped.push(`tablet type (${bases.join(", ")}): trade2 searches one base type at a time`);
  return null;
}

/** Selection → trade request, plus the parts it cannot carry. */
export function tradeLinkRequest(pool: RegexPool, selection: PoolTabSelection): TradeLinkPlan {
  const dropped: string[] = [];
  const lines = modLines(pool, selection);
  if (lines.length > TRADE_MAX_LINES) dropped.push(...lines.splice(TRADE_MAX_LINES).map((l) => l.template));
  const rarity = selection.rarity.length === 1 ? (selection.rarity[0] ?? null) : null;
  if (selection.rarity.length > 1 && selection.rarity.length < RARITIES.length) {
    dropped.push(`rarity (${selection.rarity.join(" or ")}): trade2 filters one rarity`);
  }
  const known = new Set(POOL_HEADERS[pool.tab].map((h) => h.id));
  const props = Object.fromEntries(Object.entries(selection.props).filter(([id]) => known.has(id)));
  const request: TradeLinkRequest = {
    tab: selection.tab,
    match: selection.match,
    lines,
    tier: selection.tab === "waystone" ? selection.tier : null,
    corrupted: selection.corrupted,
    rarity,
    baseType: tabletBase(pool, selection, dropped),
    props,
  };
  return { request, dropped };
}
