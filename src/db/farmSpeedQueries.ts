import { speedEntrySchema, type FarmKind, type SpeedEntry, type SpeedPut } from "../lib/farmContract";
import { getDb } from "./database";

/**
 * The viewer's own clear speed per boss / mechanic (farm_user_speed in featureMigrations.ts).
 * Every statement is scoped by user_id: a pace is private, and another user's row must never leak
 * into — or be overwritten from — someone else's board.
 */

interface SpeedDbRow {
  kind: string;
  key: string;
  minutes_per_run: number;
  div_per_run: number | null;
  updated_at: number;
}

// Parsed, not cast: a row the contract no longer accepts is a schema drift to fail on, not to render.
function toEntry(row: SpeedDbRow): SpeedEntry {
  return speedEntrySchema.parse({
    kind: row.kind,
    key: row.key,
    minutesPerRun: row.minutes_per_run,
    divPerRun: row.div_per_run,
    updatedAt: row.updated_at,
  });
}

const COLUMNS = "kind, key, minutes_per_run, div_per_run, updated_at";

export function listFarmSpeeds(userId: number): SpeedEntry[] {
  const rows = getDb()
    .prepare(`SELECT ${COLUMNS} FROM farm_user_speed WHERE user_id = ? ORDER BY kind, key`)
    .all(userId) as SpeedDbRow[];
  return rows.map(toEntry);
}

/** Insert or fully replace the user's pace on one row (an omitted divPerRun stores NULL). */
export function saveFarmSpeed(userId: number, input: SpeedPut, nowMs: number): SpeedEntry {
  const row = getDb()
    .prepare(
      `INSERT INTO farm_user_speed (user_id, kind, key, minutes_per_run, div_per_run, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, kind, key) DO UPDATE SET
         minutes_per_run = excluded.minutes_per_run, div_per_run = excluded.div_per_run, updated_at = excluded.updated_at
       RETURNING ${COLUMNS}`,
    )
    .get(userId, input.kind, input.key, input.minutesPerRun, input.divPerRun ?? null, nowMs) as SpeedDbRow | undefined;
  if (!row) throw new Error(`saving farm speed ${input.kind}:${input.key} returned no row`);
  return toEntry(row);
}

/** True when the user had a pace on that row and it was removed. */
export function deleteFarmSpeed(userId: number, kind: FarmKind, key: string): boolean {
  return getDb().prepare("DELETE FROM farm_user_speed WHERE user_id = ? AND kind = ? AND key = ?").run(userId, kind, key).changes > 0;
}
