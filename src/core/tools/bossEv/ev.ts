import type {
  BossView,
  BreakEven,
  EntryLineView,
  Jackpot,
  LootLineView,
  TierResult,
} from "../../../lib/tools/bossEvContract";
import { chaseOf, chaseOneInOf, entryVolumeOf, floorOf, losingRunOf } from "./metrics";
import type { BossArt } from "./art";
import type { PriceLookup } from "./pricing";
import type { BossLootFile, EntryLine, LootLine, PriceRef, Rate, Tier } from "./schema";

/*
 * Boss expected value, pure. The honest headline is the BREAK-EVEN drop rate, not EV: a pinnacle's
 * EV is dominated by one or two chase drops whose rates are community guesses, so the tool asks
 * "how often must the chase drop for this to pay?" and lets the player judge that against the
 * (sourced, confidence-labelled) estimate. EV is summed only over priced lines with a stated rate,
 * and a range-rated line counts at its LOW end everywhere a single number is shown (EV, net,
 * EV per Div, headline) — the high end only ever appears as the other half of a visible range.
 */

/** Probability bounds per kill; `point` is the conservative single value (a range's low end). */
export function rateBounds(rate: Rate): { point: number | null; lo: number | null; hi: number | null } {
  switch (rate.kind) {
    case "guaranteed":
      return { point: 1, lo: 1, hi: 1 };
    case "point":
      return { point: rate.p, lo: rate.p, hi: rate.p };
    case "range":
      return { point: rate.lo, lo: rate.lo, hi: rate.hi };
    case "unknown":
      return { point: null, lo: null, hi: null };
  }
}

function entryLineView(line: EntryLine, prices: PriceLookup): EntryLineView {
  const unitPrice = prices.price({ kind: "ninja", itemId: line.itemId });
  const buyDiv = unitPrice ? unitPrice.div * line.qty : null;
  const craftParts = (line.craftFrom ?? []).map((part) => ({
    itemId: part.itemId,
    name: prices.item(part.itemId)?.name ?? part.itemId,
    qty: part.qty,
    price: prices.price({ kind: "ninja", itemId: part.itemId }),
  }));
  const craftable = craftParts.length > 0 && craftParts.every((p) => p.price != null);
  const craftDiv = craftable ? line.qty * craftParts.reduce((sum, p) => sum + p.qty * (p.price?.div ?? 0), 0) : null;
  let route: EntryLineView["route"] = null;
  if (buyDiv != null && (craftDiv == null || buyDiv <= craftDiv)) route = "buy";
  else if (craftDiv != null) route = "craft";
  const item = prices.item(line.itemId);
  return {
    itemId: line.itemId,
    name: item?.name ?? line.name ?? line.itemId,
    icon: item?.icon ?? line.icon ?? null,
    qty: line.qty,
    unitPrice,
    buyDiv,
    craftDiv,
    craftParts,
    costDiv: route === "buy" ? buyDiv : route === "craft" ? craftDiv : null,
    route,
    volume: item?.volume ?? null,
  };
}

/** Why a line has no price, in the words of the market that failed to price it. */
function unpricedReason(ref: PriceRef): string {
  switch (ref.kind) {
    case "unpriced":
      return ref.reason;
    case "ninja":
      return "not listed on poe.ninja";
    case "pool":
      return "no pool member listed on poe.ninja";
    case "scout":
      // scout's 0 means "no current listing price", never "free"
      return "poe2scout has no current price";
    case "manual":
      return "no market price found";
  }
}

/** Live ninja art for an exchange line, else the curated art for its name. */
function lootIcon(line: LootLine, prices: PriceLookup, art: BossArt): string | null {
  const live = line.priceRef.kind === "ninja" ? prices.item(line.priceRef.itemId)?.icon : null;
  return live ?? art.get(line.name) ?? null;
}

function lootLineView(line: LootLine, prices: PriceLookup, art: BossArt): LootLineView {
  const price = prices.price(line.priceRef);
  const bounds = rateBounds(line.rate);
  const times = (p: number | null): number | null => (price != null && p != null ? price.div * p : null);
  return {
    name: line.name,
    icon: lootIcon(line, prices, art),
    priceKind: line.priceRef.kind,
    pool: prices.pool(line.priceRef),
    rarity: line.rarity ?? null,
    unpricedReason: price == null ? unpricedReason(line.priceRef) : null,
    price,
    rate: line.rate,
    confidence: line.confidence,
    source: line.source,
    evDiv: times(bounds.point),
    evLowDiv: times(bounds.lo),
    evHighDiv: times(bounds.hi),
    lineage: line.lineage === true,
  };
}

const sum = (values: ReadonlyArray<number | null>): number => values.reduce<number>((acc, v) => acc + (v ?? 0), 0);

/** Drops worth at least the entry: P(≥1 per kill) = 1 − Π(1 − pᵢ), assuming independent rolls. */
export function jackpotOf(loot: readonly LootLineView[], entryDiv: number): Jackpot {
  const hits = entryDiv > 0 ? loot.filter((l) => l.price != null && l.price.div >= entryDiv) : [];
  const missLo = hits.reduce((acc, l) => acc * (1 - (rateBounds(l.rate).lo ?? 0)), 1);
  const missHi = hits.reduce((acc, l) => acc * (1 - (rateBounds(l.rate).hi ?? 0)), 1);
  const p = 1 - missLo;
  return {
    items: hits.map((l) => l.name),
    p,
    pHigh: 1 - missHi,
    killsToFirst: p > 0 ? 1 / p : null,
    unknownRateCount: hits.filter((l) => l.rate.kind === "unknown").length,
  };
}

