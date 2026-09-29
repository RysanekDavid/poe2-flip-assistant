/*
 * Wire contract for the Regex tool's "Search on trade" link: the panel sends the selected mod
 * lines (templates, not ids — trade2 is matched by text), the route answers with a prefilled
 * trade2 URL. Only /api/trade2/data is read (cached 24h); no search is run, so the trade2 search
 * budget is untouched.
 */
import { z } from "zod";
import type { RegexPool } from "../../core/tools/regex/pools/schema";
import { POOL_TABS } from "../../core/tools/regex/pools/schema";
import {
  CORRUPTED_FILTERS,
  MATCH_MODES,
  MOD_STATES,
  WAYSTONE_TIER_MAX,
  WAYSTONE_TIER_MIN,
  thresholdKey,
  type PoolTabSelection,
} from "./regexPoolContract";

const MAX_LINES = 60;
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
  lines: z.array(TradeLinkLineSchema).max(MAX_LINES),
  tier: z.object({ min: tier, max: tier }).refine((t) => t.min <= t.max, "tier min is above max").nullable(),
  corrupted: z.enum(CORRUPTED_FILTERS),
});
export type TradeLinkRequest = z.infer<typeof TradeLinkRequestSchema>;

export const TradeLinkResponseSchema = z.object({
  url: z.string().url(),
  league: z.string(),
  matched: z.number().int(),
  /** Selected lines trade2 has no stat for — the link searches without them. */
  unmatched: z.array(z.string()),
});
export type TradeLinkResponse = z.infer<typeof TradeLinkResponseSchema>;

/**
 * Selection → request. Every line of a wanted/avoided mod goes along; a threshold is sent only
 * for single-number lines (trade2 compares a multi-number line by its average, which is not
 * what the player typed).
 */
export function tradeLinkRequest(pool: RegexPool, selection: PoolTabSelection): TradeLinkRequest {
  const seen = new Set<string>();
  const lines: TradeLinkLine[] = [];
  for (const mod of pool.mods) {
    const state = selection.mods[mod.id];
    if (!state) continue;
    mod.lines.forEach((line, i) => {
      if (seen.has(line.template) || lines.length >= MAX_LINES) return;
      seen.add(line.template);
      const range = state === "want" && line.numeric.count === 1 ? selection.thresholds[thresholdKey(mod.id, i, 0)] : undefined;
      lines.push({ template: line.template, state, min: range?.min ?? null, max: range?.max ?? null });
    });
  }
  return {
    tab: selection.tab,
    match: selection.match,
    lines,
    tier: selection.tab === "waystone" ? selection.tier : null,
    corrupted: selection.corrupted,
  };
}
