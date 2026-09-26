/**
 * Discord webhook payloads, built from alert rows. Pure — no DB, no network.
 *
 * Limits enforced here (Discord rejects the whole message with a 400 otherwise): ≤10 embeds,
 * title ≤256, description ≤4096, field value ≤1024, and ≤6000 characters summed over every
 * embed's title/description/field names+values/footer. Embed `url` does not count toward 6000.
 */
import { z } from "zod";

const EmbedFieldSchema = z.object({ name: z.string(), value: z.string(), inline: z.boolean().optional() });
export type DiscordEmbedField = z.infer<typeof EmbedFieldSchema>;

/** Schema, not just a type: queued digests round-trip through notify_queue.payload_json. */
export const EmbedSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  url: z.string().optional(),
  color: z.number().int(),
  fields: z.array(EmbedFieldSchema),
  timestamp: z.string().optional(),
  footer: z.object({ text: z.string() }).optional(),
});
export type DiscordEmbed = z.infer<typeof EmbedSchema>;

export const QueuedPayloadSchema = z.object({ content: z.string(), embeds: z.array(EmbedSchema).min(1) });
export type QueuedPayload = z.infer<typeof QueuedPayloadSchema>;

export interface DiscordMessage {
  username: string;
  content?: string;
  embeds: DiscordEmbed[];
  // Item names and messages come from third-party listings: never let them ping @everyone.
  allowed_mentions: { parse: [] };
}

/** The alert columns a notification renders. */
export interface NotifyAlert {
  id: number;
  type: string;
  item_id: string;
  item_name: string | null;
  message: string;
  value: number | null;
  threshold: number | null;
  whisper: string | null;
  link: string | null;
  league: string | null;
  created_at: string;
}

export const MAX_EMBEDS = 10;
const TOTAL_BUDGET = 5800; // under Discord's 6000 so rounding in their count never bites
const BOT_NAME = "PoE2 Flip Assistant";

const COLORS: Record<string, number> = {
  SNIPE: 0xfb923c,
  CRAFT_BASE: 0xfb923c,
  RESELL: 0xfb923c,
  CRAFT_MARGIN: 0xf59e0b,
  SPREAD: 0x22c55e,
  TREND: 0xfcd34d,
  SPIKE: 0xeab308,
  LEAGUE: 0xfde68a,
};
const NEUTRAL = 0x737373;

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function fmt(n: number): string {
  return Math.abs(n) >= 100 ? n.toFixed(0) : n.toFixed(1);
}

/** SQLite CURRENT_TIMESTAMP is UTC without a zone marker. */
function isoTimestamp(createdAt: string): string | undefined {
  const d = new Date(`${createdAt.replace(" ", "T")}Z`);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

function safeLink(link: string | null): string | null {
  if (!link || !/^https:\/\//.test(link) || link.length > 2000) return null;
  return link;
}

function alertFields(a: NotifyAlert): DiscordEmbedField[] {
  const fields: DiscordEmbedField[] = [];
  if (a.value != null) {
    const vs = a.threshold != null ? ` vs threshold ${fmt(a.threshold)}` : "";
    fields.push({ name: "Value", value: `${fmt(a.value)}${vs}`, inline: true });
  }
  if (a.league) fields.push({ name: "League", value: truncate(a.league, 100), inline: true });
  if (a.whisper) {
    // A code block is one tap to copy on Discord mobile; backticks inside would close it early.
    fields.push({ name: "Whisper", value: `\`\`\`${truncate(a.whisper.replace(/`/g, "'"), 900)}\`\`\`` });
  }
  const link = safeLink(a.link);
  if (link && link.length <= 900) {
    fields.push({ name: "Trade", value: `[open on the trade site](${link.replace(/\)/g, "%29")})` });
  }
  return fields;
}

export function alertEmbed(a: NotifyAlert): DiscordEmbed {
  const embed: DiscordEmbed = {
    title: truncate(`${a.type} · ${a.item_name ?? a.item_id}`, 200),
    description: truncate(a.message, 600),
    color: COLORS[a.type] ?? NEUTRAL,
    fields: alertFields(a),
  };
  const link = safeLink(a.link);
  if (link) embed.url = link;
  const ts = isoTimestamp(a.created_at);
  if (ts) embed.timestamp = ts;
  return embed;
}

function embedChars(e: DiscordEmbed): number {
  const fields = e.fields.reduce((n, f) => n + f.name.length + f.value.length, 0);
  return e.title.length + (e.description?.length ?? 0) + fields + (e.footer?.text.length ?? 0);
}

export function messageChars(m: DiscordMessage): number {
  return m.embeds.reduce((n, e) => n + embedChars(e), 0);
}

/**
 * Shrink a batch into the 6000-char budget, least valuable text first: the Trade field (the
 * title stays a clickable link via `url`), then long descriptions, then whispers.
 */
export function fitEmbeds(embeds: DiscordEmbed[]): DiscordEmbed[] {
  let out = embeds.slice(0, MAX_EMBEDS).map((e) => ({ ...e, fields: [...e.fields] }));
  const total = (): number => out.reduce((n, e) => n + embedChars(e), 0);
  const steps: Array<(e: DiscordEmbed) => DiscordEmbed> = [
    (e) => ({ ...e, fields: e.fields.filter((f) => f.name !== "Trade") }),
    (e) => ({ ...e, description: e.description ? truncate(e.description, 160) : undefined }),
    (e) => ({ ...e, fields: e.fields.filter((f) => f.name !== "Whisper") }),
    (e) => ({ ...e, description: e.description ? truncate(e.description, 60) : undefined }),
  ];
  for (const step of steps) {
    if (total() <= TOTAL_BUDGET) break;
    out = out.map(step);
  }
  if (total() > TOTAL_BUDGET) throw new Error(`discord batch still ${total()} chars after trimming`);
  return out;
}

/** "3 new: SNIPE ×2, SPREAD ×1" — the part a phone push notification actually shows. */
function summaryLine(alerts: readonly NotifyAlert[]): string {
  const counts = new Map<string, number>();
  for (const a of alerts) counts.set(a.type, (counts.get(a.type) ?? 0) + 1);
  const parts = [...counts].map(([t, n]) => `${t} ×${n}`);
  return `${alerts.length} new alert${alerts.length === 1 ? "" : "s"}: ${parts.join(", ")}`;
}

/** One message for a burst of up to 10 alerts (one embed each). */
export function alertBatchMessage(alerts: readonly NotifyAlert[]): DiscordMessage {
  if (alerts.length === 0 || alerts.length > MAX_EMBEDS) {
    throw new Error(`alert batch must hold 1..${MAX_EMBEDS} alerts, got ${alerts.length}`);
  }
  return {
    username: BOT_NAME,
    content: summaryLine(alerts),
    embeds: fitEmbeds(alerts.map(alertEmbed)),
    allowed_mentions: { parse: [] },
  };
}

/** Wrap prebuilt embeds (digest, test ping) into a webhook payload. */
export function embedMessage(content: string, embeds: DiscordEmbed[]): DiscordMessage {
  return { username: BOT_NAME, content, embeds: fitEmbeds(embeds), allowed_mentions: { parse: [] } };
}
