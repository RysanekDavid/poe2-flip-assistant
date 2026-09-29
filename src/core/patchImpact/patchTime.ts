import type { PatchTimeSource } from "../../lib/patchImpactContract";
import { parseSqliteTimestamp } from "../../lib/sqliteTime";

/**
 * The instant a patch is measured from. official_patch.published_at is only set when the forum
 * text carried an explicit zone, which GGG's index never does — real rows keep it NULL and hold
 * text like "Sep 18, 2026, 12:30:00 AM". That text is read leniently AS UTC (the result is shown
 * as "≈"); when even that fails, the watcher's first_seen_at is the best bound we have.
 */

export interface PatchTime {
  ms: number;
  source: PatchTimeSource;
  raw: string;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"] as const;

// Optional weekday, "Sep 18, 2026" or "September 18 2026", optional "12:30[:00] [AM|PM]".
const FORUM_DATE = /^(?:[a-z]+,?\s+)?([a-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})(?:,?\s+(?:at\s+)?(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?)?/i;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/;

function to24h(hour: number, meridiem: string | undefined): number | null {
  if (meridiem === undefined) return hour <= 23 ? hour : null;
  if (hour < 1 || hour > 12) return null;
  const base = hour % 12;
  return meridiem.toLowerCase() === "pm" ? base + 12 : base;
}

function utcMs(year: number, month: number, day: number, hour: number, minute: number, second: number): number | null {
  if (month < 0 || month > 11 || day < 1 || minute > 59 || second > 59) return null;
  const ms = Date.UTC(year, month, day, hour, minute, second);
  // Date.UTC rolls "Feb 31" into March; a rolled date is a misparse, not a patch time.
  return new Date(ms).getUTCDate() === day ? ms : null;
}

/** Forum date text read as UTC, or null when it does not look like a date. */
export function parseForumDateUtc(text: string): number | null {
  const trimmed = text.trim();
  const iso = ISO_DATE.exec(trimmed);
  if (iso) {
    const [, y, mo, d, h, mi, s] = iso;
    return utcMs(Number(y), Number(mo) - 1, Number(d), Number(h ?? 0), Number(mi ?? 0), Number(s ?? 0));
  }
  const m = FORUM_DATE.exec(trimmed);
  if (!m) return null;
  const [, monthText, day, year, hourText, minute, second, meridiem] = m;
  const month = (MONTHS as readonly string[]).indexOf((monthText ?? "").slice(0, 3).toLowerCase());
  const hour = hourText === undefined ? 0 : to24h(Number(hourText), meridiem);
  if (month < 0 || hour === null) return null;
  return utcMs(Number(year), month, Number(day), hour, Number(minute ?? 0), Number(second ?? 0));
}

export function patchTimeOf(row: { publishedAt: string | null; publishedText: string; firstSeenAt: string }): PatchTime {
  if (row.publishedAt !== null) {
    return { ms: parseSqliteTimestamp(row.publishedAt), source: "published_at", raw: row.publishedAt };
  }
  const fromText = parseForumDateUtc(row.publishedText);
  if (fromText !== null) return { ms: fromText, source: "published_text", raw: row.publishedText };
  return { ms: parseSqliteTimestamp(row.firstSeenAt), source: "first_seen", raw: row.firstSeenAt };
}
