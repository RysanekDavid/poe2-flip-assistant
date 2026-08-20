import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import Database from "better-sqlite3";
import {
  conditionalRequestForParser,
  insertSourceSnapshot,
  officialPatch,
  reviewOfficialPatch,
  sourceSnapshotCount,
} from "../db/sourceQueries";
import { migratePatchProvenance } from "../db/sourceMigrations";
import {
  fetchPatchHtml,
  validatePatchUrl,
  validateResponseMetadata,
  type HttpFetcher,
} from "../sources/patchNotes/client";
import {
  testAllowedRedirectHeaders,
  testRedirectIdentityBoundary,
} from "./testPatchRedirects";
import { parsePatchIndex, parsePatchThread } from "../sources/patchNotes/parser";
import { syncPatchNotes } from "../sources/patchNotes/store";
import {
  PATCH_PARSER_NAME,
  PATCH_PARSER_VERSION,
  PATCH_THREAD_VALIDATION_POLICY,
} from "../sources/patchNotes/contracts";

const fixtureDir = join(process.cwd(), "src/sources/patchNotes/fixtures");
const indexHtml = readFileSync(join(fixtureDir, "index.html"), "utf8");
const threadHtml = readFileSync(join(fixtureDir, "thread.html"), "utf8");
const driftHtml = readFileSync(join(fixtureDir, "drift.html"), "utf8");

async function main(): Promise<void> {
  await testParsers();
  await testClientBoundary();
  await testRedirectIdentityBoundary();
  await testAllowedRedirectHeaders();
  testLegacyMigration();
  testParserVersionStorage();
  await testWatcherStorageAndReview();
  await testBaselineLifecycle();
  await testInitialBaselineInvalid();
  await testPreBaselineIndexFailsClosed();
  console.log("patch-note tests passed");
}

async function testParsers(): Promise<void> {
  const entries = parsePatchIndex(indexHtml, 3);
  assert.deepEqual(entries.map((entry) => entry.threadId), [3_991_000, 3_990_574, 3_980_000]);
  assert.equal(entries[0]?.versionText, "0.5.4e");
  assert.equal(entries[0]?.publishedAt, null);
  const localized = parsePatchIndex(indexHtml.replace("Aug 1, 2026, 10:15:00 AM", "1. srpna 2026"), 3);
  assert.equal(localized[0]?.publishedAt, null);
  const zoned = parsePatchIndex(
    indexHtml.replace("Aug 1, 2026, 10:15:00 AM", "2026-08-01T10:15:00Z"),
    3,
  );
  assert.equal(zoned[0]?.publishedAt, "2026-08-01T10:15:00.000Z");
  const body = parsePatchThread(threadHtml, 3_991_000);
  assert.deepEqual(body.headings, ["Gameplay Changes", "Bug Fixes"]);
  assert.deepEqual(body.listItems, [
    "Changed the first exact source-language entry.",
    "Fixed the second exact entry.",
    "Resolved an ordering regression.",
  ]);
  assert.throws(() => parsePatchIndex(driftHtml, 2), /expected at least/);
  assert.throws(() => parsePatchThread(driftHtml, 3_991_000), /selector/);
}

async function testClientBoundary(): Promise<void> {
  assert.throws(() => validatePatchUrl("http://www.pathofexile.com/forum/view-forum/2222"), /unsafe/);
  assert.throws(() => validatePatchUrl("https://evil.example/forum/view-forum/2222"), /unsafe/);
  assert.throws(() => validatePatchUrl("https://www.pathofexile.com/account/view-profile"), /unexpected/);
  assert.throws(
    () => validateResponseMetadata(
      "https://www.pathofexile.com/forum/view-forum/2222",
      200,
      new Headers({ "content-type": "application/json" }),
      100,
    ),
    /content type/,
  );
  const oversized = response("x".repeat(101), "etag", 200, { "content-length": "101" });
  await assert.rejects(
    fetchPatchHtml(
      "https://www.pathofexile.com/forum/view-forum/2222",
      "tests@example.invalid",
      { etag: null, lastModified: null },
      100,
      queueFetcher([oversized]),
    ),
    /exceeds/,
  );
  await assert.rejects(
    fetchPatchHtml(
      "https://www.pathofexile.com/forum/view-forum/2222",
      "",
      { etag: null, lastModified: null },
      100,
      queueFetcher([]),
    ),
    /CONTACT/,
  );
}

