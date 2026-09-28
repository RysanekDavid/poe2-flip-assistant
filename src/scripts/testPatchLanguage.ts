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
} from "../sources/patchNotes/contracts";
import { parsePatchIndex, parsePatchThread } from "../sources/patchNotes/parser";
import { syncPatchNotes } from "../sources/patchNotes/store";
import { createProjectFixture, readFixture, response, syncOptions } from "./testPatchHelpers";

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

/** The English forum lists prose-only "Server Maintenance" notices next to the patches. */
export function testUnversionedNoticesSkipped(): void {
  const withNotice = indexHtml.replace(
    "</table>",
    `<tr><td class="thread"><div class="title"><a href="/forum/view-thread/3999707">Server Maintenance</a></div>
      <span class="post_date">Aug 27, 2026, 3:10:13 AM</span></td></tr></table>`,
  );
  const entries = parsePatchIndex(withNotice, 3);
  assert.deepEqual(entries.map((entry) => entry.threadId), [3_991_000, 3_990_120, 3_980_000]);
  const versioned = withNotice.replace(">Server Maintenance<", ">0.5.4e Maintenance<");
  assert.equal(parsePatchIndex(versioned, 3).at(-1)?.versionText, "0.5.4e");
  console.log("PASS  unversioned forum notices are not tracked as patches");
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
    migratePatchProvenance(db);
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

function openPatchDb(): Database.Database {
  const db = new Database(":memory:");
  db.exec(readFileSync(join(process.cwd(), "src/db/schema.sql"), "utf8"));
  migratePatchProvenance(db);
  return db;
}

function countRows(db: Database.Database, table: string, where = "1 = 1"): number {
  const row = db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`).get() as { n: number };
  return row.n;
}
