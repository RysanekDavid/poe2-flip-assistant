import type Database from "better-sqlite3";
import { getDb } from "../../db/database";
import type { PatchSummary, SummaryKind } from "./summaryContract";

/** Discord embed descriptions are capped at 600 by alertEmbed; the message fits it whole. */
export const PATCH_ALERT_MAX_CHARS = 600;
export const PATCH_SUMMARY_UNAVAILABLE = "AI summary unavailable — read the official patch notes.";

// What a trader should read first when the whole summary does not fit.
const KIND_ORDER: readonly SummaryKind[] = ["economy", "crafting", "loot", "balance", "other", "bugfix"];

/**
 * Alert text: the tldr, then "• " lines — trading impact first, then bullets by kind — until the
 * budget runs out. Whole lines only, so a phone push never ends mid-word. Pure.
 */
export function patchAlertMessage(summary: PatchSummary | null): string {
  if (summary == null) return PATCH_SUMMARY_UNAVAILABLE;
  const tldr = summary.tldr.length <= PATCH_ALERT_MAX_CHARS ? summary.tldr : `${summary.tldr.slice(0, PATCH_ALERT_MAX_CHARS - 1)}…`;
  const bullets = [
    `Trading: ${summary.trading_impact}`,
    ...KIND_ORDER.flatMap((kind) => summary.groups.filter((g) => g.kind === kind).flatMap((g) => g.bullets)),
  ];
  let message = tldr;
  for (const bullet of bullets) {
    const next = `${message}\n• ${bullet}`;
    if (next.length > PATCH_ALERT_MAX_CHARS) break;
    message = next;
  }
  return message;
}

export interface PatchAlertInput {
  threadId: number;
  versionText: string;
  title: string;
  message: string;
  sourceUrl: string;
}

/**
 * A patch is game-wide news, so it lands in EVERY user's feed, with no league (it applies to all
 * of them). The link is always the stored official thread URL — never anything the model wrote.
 * Discord delivery is queued per user by the trg_alerts_notify trigger on each row.
 */
export function firePatchAlert(input: PatchAlertInput, db: Database.Database = getDb()): number {
  const users = db.prepare("SELECT id FROM users").all() as Array<{ id: number }>;
  const insert = db.prepare(`
    INSERT INTO alerts (user_id, league, type, item_id, item_name, message, value, threshold, link)
    VALUES (?, NULL, 'PATCH', ?, ?, ?, NULL, NULL, ?)
  `);
  const name = `${input.versionText} — ${input.title}`;
  for (const user of users) insert.run(user.id, `patch:${input.threadId}`, name, input.message, input.sourceUrl);
  return users.length;
}
