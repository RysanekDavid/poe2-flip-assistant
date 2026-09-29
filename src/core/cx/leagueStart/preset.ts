import { latestSnapshots } from "../../../db/marketQueries";
import { addWatch, getWatchlistForLeague } from "../../../db/watchlistQueries";
import type { LeagueStartPresetResponse } from "../../../lib/leagueStartContract";
import { loadLeagueStartView, sellNowPreset } from "./view";

export const PRESET_SIZE = 10;

export type PresetOutcome = { kind: "added"; body: LeagueStartPresetResponse } | { kind: "nothing"; reason: string };

/**
 * Put today's top sell-now items on one user's watchlist (their league, their rows only).
 * Already-watched items are left alone: re-adding would overwrite thresholds the user tuned.
 */
export function applySellNowPreset(userId: number, league: string, nowMs: number): PresetOutcome {
  const view = loadLeagueStartView(league, nowMs);
  if (!view.active) return { kind: "nothing", reason: view.note ?? "league-start mode is off" };
  const picks = sellNowPreset(view, PRESET_SIZE);
  if (picks.length === 0) return { kind: "nothing", reason: "no watchable sell-now item today" };
  const watched = new Set(getWatchlistForLeague(userId, league).map((w) => w.item_id));
  const categoryOf = new Map(latestSnapshots(league).map((s) => [s.itemId, s.category]));
  const added: string[] = [];
  let alreadyWatched = 0;
  for (const item of picks) {
    const itemId = item.watchItemId;
    if (itemId == null) throw new Error(`sell-now preset picked unwatchable ${item.baseId}`);
    if (watched.has(itemId)) {
      alreadyWatched++;
      continue;
    }
    const category = categoryOf.get(itemId);
    // watchItemId came from these same snapshots, so a missing category is a bug, not a skip
    if (category == null) throw new Error(`no ninja category for watchable item ${itemId}`);
    addWatch(userId, { itemId, itemName: item.name, category });
    added.push(item.name);
  }
  return { kind: "added", body: { added, alreadyWatched } };
}
