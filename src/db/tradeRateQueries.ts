import { z } from "zod";
import { getDb } from "./database";
import type { RateRule, RateStore } from "../api/tradeRateLimit";

const RulesSchema = z.array(z.object({ hits: z.number(), periodSec: z.number(), restrictSec: z.number() }));

/**
 * SQLite-backed RateStore. The web process (interactive lookups) and the poller (scans) both call
 * trade2 on one account+IP budget; sharing the request log and restriction state through the DB
 * is what makes their two in-process limiters see the same truth.
 */
export function dbRateStore(): RateStore {
  const db = getDb();
  return {
    // IMMEDIATE takes the write lock up front, so check-then-record is atomic across processes
    atomically: (fn) => db.transaction(fn).immediate(),
    hits: (kind, sinceMs) =>
      (db.prepare("SELECT at_ms FROM trade_rate_hits WHERE kind = ? AND at_ms > ? ORDER BY at_ms").all(kind, sinceMs) as Array<{
        at_ms: number;
      }>).map((r) => r.at_ms),
    addHits: (kind, atMs, count) => {
      const insert = db.prepare("INSERT INTO trade_rate_hits (kind, at_ms) VALUES (?, ?)");
      for (let i = 0; i < count; i++) insert.run(kind, atMs);
    },
    policy: (kind) => {
      const row = db.prepare("SELECT rules_json, blocked_until_ms FROM trade_rate_policy WHERE kind = ?").get(kind) as
        | { rules_json: string; blocked_until_ms: number }
        | undefined;
      if (!row) return null;
      const rules: RateRule[] = RulesSchema.parse(JSON.parse(row.rules_json));
      return { rules, blockedUntil: row.blocked_until_ms };
    },
    savePolicy: (kind, rules, blockedUntil) => {
      db.prepare(
        `INSERT INTO trade_rate_policy (kind, rules_json, blocked_until_ms) VALUES (?, ?, ?)
         ON CONFLICT(kind) DO UPDATE SET rules_json = excluded.rules_json, blocked_until_ms = excluded.blocked_until_ms`,
      ).run(kind, JSON.stringify(rules), Math.round(blockedUntil));
    },
    prune: (kind, beforeMs) => {
      db.prepare("DELETE FROM trade_rate_hits WHERE kind = ? AND at_ms < ?").run(kind, beforeMs);
    },
  };
}
