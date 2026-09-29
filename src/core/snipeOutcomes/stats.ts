import type { OutcomeState, ProfileOutcomeStats } from "../../lib/snipeOutcomeContract";

/** The slice of a tracked row the hit-rate math reads. */
export interface OutcomeStatRow {
  profile: string;
  margin_pct: number;
  check_2h: OutcomeState | null;
  check_24h: OutcomeState | null;
}

const decided = (s: OutcomeState | null): boolean => s === "listed" || s === "gone";

/** Share in percent, or null when nothing was decided — an empty denominator is not "0 %". */
function pct(part: number, whole: number): number | null {
  return whole > 0 ? (part / whole) * 100 : null;
}

export function median(xs: readonly number[]): number | null {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  const hi = s[mid];
  if (hi === undefined) return null;
  const lo = s[mid - 1];
  return s.length % 2 === 1 || lo === undefined ? hi : (lo + hi) / 2;
}

/**
 * Hit rates of one archetype. Errors leave the denominators (a failed check observed nothing);
 * a listing gone at 2 h counts as gone by 24 h too, since it is never re-checked.
 */
export function profileStats(profile: string, label: string, rows: readonly OutcomeStatRow[]): ProfileOutcomeStats {
  const checked2h = rows.filter((r) => decided(r.check_2h));
  const gone2h = checked2h.filter((r) => r.check_2h === "gone");
  const decided24h = rows.filter((r) => r.check_2h === "gone" || decided(r.check_24h));
  const gone24h = decided24h.filter((r) => r.check_2h === "gone" || r.check_24h === "gone");
  const listed24h = decided24h.filter((r) => r.check_24h === "listed");
  const errors = rows.filter((r) => r.check_2h === "error").length + rows.filter((r) => r.check_24h === "error").length;
  return {
    profile,
    label,
    n: rows.length,
    checked2h: checked2h.length,
    gone2hPct: pct(gone2h.length, checked2h.length),
    decided24h: decided24h.length,
    gone24hPct: pct(gone24h.length, decided24h.length),
    listed24hPct: pct(listed24h.length, decided24h.length),
    errors,
    medianMarginGonePct: median(gone24h.map((r) => r.margin_pct)),
    medianMarginListedPct: median(listed24h.map((r) => r.margin_pct)),
  };
}

/** Per-archetype stats, most-tracked first. Unknown profile keys (renamed archetypes) keep their key as label. */
export function outcomeStats(rows: readonly OutcomeStatRow[], labels: ReadonlyMap<string, string>): ProfileOutcomeStats[] {
  const byProfile = new Map<string, OutcomeStatRow[]>();
  for (const r of rows) {
    const list = byProfile.get(r.profile) ?? [];
    list.push(r);
    byProfile.set(r.profile, list);
  }
  return [...byProfile.entries()]
    .map(([key, list]) => profileStats(key, labels.get(key) ?? key, list))
    .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));
}

/** A row still has a checkpoint to run: 2 h unsettled, or 24 h unsettled on a listing not yet gone. */
export function isPending(r: Pick<OutcomeStatRow, "check_2h" | "check_24h">): boolean {
  return r.check_2h == null || (r.check_2h !== "gone" && r.check_24h == null);
}
