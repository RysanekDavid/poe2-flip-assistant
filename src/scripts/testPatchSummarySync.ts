/* The announce rule through the REAL forum fixtures and syncPatchNotes: a fresh database's first
 * sync stays quiet, and only a thread a later sync discovers is announced. Offline, in-memory. */
import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import type Database from "better-sqlite3";
import { syncPatchNotes } from "../sources/patchNotes/store";
import { createProjectFixture, notModified, openPatchDb, readFixture, response, syncOptions } from "./testPatchHelpers";

const NEW_THREAD = 4_008_000;
const indexHtml = readFixture("index.html");
const threadHtml = readFixture("thread.html");
// A later index page: the forum lists the new thread first, the known ones below it.
const laterIndexHtml = indexHtml.replace(
  /(<tr><td class="thread">)/,
  `<tr><td class="thread"><div class="title"><a href="/forum/view-thread/${NEW_THREAD}">0.5.5d Patch Notes</a></div><span class="post_date">Sep 25, 2026, 1:00:00 AM</span></td></tr>\n  $1`,
);

interface Row { threadId: number; status: string; announce: number }
const summaryRows = (db: Database.Database): Row[] =>
  db.prepare("SELECT thread_id AS threadId, status, announce FROM patch_summary ORDER BY thread_id").all() as Row[];

async function main(): Promise<void> {
  const root = createProjectFixture();
  const db = openPatchDb();
  try {
    const first = await syncPatchNotes(syncOptions(db, root, [
      response(indexHtml, "index-1"), response(threadHtml, "new-1"), response(threadHtml, "base-1"),
    ]));
    assert.equal(first.ok, true, first.errors.join("; "));
    const published = db.prepare("SELECT COUNT(*) AS n FROM official_patch WHERE published_at IS NOT NULL").get() as { n: number };
    assert.equal(published.n, 0, "forum dates have no timezone, so the rule cannot lean on published_at");
    const quiet = summaryRows(db);
    assert.ok(quiet.length >= 2, "stored bodies are queued");
    assert.ok(quiet.every((row) => row.announce === 0), "a fresh database's first sync never announces");

    assert.notEqual(laterIndexHtml, indexHtml, "fixture edit applied");
    const second = await syncPatchNotes(syncOptions(db, root, [
      response(laterIndexHtml, "index-2"), response(threadHtml, "newest-1"), notModified(), notModified(),
    ]));
    assert.equal(second.ok, true, second.errors.join("; "));
    const rows = summaryRows(db);
    const discovered = rows.find((row) => row.threadId === NEW_THREAD);
    assert.deepEqual(discovered, { threadId: NEW_THREAD, status: "pending", announce: 1 }, "a newly discovered thread announces");
    assert.ok(rows.filter((row) => row.threadId !== NEW_THREAD).every((row) => row.announce === 0), "known threads stay quiet");
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
  console.log("patch-summary sync tests passed");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
