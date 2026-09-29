import { modLiveValueSchema, type ModLiveValue } from "../lib/tools/modPoolContract";
import { getDb } from "./database";

/**
 * The shared mod-pool live value cache (mod_value_cache in featureMigrations.ts): one row per
 * league × base × trade stat × searched minimum roll. Shared across users on purpose — a value one
 * click paid a trade2 search for is served to everyone for the cache window, which is what keeps
 * the pool browser inside the interactive search budget.
 *
 * `min_roll` is part of the key and NOT NULL: a presence-only stat (no roll) is keyed as 0, which
 * the value route never sends as a stat minimum.
 */

export interface ModValueKey {
  league: string;
  baseType: string;
  statId: string;
  minRoll: number;
}

interface ModValueDbRow {
  stat_id: string;
  min_roll: number;
  value_div: number | null;
  min_div: number | null;
  samples: number;
  total: number;
  search_url: string | null;
  checked_at: number;
}

const COLUMNS = "stat_id, min_roll, value_div, min_div, samples, total, search_url, checked_at";

// Parsed, not cast: a row the contract no longer accepts is schema drift to fail on, not to render.
function toValue(row: ModValueDbRow): ModLiveValue {
  return modLiveValueSchema.parse({
    valueDiv: row.value_div,
    minDiv: row.min_div,
    samples: row.samples,
    total: row.total,
    searchUrl: row.search_url,
    checkedAt: row.checked_at,
  });
}

/** Cache key used by `freshModValues` — stat id plus the searched minimum. */
export const modValueMapKey = (statId: string, minRoll: number): string => `${statId}@${minRoll}`;

/** One cached value checked at or after `freshAfterMs`, else null (expired rows count as absent). */
export function getModValue(key: ModValueKey, freshAfterMs: number): ModLiveValue | null {
  const row = getDb()
    .prepare(
      `SELECT ${COLUMNS} FROM mod_value_cache
       WHERE league = ? AND base_type = ? AND stat_id = ? AND min_roll = ? AND checked_at >= ?`,
    )
    .get(key.league, key.baseType, key.statId, key.minRoll, freshAfterMs) as ModValueDbRow | undefined;
  return row ? toValue(row) : null;
}

/** Every fresh cached value for one base, keyed by modValueMapKey — the pool view spends nothing. */
export function freshModValues(league: string, baseType: string, freshAfterMs: number): Map<string, ModLiveValue> {
  const rows = getDb()
    .prepare(`SELECT ${COLUMNS} FROM mod_value_cache WHERE league = ? AND base_type = ? AND checked_at >= ?`)
    .all(league, baseType, freshAfterMs) as ModValueDbRow[];
  return new Map(rows.map((r) => [modValueMapKey(r.stat_id, r.min_roll), toValue(r)]));
}

/** Insert or replace the value one live search produced. A null value stays NULL, never 0. */
export function saveModValue(key: ModValueKey, v: ModLiveValue): void {
  getDb()
    .prepare(
      `INSERT INTO mod_value_cache (league, base_type, stat_id, min_roll, value_div, min_div, samples, total, search_url, checked_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(league, base_type, stat_id, min_roll) DO UPDATE SET
         value_div = excluded.value_div, min_div = excluded.min_div, samples = excluded.samples,
         total = excluded.total, search_url = excluded.search_url, checked_at = excluded.checked_at`,
    )
    .run(key.league, key.baseType, key.statId, key.minRoll, v.valueDiv, v.minDiv, v.samples, v.total, v.searchUrl, v.checkedAt);
}
