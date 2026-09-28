import { getDb } from "./database";
import { PresetParamsSchema, type Preset, type PresetParams } from "../lib/tools/regexContract";

/**
 * Saved Price-regex selections, per user (regex_presets in toolsSchema.sql). Only the parameters
 * are stored — the search string is rebuilt from live prices whenever a preset is loaded.
 */

interface PresetRow {
  id: number;
  name: string;
  league: string;
  params_json: string;
  updated_at: string;
}

function describeInvalid(row: PresetRow): string | null {
  let raw: unknown;
  try {
    raw = JSON.parse(row.params_json);
  } catch (error: unknown) {
    return `stored params are not JSON: ${error instanceof Error ? error.message : String(error)}`;
  }
  const parsed = PresetParamsSchema.safeParse(raw);
  if (parsed.success) return null;
  return parsed.error.issues.map((i) => `${i.path.join(".") || "params"}: ${i.message}`).join("; ");
}

// A row that no longer parses is returned flagged rather than dropped, so the owner sees it and
// can delete it instead of wondering where their preset went.
function toPreset(row: PresetRow): Preset {
  const invalid = describeInvalid(row);
  const params = invalid === null ? PresetParamsSchema.parse(JSON.parse(row.params_json)) : null;
  return { id: row.id, name: row.name, league: row.league, params, invalid, updatedAt: row.updated_at };
}

export function listRegexPresets(userId: number): Preset[] {
  const rows = getDb()
    .prepare(
      `SELECT id, name, league, params_json, updated_at FROM regex_presets
       WHERE user_id = ? ORDER BY name COLLATE NOCASE`,
    )
    .all(userId) as PresetRow[];
  return rows.map(toPreset);
}

/** Insert or overwrite by (user, name); returns the stored preset. */
export function saveRegexPreset(userId: number, league: string, name: string, params: PresetParams): Preset {
  const row = getDb()
    .prepare(
      `INSERT INTO regex_presets (user_id, league, name, params_json) VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, name) DO UPDATE SET
         league = excluded.league, params_json = excluded.params_json, updated_at = CURRENT_TIMESTAMP
       RETURNING id, name, league, params_json, updated_at`,
    )
    .get(userId, league, name, JSON.stringify(params)) as PresetRow | undefined;
  if (!row) throw new Error(`saving regex preset "${name}" returned no row`);
  return toPreset(row);
}

/** True when the user's preset existed and was removed. */
export function deleteRegexPreset(userId: number, id: number): boolean {
  return getDb().prepare("DELETE FROM regex_presets WHERE user_id = ? AND id = ?").run(userId, id).changes > 0;
}
