import { CX_CURRENCY_IDS } from "../../../api/cxClient";
import type { LeagueStartSignal } from "../../../lib/leagueStartContract";
import { curveRatio, itemsOnDay, type LeagueCurve } from "./curves";

/**
 * Past league starts → one signal per item for today's league day. Pure.
 *
 * Bands on the 7-day ratio: < 0.7 the item typically lost ≥ 30% within the next week → sell now;
 * 0.85–1.15 flat → hold; > 1.3 → rising. The gaps between bands are "drift": a real move, but not
 * one past leagues agree on strongly enough to act on. Fewer than two contributing leagues is
 * `unknown` — one league is an anecdote, not a curve.
 */

export const SELL_BELOW = 0.7;
export const HOLD_LOW = 0.85;
export const HOLD_HIGH = 1.15;
export const RISING_ABOVE = 1.3;
export const MIN_LEAGUES = 2;
export const HORIZON_SHORT = 7;
export const HORIZON_LONG = 14;

export function classify(ratio7: number | null, leagues: number): LeagueStartSignal {
  if (ratio7 == null || leagues < MIN_LEAGUES) return "unknown";
  if (ratio7 < SELL_BELOW) return "sell-now";
  if (ratio7 > RISING_ABOVE) return "rising";
  if (ratio7 >= HOLD_LOW && ratio7 <= HOLD_HIGH) return "hold";
  return "drift";
}

export interface ItemSignal {
  baseId: string;
  ratio7: number | null;
  ratio14: number | null;
  signal: LeagueStartSignal;
  /** Past leagues behind ratio7. */
  confidence: number;
}

/** Divine is the unit every mid is in — its "curve" is 1.0 by definition, never a signal. */
const UNIT_ID = CX_CURRENCY_IDS.divine;

/** Signals for every item past leagues recorded on `day`, unknowns included. */
export function itemSignals(curves: readonly LeagueCurve[], day: number): ItemSignal[] {
  const out: ItemSignal[] = [];
  for (const baseId of itemsOnDay(curves, day)) {
    if (baseId === UNIT_ID) continue;
    const short = curveRatio(curves, baseId, day, HORIZON_SHORT);
    const long = curveRatio(curves, baseId, day, HORIZON_LONG);
    out.push({
      baseId,
      ratio7: short.ratio,
      ratio14: long.leagues >= MIN_LEAGUES ? long.ratio : null,
      signal: classify(short.ratio, short.leagues),
      confidence: short.leagues,
    });
  }
  return out;
}

const RANK: Record<LeagueStartSignal, number> = { "sell-now": 0, rising: 1, drift: 2, hold: 3, unknown: 4 };

/** Actionable first: steepest drops, then strongest rises, then the rest; unknowns dropped. */
export function rankSignals(signals: readonly ItemSignal[]): ItemSignal[] {
  const strength = (s: ItemSignal): number => Math.abs(Math.log(s.ratio7 ?? 1));
  return signals
    .filter((s) => s.signal !== "unknown")
    .sort((a, b) => RANK[a.signal] - RANK[b.signal] || strength(b) - strength(a) || b.confidence - a.confidence);
}

/** Permanent leagues never "start"; a curve over them would be meaningless. */
export function isPermanentLeague(league: string): boolean {
  return /^(standard|hardcore)$/i.test(league.trim());
}

/** League day (0-based) at `nowHour`, or null before the league started. */
export function leagueDay(startHour: number, nowHour: number): number | null {
  if (nowHour < startHour) return null;
  return Math.floor((nowHour - startHour) / (24 * 3600));
}

/** League-start mode is on while the league is younger than the configured curve length. */
export function isModeActive(startHour: number, nowHour: number, curveDays: number): boolean {
  return nowHour >= startHour && nowHour - startHour < curveDays * 24 * 3600;
}
