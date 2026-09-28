/**
 * SQLite CURRENT_TIMESTAMP text ("YYYY-MM-DD HH:MM:SS") is UTC with no zone marker, and
 * `new Date()` would read it as LOCAL time. Client-safe (no node imports) so the panels and the db
 * layer share one parser instead of hand-rolled `.replace(" ", "T") + "Z"` copies.
 */

/** Epoch ms of a SQLite or ISO timestamp; throws on anything unparseable rather than yielding NaN. */
export function parseSqliteTimestamp(stamp: string): number {
  const normalized = /(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(stamp) ? stamp : `${stamp.replace(" ", "T")}Z`;
  const parsed = new Date(normalized).getTime();
  if (Number.isNaN(parsed)) throw new Error(`unparseable timestamp: "${stamp}"`);
  return parsed;
}

export function timestampAgeMs(stamp: string, nowMs: number = Date.now()): number {
  return nowMs - parseSqliteTimestamp(stamp);
}
