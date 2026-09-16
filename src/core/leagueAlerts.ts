import notifier from "node-notifier";
import type Database from "better-sqlite3";
import { getDb } from "../db/database";

/**
 * A league change is market-wide news, not a per-watchlist signal, so it lands in EVERY user's
 * alert feed. Repeats are prevented upstream by `league_state.alerted_league`, not by the
 * per-item cooldown alertEngine uses. Desktop notify is best-effort (headless servers have none).
 */
export function fireLeagueAlert(
  league: string,
  message: string,
  database: Database.Database = getDb(),
): number {
  const users = database.prepare("SELECT id FROM users").all() as Array<{ id: number }>;
  // The league being announced IS the league to tag the row with — no lookup, and correct even
  // when this fires on a connection whose tracked league has not been re-read yet.
  const insert = database.prepare(
    `INSERT INTO alerts (user_id, league, type, item_id, item_name, message, value, threshold)
     VALUES (?, ?, 'LEAGUE', 'league', ?, ?, NULL, NULL)`,
  );
  for (const u of users) insert.run(u.id, league, league, message);

  try {
    // Callback form: on a headless box the notify backend fails ASYNCHRONOUSLY, and without a
    // callback node-notifier would surface that as an unhandled error instead of this warning.
    notifier.notify({ title: "PoE2 Flip — LEAGUE", message, sound: true }, (err) => {
      if (err) console.warn(`desktop notify failed: ${err.message}`);
    });
  } catch (err) {
    console.warn(`desktop notify failed: ${err instanceof Error ? err.message : err}`);
  }
  return users.length;
}
