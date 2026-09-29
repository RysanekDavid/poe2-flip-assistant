import type { StartDayRow } from "../../../db/cxStartQueries";

/**
 * League-start price curves → "where did this item go over the next 7/14 days, the last times a
 * league was this old?". Pure.
 *
 * ratioH(item, d) = median over past leagues of mid(d+H) / mid(d). A league whose recorded days end
 * before d+H does not contribute — a "next 14 days" figure is always a real 14-day move, never a
 * shorter one clamped to the last recorded day (the backfill folds 14 days past the active window
 * so it has them). A league contributes only when both days are recorded and neither point is thin — a price seen in one sampled hour, or on a trickle of volume, is noise that one
 * dumped stack can move by 5×.
 */

/** A day point needs this many sampled hours with trades… */
export const MIN_POINT_HOURS = 3;
/** …and this much Div traded across them (units × mid), or it is thin. */
export const MIN_POINT_DIV_TRADED = 1;

export interface DayPoint {
  midDiv: number;
  volumeUnits: number;
  hours: number;
}

export interface LeagueCurve {
  league: string;
  /** Days 0..daysAvailable−1 are recorded. */
  daysAvailable: number;
  /** item → day → point. */
  points: Map<string, Map<number, DayPoint>>;
}

export interface CurveRatio {
  /** Median ratio over contributing leagues; null when none contributes. */
  ratio: number | null;
  /** Leagues that contributed — the signal's confidence. */
  leagues: number;
}

/** Stored day rows of one league as a curve. */
export function toCurve(league: string, daysAvailable: number, rows: readonly StartDayRow[]): LeagueCurve {
  const points = new Map<string, Map<number, DayPoint>>();
  for (const r of rows) {
    if (r.day >= daysAvailable) continue; // a row past the folded prefix cannot be trusted as complete
    const byDay = points.get(r.item) ?? new Map<number, DayPoint>();
    byDay.set(r.day, { midDiv: r.midDiv, volumeUnits: r.volumeUnits, hours: r.hours });
    points.set(r.item, byDay);
  }
  return { league, daysAvailable, points };
}

export function isThin(p: DayPoint): boolean {
  return p.hours < MIN_POINT_HOURS || p.volumeUnits * p.midDiv < MIN_POINT_DIV_TRADED;
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** One league's mid(d+H) / mid(d), or null when it cannot say. */
export function leagueRatio(curve: LeagueCurve, item: string, day: number, horizon: number): number | null {
  const last = curve.daysAvailable - 1;
  const target = Math.min(day + horizon, last);
  if (horizon <= 0 || target - day < horizon) return null;
  const byDay = curve.points.get(item);
  const from = byDay?.get(day);
  const to = byDay?.get(target);
  if (from == null || to == null || isThin(from) || isThin(to)) return null;
  return to.midDiv / from.midDiv;
}

/** Median ratio of an item at `day` over `horizon` days across the past leagues. */
export function curveRatio(curves: readonly LeagueCurve[], item: string, day: number, horizon: number): CurveRatio {
  const ratios = curves
    .map((c) => leagueRatio(c, item, day, horizon))
    .filter((r): r is number => r != null && Number.isFinite(r) && r > 0);
  return { ratio: median(ratios), leagues: ratios.length };
}

/** Every item any past league recorded on `day` — the candidates a signal can exist for. */
export function itemsOnDay(curves: readonly LeagueCurve[], day: number): Set<string> {
  const out = new Set<string>();
  for (const c of curves) for (const [item, byDay] of c.points) if (byDay.has(day)) out.add(item);
  return out;
}
