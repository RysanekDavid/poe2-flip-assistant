/*
 * Regex selection → prefilled trade2 search URL. Mod lines are matched to trade2 stat ids by text
 * (our templates and trade2's both print numbers as "#"); lines trade2 has no stat for are
 * reported, never dropped silently. Pure: the route passes in the cached /api/trade2/data stats.
 */
import type { StatOption } from "../../../api/tradeMeta";
import { buildTradeQuery } from "../../../lib/tradeLink";
import type { TradeLinkLine, TradeLinkRequest } from "../../../lib/tools/regexTradeContract";
import type { PoolTab } from "./pools/schema";

const TRADE2_SEARCH = "https://www.pathofexile.com/trade2/search/poe2";

/*
 * trade2 category option ids, read once from https://www.pathofexile.com/api/trade2/data/filters
 * (type_filters → category) on 2026-09-29 and pinned: they change only with a trade-site rework,
 * and fetching them per request would spend a call for a constant.
 */
export const TRADE_CATEGORY: Readonly<Record<PoolTab, string>> = {
  waystone: "map.waystone",
  tablet: "map.tablet",
  relic: "sanctum.relic",
  jewel: "jewel",
};

// Explicit first: a waystone/jewel line also exists as an implicit or rune stat with the same text.
const GROUP_RANK = ["explicit", "implicit", "pseudo", "rune"];

/** Lowercased and whitespace-collapsed; signs stay, because "+#%" and "-#%" lines are different stats. */
export const statTextKey = (text: string): string => text.toLowerCase().replace(/\s+/g, " ").trim();

export function indexStats(stats: readonly StatOption[]): Map<string, StatOption> {
  const byText = new Map<string, StatOption>();
  const rank = (s: StatOption): number => {
    const i = GROUP_RANK.indexOf(s.group);
    return i === -1 ? GROUP_RANK.length : i;
  };
  for (const s of stats) {
    const key = statTextKey(s.text);
    const prev = byText.get(key);
    if (!prev || rank(s) < rank(prev)) byText.set(key, s);
  }
  return byText;
}

interface StatFilterJson {
  id: string;
  value?: { min?: number; max?: number };
}

const filterOf = (id: string, line: TradeLinkLine): StatFilterJson => {
  const value = { ...(line.min !== null ? { min: line.min } : {}), ...(line.max !== null ? { max: line.max } : {}) };
  return Object.keys(value).length > 0 ? { id, value } : { id };
};

function statGroups(req: TradeLinkRequest, want: StatFilterJson[], avoid: StatFilterJson[]): unknown[] {
  const groups: unknown[] = [];
  if (want.length > 0) {
    // "any" = at least one of the wanted mods, which trade2 spells as a count group with min 1
    groups.push(req.match === "all" ? { type: "and", filters: want } : { type: "count", filters: want, value: { min: 1 } });
  }
  if (avoid.length > 0) groups.push({ type: "not", filters: avoid });
  return groups;
}

export interface RegexTradeLink {
  url: string;
  matched: number;
  unmatched: string[];
}

/** Builds the trade2 URL for a request against the given trade2 stat list. */
export function buildRegexTradeLink(stats: ReadonlyMap<string, StatOption>, league: string, req: TradeLinkRequest): RegexTradeLink {
  const want: StatFilterJson[] = [];
  const avoid: StatFilterJson[] = [];
  const unmatched: string[] = [];
  for (const line of req.lines) {
    const stat = stats.get(statTextKey(line.template));
    if (!stat) {
      unmatched.push(line.template);
      continue;
    }
    (line.state === "want" ? want : avoid).push(filterOf(stat.id, line));
  }
  const corrupted = req.corrupted === "any" ? undefined : req.corrupted === "only";
  const query = buildTradeQuery({ category: TRADE_CATEGORY[req.tab], corrupted });
  if (req.tier) {
    // map_filters is outside TradeQuery; id "map_tier" from the same data/filters read as TRADE_CATEGORY
    const filters = (query.filters ?? {}) as Record<string, unknown>;
    query.filters = { ...filters, map_filters: { filters: { map_tier: { min: req.tier.min, max: req.tier.max } } } };
  }
  query.stats = statGroups(req, want, avoid);
  const payload = { query, sort: { price: "asc" } };
  const url = `${TRADE2_SEARCH}/${encodeURIComponent(league)}?q=${encodeURIComponent(JSON.stringify(payload))}`;
  return { url, matched: want.length + avoid.length, unmatched };
}
