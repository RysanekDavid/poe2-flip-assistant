import * as cheerio from "cheerio";
import {
  patchDocumentSchema,
  patchIndexEntrySchema,
  type PatchDocument,
  type PatchIndexEntry,
} from "./contracts";

const THREAD_PATH = /\/forum\/view-thread\/(\d+)/;

export function parsePatchIndex(html: string, minimumEntries: number): PatchIndexEntry[] {
  if (!Number.isInteger(minimumEntries) || minimumEntries < 1) {
    throw new Error("minimum patch entry count must be a positive integer");
  }
  const $ = cheerio.load(html);
  const entries: PatchIndexEntry[] = [];
  const seen = new Set<number>();
  $("td.thread div.title a[href*='/forum/view-thread/']").each((_index, element) => {
    const href = $(element).attr("href") ?? "";
    const match = THREAD_PATH.exec(href);
    if (!match?.[1]) return;
    const threadId = Number(match[1]);
    if (!Number.isSafeInteger(threadId) || seen.has(threadId)) return;
    const threadCell = $(element).closest("td.thread");
    const row = threadCell.closest("tr");
    const publishedText = cleanText(
      threadCell.find("span.post_date").first().text()
      || row.find("span.post_date").first().text(),
    );
    if (!publishedText) return;
    const title = cleanText($(element).text());
    const publishedAt = parsePublishedAt(publishedText);
    const sourceUrl = new URL(`/forum/view-thread/${threadId}/filter-account-type/staff`, "https://www.pathofexile.com").href;
    entries.push(patchIndexEntrySchema.parse({
      threadId,
      title,
      versionText: versionIdentity(title, threadId),
      publishedAt,
      publishedText,
      sourceUrl,
    }));
    seen.add(threadId);
  });
  if (entries.length < minimumEntries) {
    throw new Error(`patch index selector returned ${entries.length}; expected at least ${minimumEntries}`);
  }
  return entries;
}

export function parsePatchThread(html: string, expectedThreadId: number): PatchDocument {
  const $ = cheerio.load(html);
  const content = $("tr.staff td.content-container div.content").first();
  if (content.length !== 1) {
    throw new Error("staff patch body selector returned no content");
  }
  const title = cleanText($("h1").first().text());
  if (!title) throw new Error("patch thread title selector returned no title");
  const headings = content.find("h1, h2, h3, h4, h5, h6")
    .map((_index, element) => cleanText($(element).text()))
    .get()
    .filter(Boolean);
  const listItems = content.find("li")
    .map((_index, element) => cleanText($(element).text()))
    .get()
    .filter(Boolean);
  const bodyText = cleanText(content.text());
  if (!bodyText || (headings.length === 0 && listItems.length === 0)) {
    throw new Error("staff patch body contained no structured patch entries");
  }
  return patchDocumentSchema.parse({
    threadId: expectedThreadId,
    title,
    headings,
    listItems,
    bodyText,
  });
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function parsePublishedAt(value: string): string | null {
  const hasExplicitTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)
    || /\b(?:UTC|GMT)$/i.test(value);
  if (!hasExplicitTimezone) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

function versionIdentity(title: string, threadId: number): string {
  const match = /\b([0-9]+(?:\.[0-9]+){2,}(?:[a-z])?)\b/i.exec(title);
  return match?.[1] ?? `thread-${threadId}`;
}
