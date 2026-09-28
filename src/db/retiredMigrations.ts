import type Database from "better-sqlite3";

/** Alert types only the removed Hunt feature produced (its CRAFT_BASE / RESELL hunt modes). */
export const RETIRED_HUNT_ALERT_TYPES = ["CRAFT_BASE", "RESELL"] as const;

const HUNT_TABLES = ["hunt_hits", "hunts", "hunt_runtime"] as const;

function tableExists(conn: Database.Database, name: string): boolean {
  return conn.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name) != null;
}

/**
 * The Hunt feature is gone (snipes arrive only as alerts now). Drop its tables and everything
 * that only made sense next to them, in one transaction. IRREVERSIBLE on an existing database:
 * saved hunts and their hit history are deleted — restore from a nightly backup if needed.
 *
 * Keyed on the `hunts` table itself, so it runs exactly once: a fresh database never has it, and
 * after the drop every later boot is a single sqlite_master lookup (web + poller boot together,
 * and an unconditional DELETE sweep would be a schema-time write racing the other process).
 * Runs after ensureNotifySchema, so notify_prefs exists.
 */
export function dropRetiredHunts(conn: Database.Database): boolean {
  if (!tableExists(conn, "hunts")) return false;
  const types = RETIRED_HUNT_ALERT_TYPES.map(() => "?").join(", ");
  conn.transaction(() => {
    for (const t of HUNT_TABLES) conn.exec(`DROP TABLE IF EXISTS ${t}`);
    conn.prepare("DELETE FROM scan_request WHERE kind = 'hunts'").run();
    conn.prepare("DELETE FROM subsystem_heartbeat WHERE name = 'hunts'").run();
    // Hunt-hit alerts point at listings and searches that no longer exist; their queued Discord
    // deliveries go with them (notify_queue.alert_id cascades).
    conn.prepare(`DELETE FROM alerts WHERE type IN (${types})`).run(...RETIRED_HUNT_ALERT_TYPES);
    conn.prepare(`DELETE FROM notify_prefs WHERE type IN (${types})`).run(...RETIRED_HUNT_ALERT_TYPES);
  })();
  console.warn("[db] removed the retired Hunt tables (hunts, hunt_hits, hunt_runtime) and their alerts");
  return true;
}
