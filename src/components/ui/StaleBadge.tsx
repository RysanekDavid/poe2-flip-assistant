/** Compact age for chips: 42 → "42m", 300 → "5h", 102240 → "71d". */
export function fmtAgeMin(ageMin: number): string {
  const m = Math.max(0, Math.round(ageMin));
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

interface StaleBadgeProps {
  /** Minutes since the data was fetched; null = never fetched. */
  ageMin: number | null;
  /** Past this age the badge turns amber. */
  warnAfterMin: number;
}

/**
 * Data age as a neutral chip that only turns amber past its threshold. Never red: old data is a
 * caveat to weigh, not an error — red stays reserved for losses.
 */
export function StaleBadge({ ageMin, warnAfterMin }: StaleBadgeProps) {
  if (ageMin === null) {
    return (
      <span className="rounded border border-line px-1.5 text-xs text-neutral-500" title="no data fetched yet">
        no data
      </span>
    );
  }
  const stale = ageMin > warnAfterMin;
  const age = fmtAgeMin(ageMin);
  return (
    <span
      className={`rounded border px-1.5 text-xs tabular-nums ${
        stale ? "border-amber-400/40 text-amber-300" : "border-line text-neutral-400"
      }`}
      title={stale ? `updated ${age} ago — older than ${fmtAgeMin(warnAfterMin)}, treat as stale` : `updated ${age} ago`}
    >
      {age}
    </span>
  );
}