/** Per priced non-guaranteed drop, the rate at which it repays the entry; priciest (the chase) first. */
export function breakEvenOf(loot: readonly LootLineView[], entryDiv: number, guaranteedDiv: number): BreakEven[] {
  if (!(entryDiv > 0)) return [];
  const uncovered = Math.max(0, entryDiv - guaranteedDiv);
  return loot
    .flatMap((l) =>
      l.price != null && l.price.div > 0 && l.rate.kind !== "guaranteed"
        ? [{ name: l.name, priceDiv: l.price.div, pStar: entryDiv / l.price.div, pStarNet: uncovered / l.price.div, rate: l.rate, confidence: l.confidence }]
        : [],
    )
    .sort((a, b) => b.priceDiv - a.priceDiv);
}

/** One tier's full evaluation against the current prices. */
export function bossEv(tier: Tier, prices: PriceLookup, art: BossArt): TierResult {
  const entryLines = tier.entry.map((line) => entryLineView(line, prices));
  const entryDiv = sum(entryLines.map((l) => l.costDiv));
  const loot = tier.loot.map((line) => lootLineView(line, prices, art));
  const guaranteedDiv = sum(loot.map((l) => (l.rate.kind === "guaranteed" ? l.evDiv : null)));
  const evDiv = sum(loot.map((l) => l.evDiv));
  const entryComplete = entryLines.every((l) => l.costDiv != null);
  const unpriced = loot.filter((l) => l.price == null);
  const losing = losingRunOf(loot, entryDiv, guaranteedDiv, entryComplete);
  const partial: Omit<TierResult, "varianceNote"> = {
    tierId: tier.id,
    label: tier.label,
    entryDiv,
    entryComplete,
    entryLines,
    loot,
    guaranteedDiv,
    evDiv,
    evLowDiv: sum(loot.map((l) => l.evLowDiv)),
    evHighDiv: sum(loot.map((l) => l.evHighDiv)),
    netDiv: evDiv - entryDiv,
    evPerDivSpent: entryDiv > 0 ? evDiv / entryDiv : null,
    jackpot: jackpotOf(loot, entryDiv),
    breakEven: breakEvenOf(loot, entryDiv, guaranteedDiv),
    unpriced: unpriced.map((l) => l.name),
    unpricedLineage: unpriced.filter((l) => l.lineage).length,
    unknownRate: loot.filter((l) => l.rate.kind === "unknown").map((l) => l.name),
    floorDiv: floorOf(loot),
    chaseDiv: chaseOf(loot),
    chaseOneIn: chaseOneInOf(loot),
    pLosingRun: losing.p,
    losingRunUnknownRates: losing.unknownRates,
    entryVolume: entryVolumeOf(entryLines),
  };
  return { ...partial, varianceNote: varianceNote(partial) };
}

// two significant digits below 0.01 so a tiny value never prints as "0.00"
const div = (n: number): string => (Math.abs(n) >= 10 ? n.toFixed(0) : Math.abs(n) >= 0.01 || n === 0 ? n.toFixed(2) : n.toPrecision(2));

/** One-paragraph "what a typical run looks like", so a positive EV is not read as a steady income. */
export function varianceNote(result: Omit<TierResult, "varianceNote">): string {
  if (!result.entryComplete) {
    // entryDiv only sums the priced lines, so it is a floor: every ratio against it overstates.
    return "Part of the entry cost has no market price: the entry shown is a lower bound, so break-even is understated and net and EV per Div are upper bounds.";
  }
  const parts: string[] = [];
  const rareEv = sum(
    result.loot.map((l) => {
      const hi = rateBounds(l.rate).hi;
      return hi != null && hi < 0.1 ? l.evHighDiv : null;
    }),
  );
  parts.push(`Guaranteed loot ~${div(result.guaranteedDiv)} div against ${div(result.entryDiv)} div entry.`);
  const rareShare = result.evHighDiv > 0 ? rareEv / result.evHighDiv : 0;
  // Below a quarter the rare drops do not decide the outcome; saying "0% rides on…" is noise.
  if (rareShare >= 0.25) {
    parts.push(`${Math.round(rareShare * 100)}% of the priced EV rides on drops rarer than 1 in 10 — expect long losing streaks.`);
  }
  const kills = result.jackpot.killsToFirst;
  if (kills != null && result.jackpot.p < 1) {
    parts.push(
      kills < 1.5
        ? "Most kills include a drop worth the entry (assumes independent rolls)."
        : `A drop worth the entry lands about once per ${Math.round(kills)} kills (assumes independent rolls; an exclusive drop pool makes this optimistic).`,
    );
  }
  if (result.unknownRate.length > 0) parts.push(`${result.unknownRate.length} drop(s) have no known rate and are left out of EV.`);
  return parts.join(" ");
}

export function evaluateBosses(file: BossLootFile, prices: PriceLookup, art: BossArt): BossView[] {
  return file.bosses.map((boss) => {
    const tiers = boss.tiers.map((tier) => bossEv(tier, prices, art));
    return {
      id: boss.id,
      name: boss.name,
      mechanic: boss.mechanic,
      accessChain: boss.accessChain,
      icon: boss.icon ?? tiers[0]?.entryLines.find((l) => l.icon != null)?.icon ?? null,
      sources: boss.sources,
      tiers,
    };
  });
}
