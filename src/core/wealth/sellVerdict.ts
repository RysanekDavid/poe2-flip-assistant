import { fmtDivOrEx } from "../../lib/format";
import type { ListingComp, PlanRow, SellVerdict } from "../../lib/wealthContract";

/**
 * Sell / list / reprice / hold for one planned stash row. Pure, and ordered so the first matching
 * rule wins:
 *  1. no market value              → unpriced (never guessed, never 0)
 *  2. 7d ≥ +HOLD_MIN_CHANGE_PCT on ≥ HOLD_MIN_VOLUME volume → hold (a rising, liquid market pays
 *     more next week than the exchange does now)
 *  3. the planner routed it to the exchange → sell-cx at the exchange mid
 *  4. your ask is > REPRICE_OVER × fair  → reprice to fair (it sits above what buyers pay)
 *  5. otherwise                    → list at fair (or keep the listing, when already near fair)
 */
export const HOLD_MIN_CHANGE_PCT = 25;
export const HOLD_MIN_VOLUME = 50;
export const REPRICE_OVER = 1.15;
export const REASON_MAX = 80;

export interface VerdictInput {
  row: PlanRow;
  /** Your per-unit ask (stash note), Div; null when not listed at a ladder price. */
  askDiv: number | null;
  /** poe.ninja 7d change % and volume; null for items without a ninja line. */
  change7d: number | null;
  volume: number | null;
  /** Trade2 comparables of your own listing, when a reprice check has run. */
  comp: ListingComp | null;
  exPerDiv: number;
}

export interface Verdict {
  verdict: SellVerdict;
  targetDiv: number | null;
  reason: string;
}

const clip = (s: string): string => (s.length <= REASON_MAX ? s : `${s.slice(0, REASON_MAX - 1)}…`);

function tradeVerdict(fairDiv: number, v: VerdictInput): Verdict {
  const d = (n: number): string => fmtDivOrEx(n, v.exPerDiv);
  const { askDiv, comp } = v;
  if (askDiv == null) return { verdict: "list", targetDiv: fairDiv, reason: `list at ${d(fairDiv)} (fair)` };
  if (askDiv > fairDiv * REPRICE_OVER) {
    const cheapest = comp?.cheapestDiv ?? null;
    const reason =
      cheapest != null
        ? `cheapest ${d(cheapest)} · yours ${d(askDiv)} → reprice to ${d(fairDiv)}`
        : `yours ${d(askDiv)} is ${Math.round((askDiv / fairDiv - 1) * 100)}% over ${d(fairDiv)} fair`;
    return { verdict: "reprice", targetDiv: fairDiv, reason };
  }
  return { verdict: "list", targetDiv: fairDiv, reason: `listed at ${d(askDiv)} — within 15% of ${d(fairDiv)} fair` };
}

export function sellVerdict(v: VerdictInput): Verdict {
  const { row } = v;
  if (row.recommended === "unpriced" || row.unitDiv == null) {
    return { verdict: "unpriced", targetDiv: null, reason: "no market price — run a reprice check" };
  }
  if (v.change7d != null && v.change7d >= HOLD_MIN_CHANGE_PCT && v.volume != null && v.volume >= HOLD_MIN_VOLUME) {
    return { verdict: "hold", targetDiv: null, reason: `+${Math.round(v.change7d)}% 7d, rising — hold` };
  }
  if (row.recommended === "cx" && row.cx != null) {
    const eta = row.cx.etaHours == null ? "" : ` · ~${row.cx.etaHours < 1 ? "<1" : Math.round(row.cx.etaHours)}h to fill`;
    return { verdict: "sell-cx", targetDiv: row.cx.midDiv, reason: clip(`${row.cx.tier} exchange at ${fmtDivOrEx(row.cx.midDiv, v.exPerDiv)}${eta}`) };
  }
  if (row.trade == null) throw new Error(`sellVerdict: ${row.name} routed to ${row.recommended} without a trade quote`);
  const out = tradeVerdict(row.trade.fairDiv, v);
  return { ...out, reason: clip(out.reason) };
}
