/*
 * Home's live "today" lines: one pure picker per goal card, each turning an existing API response
 * into one plain-words line, or an honest empty line. Nothing here invents a number — every figure
 * is a field the API already returns. No React and no image imports, so src/scripts/testNavIa.ts
 * pins every rule.
 */
import { z } from "zod";
import type { NetWorthSummary } from "../../lib/balanceSummaryContract";
import type { DiscoverResponse } from "../../lib/discoverContract";
import { topFlips } from "../../lib/topFlips";
import { fmtDivOrEx, fmtSmart } from "../../lib/format";
import type { OpportunitiesResponse } from "../../lib/opportunitiesContract";
import type { PatchesResponse } from "../../lib/patchesContract";
import type { StrategiesResponse, StrategyView } from "../../lib/strategiesContract";
import { changeTone, fmtChange, sortStrategies } from "../farm/strategies/strategyCards";
import { tabRouteHref } from "../shell/tabRegistry";

/** A card's live line: what it found (with an optional deep link and item art), or why there is nothing. */
export type HomePick =
  | { kind: "ok"; text: string; detail: string; href: string; art: string | null }
  | { kind: "empty"; text: string };

const pct = (n: number): string => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(1)}%`;

/** Only the fields Home reads from GET /api/craft/margins: the ranked picks and their EV. */
export const craftPicksSchema = z.object({
  /** The route reports a failed scan in the body; Home shows it as an error, never as "no picks". */
  error: z.string().optional(),
  exaltPerDivine: z.number().nullable(),
  recipes: z.array(z.object({ key: z.string(), label: z.string(), report: z.object({ evDiv: z.number() }).nullable().optional() })),
  rank: z.object({ picks: z.array(z.string()) }),
});
export type CraftPicks = z.infer<typeof craftPicksSchema>;

/** The strategy whose drops rose most this week; a flat or falling week is not a "hot" pick. */
export function hottestStrategy(data: Pick<StrategiesResponse, "strategies">): StrategyView | null {
  const top = sortStrategies(data.strategies, "hot")[0];
  return top?.trend && changeTone(top.trend.change7d) === "up" ? top : null;
}

export function pickStrategy(data: Pick<StrategiesResponse, "strategies">, art: (s: StrategyView) => string | null): HomePick {
  const top = hottestStrategy(data);
  if (!top?.trend) return { kind: "empty", text: "No strategy's drops rose in price this week — pick one by budget instead." };
  const params = new URLSearchParams({ tab: "farm", tool: "strategies", strategy: top.id });
  return { kind: "ok", text: top.title, detail: `drops ${fmtChange(top.trend.change7d)} in price this week`, href: `?${params.toString()}`, art: art(top) };
}

/** The best-scoring exchange flip that passed the rank gate and is not in a falling market. */
export function pickFlip(data: Pick<DiscoverResponse, "candidates" | "note">): HomePick {
  // the Flips page's first top card, by the same rule
  const top = topFlips(data.candidates, 1)[0];
  // the API's own `note` is operator wording ("poll first"); a player gets the plain reason
  if (!top && data.note !== undefined) return { kind: "empty", text: "Exchange rates are not loaded yet, so there is no flip to rank — check back soon." };
  if (!top) return { kind: "empty", text: "No exchange flip clears the safety bar right now." };
  return {
    kind: "ok",
    text: top.item,
    // null persistence is unknown, never 0: leave the fragment out rather than print a number
    detail: `net edge ${pct(top.edgePct)}${top.persistence6 === null ? "" : ` · held ${top.persistence6}/6 h`}`,
    href: tabRouteHref({ tab: "flips", tool: null }),
    art: top.icon,
  };
}

/** A fresh snipe beats a rising unique: it is under value now, the other is a trend. */
export function pickOpportunity(data: Pick<OpportunitiesResponse, "snipes" | "rising">): HomePick {
  const href = tabRouteHref({ tab: "trade", tool: "opportunities" });
  const snipe = data.snipes.cards[0];
  if (snipe) {
    const { card } = snipe;
    const detail = `listed ${fmtDivOrEx(card.priceDiv, card.exaltPerDivine)} · worth ${fmtDivOrEx(card.valueDiv, card.exaltPerDivine)}`;
    return { kind: "ok", text: `Under value: ${card.name}`, detail, href, art: card.icon };
  }
  const rising = data.rising.status === "ok" ? data.rising.items[0] : undefined;
  if (rising) {
    const detail = `price ${pct(rising.priceChangePct)} · listings ${rising.listedThen} → ${rising.listedNow}`;
    return { kind: "ok", text: `Rising: ${rising.name}`, detail, href, art: rising.icon };
  }
  return { kind: "empty", text: "Nothing under value or rising on the trade site right now." };
}

export function pickPatch(data: Pick<PatchesResponse, "patches">): HomePick {
  const latest = data.patches[0];
  if (!latest) return { kind: "empty", text: "No patch notes stored yet." };
  const detail = latest.publishedText === "" ? "latest patch notes" : `latest patch · ${latest.publishedText}`;
  return { kind: "ok", text: latest.title, detail, href: tabRouteHref({ tab: "learn", tool: "patches" }), art: null };
}

export function pickNetWorth(data: NetWorthSummary): HomePick {
  if (data.netWorthDiv === null) return { kind: "empty", text: "No stash read yet — Read stash once to see what you own." };
  const change = data.change24hPct === null ? "" : ` · ${pct(data.change24hPct)} in 24 h`;
  return { kind: "ok", text: `Net worth ${fmtSmart(data.netWorthDiv)} Div`, detail: `from your last stash read${change}`, href: tabRouteHref({ tab: "stash", tool: "worth" }), art: null };
}

/** The top recipe craftRank already picked (gate-passing, positive EV); none → say so. */
export function pickCraft(data: CraftPicks): HomePick {
  if (data.error !== undefined) throw new Error(`craft data: ${data.error}`);
  const byKey = new Map(data.recipes.map((r) => [r.key, r]));
  const top = data.rank.picks.map((k) => byKey.get(k)).find((r) => r?.report != null);
  if (!top?.report) return { kind: "empty", text: "No recipe pays at today's prices — the closest ones are on the page." };
  // no rate → fmtDivOrEx keeps the amount in div rather than guessing an exalted figure
  const ev = fmtDivOrEx(top.report.evDiv, data.exaltPerDivine ?? 0);
  return { kind: "ok", text: top.label, detail: `modelled +${ev} per attempt`, href: tabRouteHref({ tab: "craft", tool: "recipes" }), art: null };
}