function testParserVersionStorage(): void {
  const db = new Database(":memory:");
  try {
    db.exec(readFileSync(join(process.cwd(), "src/db/schema.sql"), "utf8"));
    migratePatchProvenance(db);
    const first = insertSourceSnapshot(snapshotInput("1", false, "thread:legacy"), db);
    const second = insertSourceSnapshot(snapshotInput(PATCH_PARSER_VERSION, true), db);
    assert.notEqual(first, second, "the same bytes must be reparsed under a new parser version");
    const policyChange = insertSourceSnapshot(
      snapshotInput(PATCH_PARSER_VERSION, true, "thread:changed-policy"), db,
    );
    assert.notEqual(policyChange, second);
    assert.throws(
      () => insertSourceSnapshot(snapshotInput(PATCH_PARSER_VERSION, false), db),
      /contradictory validation results/,
    );
    assert.equal(sourceSnapshotCount(db), 3);
    const conditional = conditionalRequestForParser(
      "old-etag", "old-date", "1", PATCH_PARSER_VERSION,
      "thread:legacy", PATCH_THREAD_VALIDATION_POLICY, true,
    );
    assert.equal(conditional.allowsNotModified, false);
    assert.deepEqual(conditional.headers, { etag: null, lastModified: null });
    assert.equal(conditionalRequestForParser(
      "etag", null, PATCH_PARSER_VERSION, PATCH_PARSER_VERSION,
      "thread:changed-policy", PATCH_THREAD_VALIDATION_POLICY, true,
    ).allowsNotModified, false);
  } finally {
    db.close();
  }
}

function testLegacyMigration(): void {
  const db = new Database(":memory:");
  try {
    db.pragma("foreign_keys = ON");
    db.exec(readFileSync(join(fixtureDir, "legacy-schema.sql"), "utf8"));
    db.exec(readFileSync(join(process.cwd(), "src/db/schema.sql"), "utf8"));
    migratePatchProvenance(db);
    migratePatchProvenance(db);
    const snapshot = db.prepare(`
      SELECT id, parser_name AS parserName, parser_version AS parserVersion
      FROM source_snapshot WHERE id = 7
    `).get() as { id: number; parserName: string; parserVersion: string } | undefined;
    assert.deepEqual(snapshot, { id: 7, parserName: PATCH_PARSER_NAME, parserVersion: "1" });
    const sync = db.prepare("SELECT last_valid_index_snapshot_id AS id FROM source_sync_state")
      .get() as { id: number } | undefined;
    const evidence = db.prepare("SELECT snapshot_id AS id FROM evidence_link")
      .get() as { id: number } | undefined;
    const patch = db.prepare("SELECT body_snapshot_id AS id FROM official_patch")
      .get() as { id: number } | undefined;
    assert.equal(sync?.id, 7);
    assert.equal(evidence?.id, 7);
    assert.equal(patch?.id, 7);
    assert.equal(db.prepare("PRAGMA foreign_key_check").all().length, 0);
    const reparsed = insertSourceSnapshot(snapshotInput(PATCH_PARSER_VERSION, true), db);
    assert.notEqual(reparsed, 7);
  } finally {
    db.close();
  }
}

