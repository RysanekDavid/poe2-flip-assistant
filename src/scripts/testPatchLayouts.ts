import assert from "node:assert/strict";
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { withHeartbeat } from "../core/heartbeat";
import type { HeartbeatOutcome } from "../db/heartbeatQueries";
import { migratePatchProvenance } from "../db/sourceMigrations";
import { officialPatch } from "../db/sourceQueries";
import { patchSyncProblem } from "../sources/patchNotes/contracts";
import { parsePatchThread } from "../sources/patchNotes/parser";
import { syncPatchNotes } from "../sources/patchNotes/store";
import {
  createProjectFixture,
  notModified,
  readFixture,
  response,
  syncOptions,
} from "./testPatchHelpers";

const indexHtml = readFixture("index.html");
const driftHtml = readFixture("drift.html");
const forumPostHtml = readFixture("thread-forum-post.html");
const newsPostHtml = readFixture("thread-news-post.html");
const TRIED_BOTH_LAYOUTS = /selector returned no content \(tried: tr\.staff .+; tr\.newsPost/;

/** Both staff layouts GGG actually served (see fixture headers), plus the strictness edges. */
export function testStaffBodyLayouts(): void {
  const forum = parsePatchThread(forumPostHtml, 4_006_357);
  assert.equal(forum.title, "Patch Notes 0.5.5c");
  assert.deepEqual(forum.listItems, [
    "Fixed an example quest that could not be completed.",
    "Fixed an example client crash.",
  ]);

  const news = parsePatchThread(newsPostHtml, 4_000_864);
  assert.equal(news.title, "Content Update 0.5.5 – Example League");
  assert.deepEqual(news.headings, [
    "Content Update 0.5.5 – Example League", "Table of Contents", "The example event league", "Bug Fixes",
  ]);
  assert.equal(news.listItems.length, 4);
  assert.doesNotMatch(news.bodyText, /Posted by|StaffAccount/, "the byline row is not patch body");
  assert.doesNotMatch(news.bodyText, /newsPost|margin/, "the embedded <style> is not patch body");

  const unmarked = newsPostHtml
    .replace("profile-link staff post_by_account", "profile-link post_by_account")
    .replace("roleLabel staffText", "roleLabel");
  assert.throws(() => parsePatchThread(unmarked, 4_000_864), TRIED_BOTH_LAYOUTS);
  assert.throws(() => parsePatchThread(driftHtml, 4_000_864), TRIED_BOTH_LAYOUTS);

  const withLaterReply = newsPostHtml.replace(
    "</table>",
    `<tr class="staff"><td class="content-container"><div class="content">
      <ul><li>A later staff reply.</li></ul></div></td></tr></table>`,
  );
  const first = parsePatchThread(withLaterReply, 4_000_864);
  assert.equal(first.title, news.title, "the first staff post in document order wins");
  assert.ok(!first.listItems.includes("A later staff reply."));
  console.log("PASS  staff body layouts: forum post, news post, unmarked, drift, first post");
}

/** One drifted thread must not cost the others their stored body, nor turn the panel green. */
export async function testPartialThreadFailure(): Promise<void> {
  const root = createProjectFixture();
  const db = new Database(":memory:");
  try {
    db.exec(readFileSync(join(process.cwd(), "src/db/schema.sql"), "utf8"));
    migratePatchProvenance(db);
    const recorded: HeartbeatOutcome[] = [];
    const result = await withHeartbeat(
      "patch-notes", "",
      () => syncPatchNotes(syncOptions(db, root, [
        response(indexHtml, "index-1"), response(driftHtml, "new-drift"), response(newsPostHtml, "baseline-1"),
      ])),
      { problem: patchSyncProblem, record: (outcome) => void recorded.push(outcome) },
    );
    assert.equal(result.ok, false);
    assert.equal(result.checkedThreads, 2);
    assert.equal(result.changedThreads, 1, "the parseable thread was stored");
    assert.deepEqual(result.failedThreads.map((failure) => failure.threadId), [3_991_000]);
    assert.match(result.failedThreads[0]?.reason ?? "", TRIED_BOTH_LAYOUTS);
    assert.equal(officialPatch(3_990_120, db)?.bodyValid, true);
    assert.equal(officialPatch(3_991_000, db)?.bodyValid, false);
    assert.match(
      recorded[0]?.error ?? "",
      /^sync incomplete: 1 of 2 thread\(s\) failed, 1 kept: thread 3991000: staff patch body selector/,
    );
    assertFailureRecorded(db);

    const recovered = await syncPatchNotes(syncOptions(db, root, [
      notModified(), response(forumPostHtml, "new-fixed"), notModified(),
    ]));
    assert.equal(patchSyncProblem(recovered), null);
    assert.deepEqual(recovered.failedThreads, []);
    assert.equal(officialPatch(3_991_000, db)?.bodyValid, true);
    console.log("PASS  partial thread failure keeps good threads and reports the bad one");
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
}

function assertFailureRecorded(db: Database.Database): void {
  const snapshot = db.prepare(`
    SELECT valid, parse_error AS error FROM source_snapshot
    WHERE snapshot_kind = 'thread' AND external_id = '3991000'
  `).get() as { valid: number; error: string } | undefined;
  assert.equal(snapshot?.valid, 0);
  assert.match(snapshot?.error ?? "", TRIED_BOTH_LAYOUTS);
  const state = db.prepare(`
    SELECT last_error AS error, last_success_at AS success FROM source_sync_state
    WHERE source_id = 'ggg_poe2_patch_notes'
  `).get() as { error: string | null; success: string | null } | undefined;
  assert.match(state?.error ?? "", /^thread 3991000: /);
  assert.notEqual(state?.success, null, "the index itself was still a valid check");
}
