import type Database from "better-sqlite3";
import { getDb } from "../../db/database";
import { digestCandidates, digestData, enqueueDigest, setLastDigestAt, type DigestData } from "../../db/notifyQueries";
import { truncate, type DiscordEmbed, type NotifyAlert, type QueuedPayload } from "./discordMessage";
import type { NotifyType } from "./prefs";

/**
 * Daily Discord digest: one message per user per 24 h summarising what their feed surfaced —
 * counts per type (including the types routed away from Discord, which is the point: TREND
 * noise becomes one line) and the best three snipes / craft margins / spreads by value.
 * Built from the alerts table alone, so it costs one grouped query per user per day.
 */
export const DIGEST_PERIOD_MS = 24 * 3600_000;
const TOP_TYPES: readonly NotifyType[] = ["SNIPE", "CRAFT_MARGIN", "SPREAD"];
const DIGEST_COLOR = 0xa3a3a3;

function fmt(n: number): string {
  return Math.abs(n) >= 100 ? n.toFixed(0) : n.toFixed(1);
}

function topLine(a: NotifyAlert): string {
  const name = a.item_name ?? a.item_id;
  const label = a.link && /^https:\/\//.test(a.link) && a.link.length <= 300 ? `[${name}](${a.link.replace(/\)/g, "%29")})` : name;
  const league = a.league ? ` · ${a.league}` : "";
  return truncate(`• ${label} — ${fmt(a.value ?? 0)}${league}`, 330);
}

/** Pure: digest payload for one window, or null when nothing was surfaced. */
export function digestPayload(data: DigestData, fromMs: number, toMs: number): QueuedPayload | null {
  const total = data.counts.reduce((n, c) => n + c.n, 0);
  if (total === 0) return null;
  const fields = TOP_TYPES.flatMap((type) => {
    const lines = data.top.filter((a) => a.type === type).map(topLine);
    return lines.length ? [{ name: `Top ${type}`, value: truncate(lines.join("\n"), 1000) }] : [];
  });
  const embed: DiscordEmbed = {
    title: "Daily digest — last 24 h",
    description: truncate(data.counts.map((c) => `${c.type} ${c.n}`).join(" · "), 1000),
    color: DIGEST_COLOR,
    fields,
    timestamp: new Date(toMs).toISOString(),
    footer: { text: `${total} alerts since ${new Date(fromMs).toISOString().slice(0, 16).replace("T", " ")} UTC` },
  };
  return { content: `Daily digest: ${total} alerts in the last 24 h`, embeds: [embed] };
}

/**
 * Queue a digest for every user whose 24 h window has closed. A user seen for the first time
 * only gets a baseline stamp — the first digest arrives a full day after the webhook is set,
 * instead of dumping the whole alert history into Discord.
 */
export function enqueueDueDigests(now: number, db: Database.Database = getDb()): number {
  let queued = 0;
  for (const c of digestCandidates(db)) {
    if (c.last_digest_at == null) {
      setLastDigestAt(c.user_id, now, db);
      continue;
    }
    if (now - c.last_digest_at < DIGEST_PERIOD_MS) continue;
    const payload = digestPayload(digestData(c.user_id, c.last_digest_at, now, TOP_TYPES, db), c.last_digest_at, now);
    db.transaction(() => {
      if (payload) enqueueDigest(c.user_id, JSON.stringify(payload), db);
      setLastDigestAt(c.user_id, now, db);
    })();
    if (payload) queued++;
  }
  return queued;
}
