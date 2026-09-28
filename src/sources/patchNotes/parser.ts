import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";
import {
  patchDocumentSchema,
  patchIndexEntrySchema,
  type PatchDocument,
  type PatchIndexEntry,
} from "./contracts";
import { assertEnglishForumPage, assertEnglishText } from "./language";

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
    // The English forum also carries unversioned "Server Maintenance" notices: prose-only posts
    // that would fail body validation every run and demand a Coach review of nothing.
    const versionText = patchVersion(title);
    if (!versionText) return;
    const publishedAt = parsePublishedAt(publishedText);
    const sourceUrl = new URL(`/forum/view-thread/${threadId}/filter-account-type/staff`, "https://www.pathofexile.com").href;
    entries.push(patchIndexEntrySchema.parse({
      threadId,
      title,
      versionText,
      publishedAt,
      publishedText,
      sourceUrl,
    }));
    seen.add(threadId);
  });
  if (entries.length < minimumEntries) {
    throw new Error(`patch index selector returned ${entries.length}; expected at least ${minimumEntries}`);
  }
  // Index titles are too short for a word-frequency verdict; the forum name is decisive.
  assertEnglishForumPage($, "patch index");
  return entries;
}

export function parsePatchThread(html: string, expectedThreadId: number): PatchDocument {
  const $ = cheerio.load(html);
  const post = firstStaffPost($);
  if (!post) {
    throw new Error(
      `staff patch body selector returned no content (tried: ${STAFF_BODY_SELECTORS.join("; ")})`,
    );
  }
  const { content, title } = post;
  if (!title) throw new Error(`patch thread title selector returned no title (${post.variant} layout)`);
  // News posts embed a <style> block in the body; its CSS is not patch text.
  content.find("style, script").remove();
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
  // After the structural checks, so layout drift still reports the selectors it tried.
  assertEnglishForumPage($, `patch thread ${expectedThreadId}`);
  assertEnglishText(bodyText, `patch thread ${expectedThreadId}`);
  return patchDocumentSchema.parse({
    threadId: expectedThreadId,
    title,
    headings,
    listItems,
    bodyText,
  });
}

type Selection = ReturnType<CheerioAPI>;

interface StaffPost {
  variant: "forum-post" | "news-post";
  content: Selection;
  title: string;
}

/*
 * GGG renders patch notes in two layouts. Ordinary threads mark the post row itself as staff.
 * Threads promoted to news announcements (major content updates such as 0.5.5, thread 4000870)
 * put the body in an unmarked `tr.newsPost` row, carry the staff badge only on the following
 * `tr.newsPostInfo` row, and have no page <h1> — the title is the body's first heading.
 */
const STAFF_BODY_SELECTORS = [
  "tr.staff td.content-container div.content",
  "tr.newsPost:not(.newsPostInfo) > td > div.content with a staff badge in the next tr.newsPostInfo",
] as const;
const STAFF_POST_ROWS = "tr.staff, tr.newsPost:not(.newsPostInfo)";
const STAFF_BADGE = ".profile-link.staff, .staffText";

// Document order across both layouts, so "first staff post" means the same thing in either.
function firstStaffPost($: CheerioAPI): StaffPost | null {
  for (const element of $(STAFF_POST_ROWS).toArray()) {
    const row = $(element);
    const post = row.hasClass("staff") ? forumStaffPost($, row) : newsStaffPost(row);
    if (post) return post;
  }
  return null;
}

function forumStaffPost($: CheerioAPI, row: Selection): StaffPost | null {
  const content = row.find("td.content-container div.content").first();
  if (content.length !== 1) return null;
  return { variant: "forum-post", content, title: cleanText($("h1").first().text()) };
}

function newsStaffPost(row: Selection): StaffPost | null {
  const staffMarked = row.next("tr.newsPostInfo").find(STAFF_BADGE).length > 0;
  if (!staffMarked) return null;
  const content = row.children("td").children("div.content").first();
  if (content.length !== 1) return null;
  const title = cleanText(content.find("h1, h2").first().text());
  return { variant: "news-post", content, title };
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

function patchVersion(title: string): string | null {
  const match = /\b([0-9]+(?:\.[0-9]+){2,}(?:[a-z])?)\b/i.exec(title);
  return match?.[1] ?? null;
}
