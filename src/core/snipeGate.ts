import { config } from "../config/env";

/**
 * The single decision point for "is this listing a SNIPE worth alerting". Both the hunt
 * price-book verdict and the autosnipe per-item valuation call it, so a bait listing can't slip
 * through whichever engine happens to have the weaker checks (that's how 84/109 historical
 * SNIPE alerts ended up being "0 vs ~N Div" bait).
 */
export type SnipeRejectReason =
  | "ask-not-positive"
  | "no-reference"
  | "thin-reference"
  | "too-few-mods"
  | "stale"
  | "ask-below-floor"
  | "not-discounted";

export type SnipeGateResult =
  | { pass: true; marginPct: number; valueDiv: number }
  | { pass: false; reason: SnipeRejectReason; detail: string };

export interface SnipeGateInput {
  askDiv: number; // the candidate's rated ask in Divine
  refDiv: number | null; // reference (fair) value in Divine, excluding the candidate itself
  samples: number; // comparables behind refDiv
  resolvedMods: number; // mods on the candidate that resolved to trade stat ids
  indexed: string | null; // trade2 `indexed` timestamp of the listing
  discountPct: number; // the calling engine's required discount (hunt book vs live valuation)
  nowMs?: number;
}

export interface SnipeGateLimits {
  minAskDiv: number;
  minAskFracOfValue: number;
  minResolvedMods: number;
  freshMinutes: number;
  minSamples: number;
}

/** Minutes since a trade2 `indexed` timestamp; Infinity when missing or unparseable. */
export function listingAgeMin(indexed: string | null, nowMs: number = Date.now()): number {
  if (!indexed) return Infinity;
  const t = new Date(indexed).getTime();
  return Number.isFinite(t) ? (nowMs - t) / 60_000 : Infinity;
}

/** Absolute ask floor for a reference value: max(minAskDiv, minAskFracOfValue × value). */
export function askFloorDiv(refDiv: number, limits: SnipeGateLimits = config.snipeGate): number {
  return Math.max(limits.minAskDiv, limits.minAskFracOfValue * refDiv);
}

/** Apply every snipe precondition in a fixed order; the first failure names the reason. */
export function evaluateSnipe(input: SnipeGateInput, limits: SnipeGateLimits = config.snipeGate): SnipeGateResult {
  const { askDiv, refDiv, samples, resolvedMods, indexed, discountPct } = input;
  const reject = (reason: SnipeRejectReason, detail: string): SnipeGateResult => ({ pass: false, reason, detail });

  if (!Number.isFinite(askDiv) || askDiv <= 0) return reject("ask-not-positive", `ask ${askDiv}`);
  if (refDiv == null || !Number.isFinite(refDiv) || refDiv <= 0) return reject("no-reference", "no usable reference value");
  if (samples < limits.minSamples) {
    return reject("thin-reference", `${samples} comparables, need ${limits.minSamples}`);
  }
  if (resolvedMods < limits.minResolvedMods) {
    return reject("too-few-mods", `${resolvedMods} resolved mods, need ${limits.minResolvedMods}`);
  }
  const age = listingAgeMin(indexed, input.nowMs);
  if (!(age <= limits.freshMinutes)) {
    return reject("stale", Number.isFinite(age) ? `listed ${Math.round(age)}m ago` : "listing age unknown");
  }
  const floor = askFloorDiv(refDiv, limits);
  if (askDiv < floor) return reject("ask-below-floor", `ask ${askDiv} Div under bait floor ${floor.toFixed(3)} Div`);

  const marginPct = ((refDiv - askDiv) / refDiv) * 100;
  if (marginPct < discountPct) {
    return reject("not-discounted", `${marginPct.toFixed(0)}% under value, need ${discountPct}%`);
  }
  return { pass: true, marginPct, valueDiv: refDiv };
}
