import type Database from "better-sqlite3";
import { getDb } from "../db/database";

/** item_id of league-change alerts; they are de-duplicated upstream, so never guarded here. */
const LEAGUE_CHANGE_ITEM_ID = "league";

function leagueAlertExists(itemId: string, database: Database.Database): boolean {
  return database.prepare("SELECT 1 FROM alerts WHERE type = 'LEAGUE' AND item_id = ? LIMIT 1").get(itemId) != null;
}

/**
 * A league change is market-wide news, not a per-watchlist signal, so it lands in EVERY user's
 * alert feed. League-change repeats are prevented upstream by `league_state.alerted_league`, not
 * by the re-fire gate alertEngine uses. Popups come from each user's browser, per their prefs.
 *
 * A caller-chosen `itemId` makes the alert a one-shot: if any LEAGUE alert already carries that
 * id it does not fire again (league-start sends one per league-day as "league-start:<league>:<day>").
 * Returns the number of rows inserted — 0 when the one-shot already fired.
 */
export function fireLeagueAlert(
  league: string,
  message: string,
  database: Database.Database = getDb(),
  itemId: string = LEAGUE_CHANGE_ITEM_ID,
): number {
  if (itemId !== LEAGUE_CHANGE_ITEM_ID && leagueAlertExists(itemId, database)) return 0;
  const users = database.prepare("SELECT id FROM users").all() as Array<{ id: number }>;
  // The league being announced IS the league to tag the row with — no lookup, and correct even
  // when this fires on a connection whose tracked league has not been re-read yet.
  const insert = database.prepare(
    `INSERT INTO alerts (user_id, league, type, item_id, item_name, message, value, threshold)
     VALUES (?, ?, 'LEAGUE', ?, ?, ?, NULL, NULL)`,
  );
  // Discord delivery is queued by the trg_alerts_notify trigger on each of these rows.
  database.transaction(() => {
    for (const u of users) insert.run(u.id, league, itemId, league, message);
  })();

  return users.length;
}
