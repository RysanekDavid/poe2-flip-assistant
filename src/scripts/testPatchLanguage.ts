import assert from "node:assert/strict";
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { fetchPatchHtml, PATCH_ACCEPT_LANGUAGE, type HttpFetcher } from "../sources/patchNotes/client";
import { migratePatchProvenance } from "../db/sourceMigrations";
import { insertSourceSnapshot, officialPatch, sourceSyncState } from "../db/sourceQueries";
import {
  PATCH_INDEX_URL,
  PATCH_PARSER_NAME,
  PATCH_PARSER_VERSION,
  patchSyncProblem,
  patchSyncSummary,
} from "../sources/patchNotes/contracts";
import { languageSignal } from "../sources/patchNotes/language";
import { parsePatchIndex, parsePatchThread } from "../sources/patchNotes/parser";
import { syncPatchNotes } from "../sources/patchNotes/store";
import { createProjectFixture, openPatchDb, readFixture, response, syncOptions } from "./testPatchHelpers";

const indexHtml = readFixture("index.html");
const threadHtml = readFixture("thread.html");
const germanHtml = readFixture("thread-german.html");
const NOT_ENGLISH_FORUM = /not from the English patch-notes forum/;

/** GGG localizes by forum id, so both the forum name and the body text are checked. */
export function testLanguageGuard(): void {
  assert.equal(PATCH_INDEX_URL, "https://www.pathofexile.com/forum/view-forum/2212");
  assert.throws(() => parsePatchThread(germanHtml, 4_006_365), NOT_ENGLISH_FORUM);
  const germanBodyEnglishTitle = germanHtml.replace(
    "<title>Patch-Notes - ", "<title>Early Access Patch Notes - ",
  );
  assert.throws(() => parsePatchThread(germanBodyEnglishTitle, 4_006_365), /looks non-English/);
  const frenchForum = threadHtml.replace("<title>Early Access Patch Notes", "<title>Patch notes");
  assert.throws(() => parsePatchThread(frenchForum, 3_991_000), NOT_ENGLISH_FORUM);
  const germanIndex = indexHtml.replace("<title>Early Access Patch Notes", "<title>Patch-Notes");
  assert.throws(() => parsePatchIndex(germanIndex, 3), /patch index is not from the English/);
  const dying = threadHtml.replace(
    "Resolved an ordering regression.",
    "If you die in the event league you continue in Standard.",
  );
  assert.equal(parsePatchThread(dying, 3_991_000).listItems.length, 3, "English 'die' stays English");
  console.log("PASS  language guard: German/French forum title, German body, English index");
}

/**
 * Only known realm notices without a version are skipped (and reported); every other title is
 * tracked, versionless ones under the thread-<id> identity, dates never mistaken for versions.
 */
export function testIndexNoticesAndVersions(): void {
  const page = parsePatchIndex(withIndexRows([
    [3_999_707, "Server Maintenance"],
    [3_999_800, "Early Access Launch Patch Notes"],
    [3_999_900, "Patch Notes for 2026.09.28"],
    [3_999_950, "0.5.4e Maintenance"],
  ]), 3);
  assert.deepEqual(page.skippedNotices, [3_999_707]);
  const versions = new Map(page.entries.map((entry) => [entry.threadId, entry.versionText]));
  assert.equal(versions.get(3_999_800), "thread-3999800", "a versionless real patch is still tracked");
  assert.equal(versions.get(3_999_900), "thread-3999900", "a date is not a patch version");
  assert.equal(versions.get(3_999_950), "0.5.4e", "a versioned notice is a patch post");
  for (const date of ["2026.09.28", "28.09.2026", "9.28.2026"]) {
    const dated = parsePatchIndex(withIndexRows([[3_999_990, `Hotfix ${date}`]]), 3);
    assert.equal(dated.entries.at(-1)?.versionText, "thread-3999990", date);
  }
  for (const version of ["0.5.5", "0.5.5d", "1.0.0", "3.25.1b"]) {
    const versioned = parsePatchIndex(withIndexRows([[3_999_990, `${version} Patch Notes`]]), 3);
    assert.equal(versioned.entries.at(-1)?.versionText, version);
  }
  console.log("PASS  index: realm notices skipped and counted, versionless patches kept, dates rejected");
}

