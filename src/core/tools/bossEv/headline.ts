import { fmtDivOrEx } from "../../../lib/format";
import type { TierResult } from "../../../lib/tools/bossEvContract";
import { weakest } from "./confidence";
import { rateBounds } from "./ev";
import type { Confidence, Rate } from "./schema";

/*
 * The one sentence a boss row leads with, and its colour. Pure and client-safe (no DB imports) so
 * the wording rules are unit-tested rather than living inside a React component. Tone is capped at
 * amber unless every rate that decides the verdict is `confirmed`: a green or red row built on a
 * single forum sample would read as settled fact.
 */

export type Tone = "good" | "warn" | "bad" | "neutral" | "muted";

export interface Headline {
  text: string;
  tone: Tone;
  title: string;
}

/** "1 in 40" for a per-kill probability; "every kill" at ≥1. */
export function oneIn(p: number): string {
  if (p >= 1) return "every kill";
  if (!(p > 0)) return "never";
  const n = 1 / p;
  return `1 in ${n >= 10 ? Math.round(n).toLocaleString("en-US") : n.toFixed(1)}`;
}

export function fmtRate(rate: Rate): string {
  switch (rate.kind) {
    case "guaranteed":
      return "guaranteed";
    case "point":
      return oneIn(rate.p);
    case "range":
      return `${oneIn(rate.hi)} – ${oneIn(rate.lo)}`;
    case "unknown":
      return "rate unknown";
  }
}

/** Amount in div (≥1) or ex (below); `signed` adds an explicit + for net values. */
export function fmtDiv(div: number, exPerDiv: number, signed = false): string {
  if (div === 0) return "0 div";
  const body = fmtDivOrEx(Math.abs(div), exPerDiv);
  if (div < 0) return `−${body}`;
  return signed ? `+${body}` : body;
}

/** A decisive tone survives only when the deciding rates are all confirmed. */
export function capTone(tone: Tone, deciding: readonly Confidence[]): Tone {
  if ((tone === "good" || tone === "bad") && weakest(deciding) !== "confirmed") return "warn";
  return tone;
}

/** Green when even the low estimate clears the break-even, red when the high one misses it. */
function verdictTone(rate: Rate, pStarNet: number): Tone {
  const { lo, hi } = rateBounds(rate);
  if (lo == null || hi == null) return "neutral";
  if (lo >= pStarNet) return "good";
  if (hi < pStarNet) return "bad";
  return "warn";
}

function coveredHeadline(tier: TierResult, sure: string, exPerDiv: number): Headline | null {
  if (tier.guaranteedDiv >= tier.entryDiv) {
    const deciding = tier.loot.filter((l) => l.rate.kind === "guaranteed" && (l.evDiv ?? 0) > 0).map((l) => l.confidence);
    const conf = weakest(deciding);
    return { text: `guaranteed loot covers entry · ${conf}`, tone: capTone("good", deciding), title: sure };
  }
  if (tier.evDiv >= tier.entryDiv) {
    const deciding = tier.loot.filter((l) => (l.evDiv ?? 0) > 0).map((l) => l.confidence);
    const ratio = tier.evPerDivSpent ?? 0;
    const chase = tier.breakEven[0];
    const chaseLine = chase && chase.pStarNet < 1 ? [`${chase.name} alone repays it if it drops more than ${oneIn(chase.pStarNet)}`] : [];
    return {
      text: `priced EV covers entry (${ratio.toFixed(2)}×) · ${weakest(deciding)}`,
      tone: capTone("good", deciding),
      title: [
        `priced EV ${fmtDiv(tier.evDiv, exPerDiv)} (range rates at their low end) vs entry ${fmtDiv(tier.entryDiv, exPerDiv)}`,
        "an average over many kills, not any single drop",
        ...chaseLine,
      ].join("\n"),
    };
  }
  return null;
}

/** The number to look at first: how often the chase must drop for a kill to repay its entry. */
export function breakEvenHeadline(tier: TierResult, exPerDiv: number): Headline {
  if (!tier.entryComplete) {
    return { text: "entry partly unpriced", tone: "muted", title: "at least one entry item has no market price — break-even would be understated" };
  }
  const sure = `guaranteed loot ${fmtDiv(tier.guaranteedDiv, exPerDiv)} vs entry ${fmtDiv(tier.entryDiv, exPerDiv)}`;
  if (tier.unmodelledEntry) {
    // the priced entry is only part of the cost, so any "covers the entry" verdict would overclaim
    return { text: `upper bound — entry leaves out ${tier.unmodelledEntry.label}`, tone: "muted", title: `${tier.unmodelledEntry.note}\n${sure}` };
  }
  const covered = coveredHeadline(tier, sure, exPerDiv);
  if (covered) return covered;
  const chase = tier.breakEven[0];
  if (!chase) return { text: "no priced chase drop", tone: "muted", title: sure };
  if (chase.pStarNet >= 1) {
    return {
      text: "no single drop repays the entry",
      tone: "muted",
      title: `${sure}; the priciest drop, ${chase.name} (${fmtDiv(chase.priceDiv, exPerDiv)}), would have to drop every kill or more`,
    };
  }
  const estimate = chase.rate.kind === "unknown" ? "no published rate" : `est. ${fmtRate(chase.rate)}, ${chase.confidence}`;
  return {
    text: `pays if ${chase.name} drops more than ${oneIn(chase.pStarNet)} · ${estimate}`,
    tone: capTone(verdictTone(chase.rate, chase.pStarNet), [chase.confidence]),
    title: [
      `${chase.name} ≈ ${fmtDiv(chase.priceDiv, exPerDiv)}`,
      `alone it must drop ${oneIn(chase.pStar)}; after guaranteed loot ${oneIn(chase.pStarNet)}`,
      sure,
    ].join("\n"),
  };
}
