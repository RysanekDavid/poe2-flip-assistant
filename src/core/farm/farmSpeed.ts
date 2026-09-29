import type { BossRow, FarmKind, MechanicRow, NetBound, SpeedEntry } from "../../lib/farmContract";
import { netGroup } from "./farmBoard";

/*
 * Div/hour by the viewer's own pace, pure. A boss scales its market net per kill by kills per hour;
 * a mechanic has no market per-map value (a map's yield depends on the atlas, the build, the
 * juice), so it needs the viewer's own Div per map too. Anything missing stays null — a fabricated
 * default pace would rank a board by a number nobody measured.
 */

export interface DivPerHour {
  divPerHour: number | null;
  bound: NetBound | null;
}

const NONE: DivPerHour = { divPerHour: null, bound: null };

const validMinutes = (m: number | null): m is number => m != null && Number.isFinite(m) && m > 0;

/**
 * A boss's net per kill → Div/hour. Kills per hour is a positive factor, so the net's bound carries
 * over unchanged (a lower bound per kill is a lower bound per hour). An `unknown` net has no number
 * worth scaling: the bound survives so the cell can say "?", the value stays null.
 */
export function divPerHour(netDiv: number, netBound: NetBound, minutes: number | null): DivPerHour {
  if (!validMinutes(minutes) || !Number.isFinite(netDiv)) return NONE;
  if (netBound === "unknown") return { divPerHour: null, bound: "unknown" };
  return { divPerHour: (netDiv * 60) / minutes, bound: netBound };
}

/** A mechanic's Div/hour from the viewer's own Div per map and minutes per map; null unless both. */
export function mechanicDivPerHour(divPerRun: number | null, minutes: number | null): number | null {
  if (!validMinutes(minutes) || divPerRun == null || !Number.isFinite(divPerRun) || divPerRun < 0) return null;
  return (divPerRun * 60) / minutes;
}

export const speedKey = (kind: FarmKind, key: string): string => `${kind}:${key}`;

/** The viewer's saved paces, addressable by (kind, row key). */
export function speedIndex(speeds: readonly SpeedEntry[]): Map<string, SpeedEntry> {
  return new Map(speeds.map((s) => [speedKey(s.kind, s.key), s]));
}

export function withBossSpeed(row: BossRow, entry: SpeedEntry | undefined): BossRow {
  const minutes = entry?.minutesPerRun ?? null;
  const rate = divPerHour(row.netDiv, row.netBound, minutes);
  return { ...row, yourMinutes: minutes, divPerHour: rate.divPerHour, divPerHourBound: rate.bound };
}

export function withMechanicSpeed(row: MechanicRow, entry: SpeedEntry | undefined): MechanicRow {
  const minutes = entry?.minutesPerRun ?? null;
  const divPerRun = entry?.divPerRun ?? null;
  const rate = mechanicDivPerHour(divPerRun, minutes);
  // the viewer's own numbers are the whole input — nothing is left out, so the value is exact
  return { ...row, yourMinutes: minutes, yourDivPerRun: divPerRun, divPerHour: rate, divPerHourBound: rate == null ? null : "exact" };
}

/** Personalise an (unpersonalised) board with one viewer's paces. Row order is left untouched. */
export function applySpeeds<B extends { mechanics: MechanicRow[]; bosses: BossRow[] }>(board: B, speeds: readonly SpeedEntry[]): B {
  const index = speedIndex(speeds);
  return {
    ...board,
    mechanics: board.mechanics.map((m) => withMechanicSpeed(m, index.get(speedKey("mechanic", m.category)))),
    bosses: board.bosses.map((b) => withBossSpeed(b, index.get(speedKey("boss", b.id)))),
  };
}

/**
 * Sort rank for a Div/hour column: the same trust groups as the board's net order (farmBoard.netGroup
 * — the sign of Div/hour is the sign of the net), and rows without a Div/hour after every row with one.
 */
function divPerHourRank(r: BossRow): number {
  return r.divPerHour == null ? 3 : netGroup(r);
}

/** "Your Div/h" order: trust group first in BOTH directions (an unsure number never tops the list), then value. */
export function compareDivPerHour(a: BossRow, b: BossRow, dir: "asc" | "desc"): number {
  const byRank = divPerHourRank(a) - divPerHourRank(b);
  if (byRank !== 0 || a.divPerHour == null || b.divPerHour == null) return byRank;
  return dir === "desc" ? b.divPerHour - a.divPerHour : a.divPerHour - b.divPerHour;
}

export type BossOrder = { key: "board" } | { key: "divh"; dir: "asc" | "desc" };

/**
 * Display order of the boss table. `frozen` is the id order on screen when a pace input took focus:
 * while it is set, a save-triggered reload must not move rows under the cursor (moving a focused
 * row blurs its input and commits a half-typed value), so rows keep that order — a row that was
 * not on screen goes last — and the live sort applies again once focus leaves the inputs.
 */
export function orderBosses(rows: readonly BossRow[], order: BossOrder, frozen: readonly string[] | null): BossRow[] {
  if (frozen) {
    const pos = new Map(frozen.map((id, i) => [id, i]));
    const at = (r: BossRow): number => pos.get(r.id) ?? frozen.length;
    return [...rows].sort((a, b) => at(a) - at(b));
  }
  if (order.key === "board") return [...rows];
  const { dir } = order;
  return [...rows].sort((a, b) => compareDivPerHour(a, b, dir));
}

export type SpeedDraft = { ok: true; value: number | null } | { ok: false };

/**
 * A typed pace field: "" = cleared (null); a number in (0, max] — or [0, max] with allowZero, for a
 * dry map's Div — is valid ("7,5" reads as 7.5); anything else is invalid and must not be sent.
 */
export function parseSpeedDraft(draft: string, max: number, allowZero: boolean): SpeedDraft {
  const text = draft.trim().replace(",", ".");
  if (text === "") return { ok: true, value: null };
  const n = Number(text);
  if (!Number.isFinite(n) || n > max || n < 0 || (n === 0 && !allowZero)) return { ok: false };
  return { ok: true, value: n };
}