async function testWatcherStorageAndReview(): Promise<void> {
  const root = createProjectFixture();
  const db = new Database(":memory:");
  try {
    const schema = readFileSync(join(process.cwd(), "src/db/schema.sql"), "utf8");
    db.exec(schema);
    migratePatchProvenance(db);
    db.exec(schema);
    migratePatchProvenance(db);
    const first = await syncPatchNotes({
      db,
      projectRoot: root,
      artifactRoot: join(root, "data"),
      contact: "tests@example.invalid",
      minimumEntries: 2,
      fetcher: queueFetcher([
        response(indexHtml, "index-1"),
        response(threadHtml, "thread-new-1"),
        response(threadHtml, "thread-base-1"),
      ]),
    });
    assert.equal(first.ok, true);
    assert.equal(first.checkedThreads, 2);
    assert.equal(first.changedThreads, 2);
    assert.equal(officialPatch(3_991_000, db)?.disposition, "pending");
    assert.equal(officialPatch(3_980_000, db)?.bodyValid, false);
    const firstCount = sourceSnapshotCount(db);
    reviewOfficialPatch(
      3_991_000, "no_gameplay_impact", "reviewer", "initial review",
      null, new Date().toISOString(), db,
    );

    const unchanged = await syncPatchNotes(syncOptions(db, root, [notModified(), notModified(), notModified()]));
    assert.equal(unchanged.ok, true);
    assert.equal(unchanged.changedThreads, 0);
    assert.equal(sourceSnapshotCount(db), firstCount);
    assert.equal(officialPatch(3_991_000, db)?.disposition, "no_gameplay_impact");
    await assertAmendmentLifecycle(db, root);
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
}

async function testBaselineLifecycle(): Promise<void> {
  const root = createProjectFixture();
  const db = new Database(":memory:");
  try {
    const schema = readFileSync(join(process.cwd(), "src/db/schema.sql"), "utf8");
    db.exec(schema);
    migratePatchProvenance(db);
    await syncPatchNotes(syncOptions(db, root, [
      response(indexHtml, "index-1"),
      response(threadHtml, "new-1"),
      response(threadHtml, "baseline-1"),
    ]));
    assert.equal(officialPatch(3_990_574, db)?.disposition, null);
    const amendedBody = threadHtml.replace("first exact", "baseline amended exact");
    const amended = await syncPatchNotes(syncOptions(db, root, [
      notModified(), notModified(), response(amendedBody, "baseline-2"),
    ]));
    assert.equal(amended.ok, true);
    assert.equal(officialPatch(3_990_574, db)?.disposition, "pending");
    reviewOfficialPatch(
      3_990_574, "no_gameplay_impact", "reviewer", "baseline amendment",
      null, new Date().toISOString(), db,
    );
    const normalized = normalizedBody(3_990_574, db);
    const invalid = await syncPatchNotes(syncOptions(db, root, [
      notModified(), notModified(), response(driftHtml, "baseline-3"),
    ]));
    assert.equal(invalid.ok, false);
    assert.equal(officialPatch(3_990_574, db)?.bodyValid, false);
    assert.equal(officialPatch(3_990_574, db)?.disposition, "pending");
    assert.equal(normalizedBody(3_990_574, db), normalized);
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
}

async function testInitialBaselineInvalid(): Promise<void> {
  const root = createProjectFixture();
  const db = new Database(":memory:");
  try {
    db.exec(readFileSync(join(process.cwd(), "src/db/schema.sql"), "utf8"));
    migratePatchProvenance(db);
    const result = await syncPatchNotes(syncOptions(db, root, [
      response(indexHtml, "index-1"), response(threadHtml, "new-1"),
      response(driftHtml, "baseline-invalid"),
    ]));
    assert.equal(result.ok, false);
    assert.equal(officialPatch(3_990_574, db)?.bodyValid, false);
    assert.equal(officialPatch(3_990_574, db)?.disposition, "pending");
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
}

async function testPreBaselineIndexFailsClosed(): Promise<void> {
  const root = createProjectFixture();
  const db = new Database(":memory:");
  try {
    db.exec(readFileSync(join(process.cwd(), "src/db/schema.sql"), "utf8"));
    migratePatchProvenance(db);
    const preBaseline = indexHtml
      .replaceAll("3991000", "3979000")
      .replaceAll("3990574", "3978000")
      .replaceAll("3980000", "3977000");
    assert.equal(parsePatchIndex(preBaseline, 2).length >= 2, true);
    const result = await syncPatchNotes(syncOptions(db, root, [response(preBaseline, "old-index")]));
    assert.equal(result.ok, false);
    const state = db.prepare(`
      SELECT last_success_at AS success, last_valid_index_snapshot_id AS snapshot,
        last_error AS error, consecutive_failures AS failures
      FROM source_sync_state WHERE source_id = 'ggg_poe2_patch_notes'
    `).get() as { success: string | null; snapshot: number | null; error: string; failures: number };
    assert.equal(state.success, null);
    assert.equal(state.snapshot, null);
    assert.match(state.error, /does not reach coverage baseline/);
    assert.equal(state.failures, 1);
    const invalid = db.prepare("SELECT valid, parse_error AS error FROM source_snapshot").get() as {
      valid: number;
      error: string;
    };
    assert.equal(invalid.valid, 0);
    assert.match(invalid.error, /does not reach coverage baseline/);
    assert.equal(db.prepare("SELECT 1 FROM official_patch").get(), undefined);
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
}

async function assertAmendmentLifecycle(db: Database.Database, root: string): Promise<void> {
  const reviewedAt = new Date().toISOString();
  const changedBody = threadHtml.replace("ordering regression", "ordering regression amended");
  const changed = await syncPatchNotes(syncOptions(db, root, [
    notModified(), response(changedBody, "thread-new-2"), notModified(),
  ]));
  assert.equal(changed.changedThreads, 1);
  const amended = officialPatch(3_991_000, db);
  assert.equal(amended?.bodyValid, true);
  assert.equal(amended?.disposition, "pending");
  assert.throws(
    () => reviewOfficialPatch(3_991_000, "data_refreshed", "reviewer", "note", null, reviewedAt, db),
    /catalog SHA/,
  );
  reviewOfficialPatch(
    3_991_000, "no_gameplay_impact", "reviewer", "amendment review", null, reviewedAt, db,
  );
  assert.throws(
    () => reviewOfficialPatch(
      3_991_000, "no_gameplay_impact", "reviewer", "overwrite", null, reviewedAt, db,
    ),
    /not pending/,
  );
  const validSnapshotId = officialPatch(3_991_000, db)?.bodySnapshotId;
  const normalized = normalizedBody(3_991_000, db);
  const drifted = await syncPatchNotes(syncOptions(db, root, [
    notModified(), response(driftHtml, "thread-new-3"), notModified(),
  ]));
  assert.equal(drifted.ok, false);
  const invalid = officialPatch(3_991_000, db);
  assert.equal(invalid?.bodyValid, false);
  assert.equal(invalid?.disposition, "pending");
  assert.equal(invalid?.bodySnapshotId, validSnapshotId);
  assert.equal(normalizedBody(3_991_000, db), normalized);
  assert.throws(
    () => reviewOfficialPatch(3_991_000, "no_gameplay_impact", "reviewer", "note", null, reviewedAt, db),
    /no valid staff body/,
  );
  assert.throws(
    () => reviewOfficialPatch(3_990_574, "no_gameplay_impact", "reviewer", "note", null, reviewedAt, db),
    /not pending/,
  );
}

function normalizedBody(threadId: number, db: Database.Database): string | null {
  const row = db.prepare("SELECT body_text AS bodyText FROM official_patch WHERE thread_id = ?")
    .get(threadId) as { bodyText: string | null } | undefined;
  return row?.bodyText ?? null;
}

function snapshotInput(
  parserVersion: string,
  valid: boolean,
  validationPolicy: string = PATCH_THREAD_VALIDATION_POLICY,
) {
  return {
    sourceId: "ggg_poe2_patch_notes",
    kind: "thread" as const,
    externalId: "3991000",
    sourceUrl: "https://www.pathofexile.com/forum/view-thread/3991000/filter-account-type/staff",
    statusCode: 200,
    etag: "same-etag",
    lastModified: null,
    sha256: "a".repeat(64),
    artifactPath: "source-snapshots/ggg-patch-notes/same.html.gz",
    bytes: 10,
    valid,
    parseError: valid ? null : "old parser drift",
    parserName: PATCH_PARSER_NAME,
    parserVersion,
    validationPolicy,
    retrievedAt: "2026-08-01T00:00:00.000Z",
  };
}

function syncOptions(db: Database.Database, projectRoot: string, responses: Response[]) {
  return {
    db,
    projectRoot,
    artifactRoot: join(projectRoot, "data"),
    contact: "tests@example.invalid",
    minimumEntries: 2,
    fetcher: queueFetcher(responses),
  } as const;
}

function response(body: string, etag: string, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", etag, ...extra },
  });
}

function notModified(): Response {
  return new Response(null, { status: 304, headers: { etag: "unchanged" } });
}

function queueFetcher(responses: Response[]): HttpFetcher {
  return async () => {
    const next = responses.shift();
    if (!next) throw new Error("unexpected offline fetch");
    return next;
  };
}

function createProjectFixture(): string {
  const root = mkdtempSync(join(tmpdir(), "poe-patch-notes-"));
  for (const relativePath of [
    "src/data/poe2/patch-coverage.json",
    "src/data/poe2/repoe/manifest.json",
    "src/data/poe2/repoe/catalog-75a23d387f288921.json.gz",
  ]) {
    const target = join(root, relativePath);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(join(process.cwd(), relativePath), target);
  }
  return root;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