/** Skipped notices reach the sync result and its log line; they never become sync targets. */
export async function testSkippedNoticesReported(): Promise<void> {
  const root = createProjectFixture();
  const db = openPatchDb();
  try {
    const result = await syncPatchNotes(syncOptions(db, root, [
      response(withIndexRows([[3_999_707, "Server Maintenance"]]), "index-1"),
      response(threadHtml, "new-1"), response(threadHtml, "base-1"),
    ]));
    assert.equal(result.ok, true);
    assert.deepEqual(result.skippedNotices, [3_999_707]);
    assert.equal(result.checkedThreads, 2, "the notice was not fetched");
    assert.equal(officialPatch(3_999_707, db), null);
    assert.equal(patchSyncSummary(result), "checked 2 thread(s), changed 2, skipped 1 realm notice(s): 3999707");
    console.log("PASS  skipped realm notices are reported in the sync result and log");
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
}

/** One-line English hotfixes are mostly links; "com" must not count against them. */
export function testLinkHeavyEnglishHotfix(): void {
  const links = threadHtml.replace(
    /<ul>[\s\S]*<\/ol>/,
    `<ul><li>Fixed a crash, see https://www.pathofexile.com/forum https://www.pathofexile.com/trade
      https://www.pathofexile.com/ladders</li></ul>`,
  );
  const parsed = parsePatchThread(links, 3_991_000);
  assert.equal(parsed.listItems.length, 1);
  assert.equal(languageSignal(parsed.bodyText).foreign, 0);
  console.log("PASS  link-heavy one-line English hotfix is English");
}

function withIndexRows(rows: Array<[number, string]>): string {
  const extra = rows.map(([threadId, title]) => `<tr><td class="thread"><div class="title">
    <a href="/forum/view-thread/${threadId}">${title}</a></div>
    <span class="post_date">Aug 27, 2026, 3:10:13 AM</span></td></tr>`).join("");
  return indexHtml.replace("</table>", `${extra}</table>`);
}

export async function testAcceptLanguageHeader(): Promise<void> {
  let sent: string | null = null;
  const fetcher: HttpFetcher = async (_input, init) => {
    sent = new Headers(init?.headers).get("accept-language");
    return response(indexHtml, "index-1");
  };
  await fetchPatchHtml(PATCH_INDEX_URL, "tests@example.invalid", { etag: null, lastModified: null }, 10_000, fetcher);
  assert.equal(sent, PATCH_ACCEPT_LANGUAGE);
  assert.match(PATCH_ACCEPT_LANGUAGE, /^en-US,en/);
  console.log("PASS  patch requests ask for English");
}

/** A German thread served by the English index is a loud per-thread failure, never stored. */
export async function testNonEnglishThreadNotStored(): Promise<void> {
  const root = createProjectFixture();
  const db = openPatchDb();
  try {
    const result = await syncPatchNotes(syncOptions(db, root, [
      response(indexHtml, "index-1"), response(germanHtml, "new-german"), response(threadHtml, "base-1"),
    ]));
    assert.deepEqual(result.failedThreads.map((failure) => failure.threadId), [3_991_000]);
    assert.match(patchSyncProblem(result) ?? "", /1 of 2 thread\(s\) failed, 1 kept: .*not from the English/);
    assert.equal(officialPatch(3_991_000, db)?.bodyValid, false);
    assert.equal(officialPatch(3_990_120, db)?.bodyValid, true);
    console.log("PASS  non-English thread is recorded as a sync problem, not stored");
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
}

/** Rows indexed from the German forum are retired on startup; English rows and snapshots stay. */
export async function testOtherForumRowsRetired(): Promise<void> {
  const root = createProjectFixture();
  const db = openPatchDb();
  try {
    await syncPatchNotes(syncOptions(db, root, [
      response(indexHtml, "index-1"), response(threadHtml, "new-1"), response(threadHtml, "base-1"),
    ]));
    const snapshotsBefore = countRows(db, "source_snapshot");
    seedGermanForumPatch(db);
    const logged = captureWarnings(() => migratePatchProvenance(db));
    assert.match(logged.join(" "), /retired 1 patch thread\(s\) indexed from a forum other than 2212/);
    assert.ok(logged.some((line) => line.includes(
      'thread 4006365 version=0.5.5c title="Patch-Notes 0.5.5c" review=no_gameplay_impact '
      + 'by owner at 2026-09-20T00:00:00.000Z: "reviewed German copy"',
    )), "the owner's review is logged so it can be re-applied");
    assert.equal(officialPatch(4_006_365, db), null, "German-forum row retired");
    assert.equal(countRows(db, "pending_patch_effect", "thread_id = 4006365"), 0);
    assert.equal(countRows(db, "evidence_link", "entity_id = '4006365'"), 0);
    assert.equal(countRows(db, "source_snapshot"), snapshotsBefore + 2, "raw snapshots are kept");
    assert.equal(officialPatch(3_991_000, db)?.bodyValid, true, "English rows untouched");
    const state = sourceSyncState("ggg_poe2_patch_notes", db);
    assert.equal(state.lastSuccessAt, null, "a German index is no proof the English one was checked");
    assert.equal(db.prepare("PRAGMA foreign_key_check").all().length, 0);
    migratePatchProvenance(db);
    assert.equal(countRows(db, "official_patch"), 3, "retirement is idempotent");
    console.log("PASS  other-forum patch rows retired, snapshots and English rows kept");
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
}

// Mirrors what a pre-2212 deployment stored: a German index snapshot owning a reviewed thread.
function seedGermanForumPatch(db: Database.Database): void {
  const base = {
    sourceId: "ggg_poe2_patch_notes", statusCode: 200, etag: "de", lastModified: null,
    artifactPath: "source-snapshots/ggg-patch-notes/de.html.gz", bytes: 10, parseError: null,
    parserName: PATCH_PARSER_NAME, parserVersion: PATCH_PARSER_VERSION,
    retrievedAt: "2026-09-20T00:00:00.000Z", valid: true,
  };
  const indexId = insertSourceSnapshot({
    ...base, kind: "index", externalId: "2222", sha256: "d".repeat(64),
    sourceUrl: "https://www.pathofexile.com/forum/view-forum/2222",
    validationPolicy: "index:min-entries=2;baseline-thread=3990574",
  }, db);
  const bodyId = insertSourceSnapshot({
    ...base, kind: "thread", externalId: "4006365", sha256: "e".repeat(64),
    sourceUrl: "https://www.pathofexile.com/forum/view-thread/4006365/filter-account-type/staff",
    validationPolicy: "thread:structured-staff-body-v1",
  }, db);
  db.prepare(`
    INSERT INTO official_patch (thread_id, source_id, source_order, title, version_text,
      published_text, source_url, index_snapshot_id, body_snapshot_id, body_valid, body_text)
    VALUES (4006365, 'ggg_poe2_patch_notes', 4006365, 'Patch-Notes 0.5.5c', '0.5.5c',
      'Sep 18, 2026', 'https://www.pathofexile.com/forum/view-thread/4006365/filter-account-type/staff',
      ?, ?, 1, 'Es wurde ein Fehler behoben')
  `).run(indexId, bodyId);
  db.prepare(`INSERT INTO pending_patch_effect (thread_id, disposition, reviewer, review_note, reviewed_at)
    VALUES (4006365, 'no_gameplay_impact', 'owner', 'reviewed German copy', '2026-09-20T00:00:00.000Z')`).run();
  db.prepare(`INSERT INTO evidence_link (snapshot_id, entity_kind, entity_id)
    VALUES (?, 'official_patch', '4006365')`).run(bodyId);
  db.prepare(`UPDATE source_sync_state SET last_valid_index_snapshot_id = ?,
    valid_index_validation_policy = 'index:min-entries=2;baseline-thread=3990574'`).run(indexId);
}

function captureWarnings(run: () => void): string[] {
  const lines: string[] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => void lines.push(args.map(String).join(" "));
  try {
    run();
  } finally {
    console.warn = original;
  }
  return lines;
}

function countRows(db: Database.Database, table: string, where = "1 = 1"): number {
  const row = db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`).get() as { n: number };
  return row.n;
}
