import { fetchTradeMeta } from "../api/tradeMeta";
import { config } from "../config/env";
import { getDefaultLeague } from "./leagueState";
import { buildStatIndex } from "./statResolver";
import { buildPlan } from "./comparableValuation";
import { extractNumbers, placeholder, type ParsedItem } from "./itemParser";
import { bookReference } from "./priceBookFeed";
import { evaluateSnipe } from "./snipeGate";

export interface ItemValuation {
  baseType: string;
  sig: string; // roll-aware price-book key (the same one hunts + autosnipe write)
  resolvedMods: number;
  askDiv: number;
  valueDiv: number | null; // trimmed-median book reference
  samples: number;
  minDiv: number | null;
  snipeUnderDiv: number | null; // ask at/below this (and above the bait floor) would flag as a snipe
  isSnipe: boolean;
  reason: string;
}

function itemFromText(baseType: string, mods: string[]): ParsedItem {
  return {
    rarity: "Rare",
    name: baseType,
    baseType,
    itemLevel: null,
    corrupted: false,
    mirrored: false,
    mods: mods.map((raw) => ({ raw, placeholdered: placeholder(raw), numbers: extractNumbers(raw), marker: "explicit" as const })),
  };
}

/**
 * Value an item from the price book and (if `askDiv` > 0) judge whether it's a snipe, through the
 * same gate the alerting engines use. A price check is hypothetical, so listing freshness is taken
 * as "now". This is the function the AI agent and the price-check UI call.
 */
export async function evaluateItem(baseType: string, mods: string[], askDiv = 0): Promise<ItemValuation> {
  const { stats } = await fetchTradeMeta();
  const plan = buildPlan(itemFromText(baseType, mods), buildStatIndex(stats));
  const ref = bookReference(getDefaultLeague(), plan.signature, null);
  const discount = config.snipe.discountPct;
  const verdict = evaluateSnipe({
    askDiv,
    refDiv: ref.valueDiv,
    samples: ref.samples,
    resolvedMods: plan.resolvedCount,
    indexed: new Date().toISOString(),
    discountPct: discount,
  });
  return {
    baseType,
    sig: plan.signature,
    resolvedMods: plan.resolvedCount,
    askDiv,
    valueDiv: ref.valueDiv,
    samples: ref.samples,
    minDiv: ref.minDiv,
    snipeUnderDiv: ref.valueDiv != null ? ref.valueDiv * (1 - discount / 100) : null,
    isSnipe: verdict.pass,
    reason: verdict.pass ? `${verdict.marginPct.toFixed(0)}% under the book reference` : verdict.detail,
  };
}
