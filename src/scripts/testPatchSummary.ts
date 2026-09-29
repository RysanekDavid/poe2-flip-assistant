/* Patch-summary queue, Coach worker and PATCH announcements against a TEMP DB with a fake Coach.
 * Never calls a model. Run: npm run test:patch (runWithTestEnv.ts patch-summary sets DB_PATH). */
import assert from "node:assert/strict";
import { config } from "../config/env";
import { getDb } from "../db/database";
import { migratePatchSummaries } from "../db/patchSummaryMigrations";
import { patchesQuerySchema, patchesResponseSchema } from "../lib/patchesContract";
import { toPatchListItem } from "../lib/patchesView";
import { listPatches, requestResummary, upsertSummaryJob } from "../db/patchSummaryQueries";
import { insertSourceSnapshot, updateOfficialPatchBody, upsertIndexPatches } from "../db/sourceQueries";
import { alertEmbed, type NotifyAlert } from "../core/notify/discordMessage";
import { PATCH_ALERT_MAX_CHARS, PATCH_SUMMARY_UNAVAILABLE, patchAlertMessage } from "../sources/patchNotes/patchAlert";
import { MAX_SUMMARY_ATTEMPTS, drainPatchSummaries, drainProblem, summaryBackoffMs } from "../sources/patchNotes/summaryWorker";
import { buildSummaryRequest, patchSummaryInputSha256 } from "../sources/patchNotes/summaryInput";
import { PATCH_SOURCE_ID, type PatchDocument } from "../sources/patchNotes/contracts";
import type { PatchSummary } from "../sources/patchNotes/summaryContract";
import { openPatchDb } from "./testPatchHelpers";

if (!/scratchpad|tmp|temp/.test(config.dbPath)) {
  console.error(`refusing to run against ${config.dbPath} — point DB_PATH at a temp file.`);
  process.exit(1);
}

const db = getDb();
// The temp DB outlives runs; rebuild the table from today's DDL so a stale test copy never masks it.
db.exec("DROP TABLE IF EXISTS patch_summary");
migratePatchSummaries(db);
const NOW = Date.now();
const RECENT = 4_100_001;
const OLD = 4_000_001;
const LATER = 4_100_002;

const SUMMARY: PatchSummary = {
  schema_version: 1,
  tldr: "Hotfix for exchange crashes.",
  hotfix: true,
  groups: [
    { kind: "bugfix", bullets: ["Fixed a crash in the Currency Exchange."] },
    { kind: "economy", bullets: ["Exchange listings now expire after 7 days."] },
  ],
  trading_impact: "Stale exchange orders may clear out.",
  review_hint: "likely_no_gameplay_impact",
  review_reason: "Only fixes.",
};

type FakeFetch = (input: string, init: RequestInit) => Promise<Response>;

function requestIdOf(init: RequestInit): string {
  const id = new Headers(init.headers).get("X-Coach-Request-Id");
  if (!id) throw new Error("worker sent no request id");
  return id;
}

const healthy = (input: string): Response | null => (input.endsWith("/health") ? Response.json({ status: "ok" }) : null);

const coachOk: FakeFetch = async (input, init) =>
  healthy(input) ?? Response.json({
    request_id: requestIdOf(init),
    model: "gpt-test",
    prompt_version: "1",
    truncated: false,
    summary: SUMMARY,
    usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 },
  });

const coachError = (status: number, code: string, message: string, retryable: boolean): FakeFetch => async (input, init) =>
  healthy(input) ?? Response.json(
    { error: { code, message, request_id: requestIdOf(init), retryable, reset_conversation: false } },
    { status },
  );
const coachNotConfigured = coachError(503, "internal", "Coach is not configured.", false);
const coachTimeout = coachError(504, "provider_timeout", "Coach timed out while checking its sources.", true);

function resetTables(): void {
  db.pragma("foreign_keys = OFF");
  db.exec(`
    DELETE FROM notify_queue; DELETE FROM alerts; DELETE FROM patch_summary; DELETE FROM evidence_link;
    DELETE FROM pending_patch_effect; DELETE FROM official_patch; DELETE FROM source_snapshot;
  `);
  db.prepare("UPDATE source_sync_state SET last_success_at = NULL WHERE source_id = ?").run(PATCH_SOURCE_ID);
  db.pragma("foreign_keys = ON");
  db.prepare("INSERT OR IGNORE INTO users (id, name, password_hash, api_key, role) VALUES (2, 'patch-member', 'x', 'pk_patch_2', 'member')").run();
  db.prepare("UPDATE users SET discord_webhook_enc = NULL").run();
  // The trigger only checks for a stored webhook; nothing is sent in this test.
  db.prepare("UPDATE users SET discord_webhook_enc = 'test-only' WHERE id = 2").run();
}

let snapshotSeq = 0;
function snapshot(kind: "index" | "thread", externalId: string): number {
  snapshotSeq += 1;
  return insertSourceSnapshot({
    sourceId: PATCH_SOURCE_ID, kind, externalId, sourceUrl: `https://www.pathofexile.com/forum/view-thread/${externalId}`,
    statusCode: 200, etag: null, lastModified: null, sha256: `${snapshotSeq}`.padStart(64, "0"),
    artifactPath: `test/${snapshotSeq}.html.gz`, bytes: 1, valid: true, parseError: null,
    parserName: "test", parserVersion: "test", validationPolicy: "test", retrievedAt: new Date(NOW).toISOString(),
  }, db);
}

/** OLD is indexed by the first (quiet) sync; RECENT and LATER are discovered by a later one. */
function indexPatches(): void {
  // Forum dates carry no timezone, so real rows have published_at NULL — the rule must not need it.
  const entry = (threadId: number) => ({
    threadId, title: `Patch ${threadId}`, versionText: "0.5.5c", publishedAt: null, publishedText: "Sep 18, 2026",
    sourceUrl: `https://www.pathofexile.com/forum/view-thread/${threadId}`,
  });
  upsertIndexPatches([entry(OLD)], snapshot("index", "2212"), 0, db);
  db.prepare("UPDATE source_sync_state SET last_success_at = ? WHERE source_id = ?").run(new Date(NOW).toISOString(), PATCH_SOURCE_ID);
  upsertIndexPatches([entry(LATER), entry(RECENT), entry(OLD)], snapshot("index", "2212"), 0, db);
}

function storeBody(threadId: number, items: string[]): void {
  const document: PatchDocument = { threadId, title: `Patch ${threadId}`, headings: ["Bug Fixes"], listItems: items, bodyText: items.join("\n") };
  updateOfficialPatchBody(document, snapshot("thread", String(threadId)), db);
}

interface JobRow { status: string; attempts: number; announce: number; announced_at: string | null; input_sha256: string; summary_json: string | null; next_attempt_at: string | null }
const job = (threadId: number): JobRow | undefined =>
  db.prepare("SELECT status, attempts, announce, announced_at, input_sha256, summary_json, next_attempt_at FROM patch_summary WHERE thread_id = ?").get(threadId) as JobRow | undefined;
const patchAlerts = (): Array<{ user_id: number; league: string | null; item_id: string; item_name: string; message: string; link: string }> =>
  db.prepare("SELECT user_id, league, item_id, item_name, message, link FROM alerts WHERE type = 'PATCH' ORDER BY user_id").all() as ReturnType<typeof patchAlerts>;

function testEnqueueRules(): void {
  resetTables();
  indexPatches();
  assert.equal(job(OLD), undefined, "the first sync's threads are not news");
  assert.equal(job(LATER)?.status, "waiting", "a discovered thread waits for its body");
  assert.equal(job(LATER)?.announce, 1);
  storeBody(RECENT, ["Fixed a crash."]);
  storeBody(OLD, ["Old fix."]);
  assert.equal(job(RECENT)?.status, "pending");
  assert.equal(job(RECENT)?.announce, 1, "a thread discovered after a prior sync announces");
  assert.equal(job(OLD)?.announce, 0, "a thread from the first sync stays quiet");
  assert.equal(job(RECENT)?.input_sha256, patchSummaryInputSha256(`Patch ${RECENT}`, ["Bug Fixes"], ["Fixed a crash."]));

  db.prepare("UPDATE patch_summary SET status = 'done', attempts = 3, summary_json = '{}' WHERE thread_id = ?").run(RECENT);
  storeBody(RECENT, ["Fixed a crash."]); // re-fetch, same text
  assert.equal(job(RECENT)?.status, "done", "unchanged text is a no-op");
  assert.equal(job(RECENT)?.attempts, 3);

  storeBody(RECENT, ["Fixed a crash.", "Fixed another crash."]); // forum edit
  const edited = job(RECENT);
  assert.equal(edited?.status, "pending", "changed text re-queues");
  assert.equal(edited?.attempts, 0);
  assert.equal(edited?.announce, 1, "the announce decision survives the edit");
  assert.equal(edited?.summary_json, "{}", "the previous summary stays visible while re-summarizing");
}

async function testDrainAndAnnounceOnce(): Promise<void> {
  resetTables();
  indexPatches();
  storeBody(RECENT, ["Fixed a crash."]);
  storeBody(OLD, ["Old fix."]);
  const sent: unknown[] = [];
  const recording: FakeFetch = async (input, init) => {
    if (input.endsWith("/health")) return Response.json({ status: "ok" });
    assert.match(input, /\/internal\/patch-summary$/);
    assert.match(new Headers(init.headers).get("X-Coach-Actor") ?? "", /^v1\./);
    sent.push(JSON.parse(String(init.body)));
    return coachOk(input, init);
  };
  const first = await drainPatchSummaries({ db, fetchImpl: recording, now: () => NOW });
  assert.deepEqual(first, { summarized: 2, retried: 0, failed: 0, announced: 1, errors: [], coachUnreachable: false });
  assert.equal((sent[0] as { thread_id: number }).thread_id, RECENT, "newest patch first");
  const alerts = patchAlerts();
  assert.equal(alerts.length, 2, "one PATCH alert per user");
  for (const alert of alerts) {
    assert.equal(alert.league, null);
    assert.equal(alert.item_id, `patch:${RECENT}`);
    assert.equal(alert.item_name, `0.5.5c — Patch ${RECENT}`);
    assert.equal(alert.link, `https://www.pathofexile.com/forum/view-thread/${RECENT}`);
    assert.ok(alert.message.startsWith(SUMMARY.tldr));
  }
  const queued = db.prepare("SELECT COUNT(*) AS n FROM notify_queue q JOIN alerts a ON a.id = q.alert_id WHERE a.type = 'PATCH'").get() as { n: number };
  assert.equal(queued.n, 1, "Discord is queued for the user with a webhook only");

  const second = await drainPatchSummaries({ db, fetchImpl: coachOk, now: () => NOW });
  assert.equal(second.summarized + second.announced, 0, "nothing is summarized or announced twice");
  assert.equal(patchAlerts().length, 2);
}

const requeue = (threadId: number): void => {
  db.prepare("UPDATE patch_summary SET status = 'pending', next_attempt_at = NULL WHERE thread_id = ?").run(threadId);
};

async function testRetryBackoffAndFailure(): Promise<void> {
  resetTables();
  indexPatches();
  storeBody(LATER, ["Changed Chaos Orb."]);
  const retry = await drainPatchSummaries({ db, fetchImpl: coachTimeout, now: () => NOW });
  assert.equal(retry.retried, 1, "a retryable Coach error backs off");
  assert.match(retry.errors[0] ?? "", /HTTP 504 provider_timeout/);
  const pending = job(LATER);
  assert.equal(pending?.status, "pending");
  assert.equal(pending?.attempts, 1);
  assert.equal(pending?.next_attempt_at, new Date(NOW + summaryBackoffMs(1)).toISOString());
  const early = await drainPatchSummaries({ db, fetchImpl: coachOk, now: () => NOW + 60_000 });
  assert.equal(early.summarized, 0, "backoff is honoured");

  const healthyThen = (fake: FakeFetch): FakeFetch => async (input, init) =>
    (input.endsWith("/health") ? Response.json({ status: "ok" }) : fake(input, init));
  const transients: Array<[string, FakeFetch]> = [
    ["network error mid-call", healthyThen(async () => { throw new TypeError("fetch failed"); })],
    ["502 without JSON", async () => new Response("<html>bad gateway</html>", { status: 502 })],
    ["404 without envelope (web ahead of Coach)", async () => new Response("Not Found", { status: 404 })],
    ["401 without envelope", async () => Response.json({ detail: "unauthorized" }, { status: 401 })],
    ["403 without envelope", async () => new Response("Forbidden", { status: 403 })],
    ["incomplete output", coachError(503, "provider_incomplete", "The model stopped before finishing. Try again later.", true)],
  ];
  for (const [name, transient] of transients) {
    requeue(LATER);
    const result = await drainPatchSummaries({ db, fetchImpl: transient, now: () => NOW });
    assert.equal(result.retried, 1, `${name}: backs off`);
  }

  db.prepare("UPDATE patch_summary SET attempts = ?, next_attempt_at = NULL WHERE thread_id = ?").run(MAX_SUMMARY_ATTEMPTS - 1, LATER);
  const incomplete = coachError(503, "provider_incomplete", "The model stopped before finishing. Try again later.", true);
  const exhausted = await drainPatchSummaries({ db, fetchImpl: incomplete, now: () => NOW });
  assert.equal(exhausted.failed, 1, "retryable errors still stop after the last attempt");
  assert.equal(exhausted.announced, 1, "a failed summary still announces the patch");
  assert.equal(job(LATER)?.status, "failed");
  assert.equal(patchAlerts()[0]?.message, PATCH_SUMMARY_UNAVAILABLE);
  assert.equal(summaryBackoffMs(1), 30 * 60_000);
  assert.equal(summaryBackoffMs(20), 6 * 3600_000);
}

async function testNonRetryableFailsAtOnce(): Promise<void> {
  resetTables();
  indexPatches();
  storeBody(RECENT, ["Fixed a crash."]);
  const cases: Array<[string, FakeFetch]> = [
    ["not configured", coachNotConfigured],
    ["provider rejected", coachError(502, "provider_rejected", "The model provider rejected this request.", false)],
    ["contract violation", coachError(502, "contract_violation", "Coach could not complete this answer safely.", false)],
    ["422 without an error body", async () => Response.json({ detail: "invalid" }, { status: 422 })],
  ];
  for (const [name, fetchImpl] of cases) {
    requeue(RECENT);
    db.prepare("UPDATE patch_summary SET attempts = 0, announced_at = NULL WHERE thread_id = ?").run(RECENT);
    const result = await drainPatchSummaries({ db, fetchImpl, now: () => NOW });
    assert.equal(result.failed, 1, `${name}: fails on the first attempt`);
    assert.equal(job(RECENT)?.attempts, 1, name);
  }
  assert.equal(patchAlerts()[0]?.message, PATCH_SUMMARY_UNAVAILABLE, "announced as unavailable");
}

async function testLeasePreventsDoubleCalls(): Promise<void> {
  resetTables();
  indexPatches();
  storeBody(RECENT, ["Fixed a crash."]);
  storeBody(OLD, ["Old fix."]);
  let calls = 0;
  const slow: FakeFetch = async (input, init) => {
    if (input.endsWith("/health")) return Response.json({ status: "ok" });
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 20));
    return coachOk(input, init);
  };
  // The poller and `patch:summarize` draining at the same moment.
  const [a, b] = await Promise.all([
    drainPatchSummaries({ db, fetchImpl: slow, now: () => NOW }),
    drainPatchSummaries({ db, fetchImpl: slow, now: () => NOW }),
  ]);
  assert.equal(calls, 2, "each job reaches the Coach once");
  assert.equal(a.summarized + b.summarized, 2);
}

async function testUnreachableCoachSkipsTheDrain(): Promise<void> {
  resetTables();
  indexPatches();
  storeBody(RECENT, ["Fixed a crash."]);
  let posts = 0;
  const down: FakeFetch = async (input) => {
    if (!input.endsWith("/health")) posts += 1;
    throw new TypeError("fetch failed: connect ECONNREFUSED 127.0.0.1:8000");
  };
  // Web and poller restarted before the Coach: nothing may be spent or failed.
  for (let run = 0; run < 3; run += 1) {
    const result = await drainPatchSummaries({ db, fetchImpl: down, now: () => NOW });
    assert.equal(result.coachUnreachable, true);
    assert.match(drainProblem(result) ?? "", /Coach unreachable/, "the heartbeat still turns red");
  }
  assert.equal(posts, 0, "no summary request while the Coach is down");
  assert.equal(job(RECENT)?.status, "pending");
  assert.equal(job(RECENT)?.attempts, 0, "no attempt is burned");
  const back = await drainPatchSummaries({ db, fetchImpl: coachOk, now: () => NOW });
  assert.equal(back.summarized, 1, "the drain resumes once the Coach answers");
}

function testStaleWaitingRowStaysQuiet(): void {
  resetTables();
  indexPatches();
  assert.equal(job(LATER)?.status, "waiting");
  // Discovered as news, but its body only parsed ten days later (e.g. a parser drift fixed).
  db.prepare("UPDATE patch_summary SET created_at = datetime('now', '-10 days') WHERE thread_id = ?").run(LATER);
  storeBody(LATER, ["Changed Chaos Orb."]);
  assert.equal(job(LATER)?.status, "pending");
  assert.equal(job(LATER)?.announce, 0, "old news never announces");
  storeBody(RECENT, ["Fixed a crash."]);
  assert.equal(job(RECENT)?.announce, 1, "a fresh waiting row keeps its announcement");
}

async function testStaleWaitingNeverAlerts(): Promise<void> {
  testStaleWaitingRowStaysQuiet();
  const drained = await drainPatchSummaries({ db, fetchImpl: coachOk, now: () => NOW });
  assert.equal(drained.summarized, 2, "both are still summarized");
  const alerted = new Set(patchAlerts().map((a) => a.item_id));
  assert.equal(alerted.has(`patch:${LATER}`), false, "no PATCH alert for a body that arrived ten days late");
  assert.equal(alerted.has(`patch:${RECENT}`), true);
}

async function testContractAndStaleResults(): Promise<void> {
  resetTables();
  indexPatches();
  storeBody(OLD, ["Old fix."]);
  const wrongId: FakeFetch = async (input, init) => coachOk(input, { ...init, headers: { "X-Coach-Request-Id": "b".repeat(24) } });
  const mismatch = await drainPatchSummaries({ db, fetchImpl: wrongId, now: () => NOW });
  assert.match(mismatch.errors[0] ?? "", /different request id/);
  assert.equal(mismatch.failed, 1, "a request-id mismatch is a defect, not a transient");
  requeue(OLD);
  const broken: FakeFetch = async (input, init) => healthy(input) ?? Response.json({ request_id: requestIdOf(init), summary: { tldr: 1 } });
  const invalid = await drainPatchSummaries({ db, fetchImpl: broken, now: () => NOW });
  assert.match(invalid.errors[0] ?? "", /broke its contract/);
  assert.equal(invalid.failed, 1);

  requeue(OLD);
  const editedMidCall: FakeFetch = async (input, init) => {
    upsertSummaryJob(OLD, "f".repeat(64), db); // the body changed while the Coach worked
    return coachOk(input, init);
  };
  const stale = await drainPatchSummaries({ db, fetchImpl: editedMidCall, now: () => NOW });
  assert.equal(stale.summarized, 0, "a result for superseded text is dropped");
  assert.equal(job(OLD)?.status, "pending");

  assert.equal(requestResummary(OLD, db), "queued");
  assert.equal(requestResummary(999, db), "not_found");
  assert.equal(requestResummary(LATER, db), "no_body");
  assert.equal(patchAlerts().length, 0, "quiet rows never alert");
}

function testBackfillIsQuietAndIdempotent(): void {
  const mem = openPatchDb();
  try {
    const index = mem.prepare(`INSERT INTO source_snapshot (source_id, snapshot_kind, external_id, source_url, http_status,
      content_sha256, artifact_path, content_bytes, valid, parser_name, parser_version, validation_policy, retrieved_at)
      VALUES (?, 'index', '2212', 'https://x', 200, ?, 'a', 1, 1, 't', 't', 't', 'now')`).run(PATCH_SOURCE_ID, "0".repeat(64)).lastInsertRowid;
    const insert = mem.prepare(`INSERT INTO official_patch (thread_id, source_id, source_order, title, version_text, published_text,
      source_url, index_snapshot_id, body_valid, headings_json, list_items_json) VALUES (?, ?, ?, 'T', '0.5.5', 'x', 'https://x', ?, ?, '[]', '["a"]')`);
    insert.run(1, PATCH_SOURCE_ID, 1, index, 1);
    insert.run(2, PATCH_SOURCE_ID, 2, index, 1);
    insert.run(3, PATCH_SOURCE_ID, 3, index, 0);
    migratePatchSummaries(mem);
    migratePatchSummaries(mem);
    const rows = mem.prepare("SELECT thread_id AS id, status, announce FROM patch_summary ORDER BY thread_id").all();
    assert.deepEqual(rows, [{ id: 1, status: "pending", announce: 0 }, { id: 2, status: "pending", announce: 0 }]);
  } finally {
    mem.close();
  }
}

function testMessageAndEmbed(): void {
  assert.equal(patchAlertMessage(null), PATCH_SUMMARY_UNAVAILABLE);
  const long: PatchSummary = { ...SUMMARY, groups: [{ kind: "economy", bullets: Array.from({ length: 9 }, () => "x".repeat(190)) }] };
  const message = patchAlertMessage(long);
  assert.ok(message.length <= PATCH_ALERT_MAX_CHARS, `message is ${message.length} chars`);
  assert.ok(message.includes("\n• Trading: "), "trading impact leads the bullets");
  const alert: NotifyAlert = {
    id: 1, type: "PATCH", item_id: "patch:1", item_name: "0.5.5c — Hotfix", message, value: null, threshold: null,
    whisper: null, link: "https://www.pathofexile.com/forum/view-thread/1", details: null, league: null, created_at: "2026-09-29 10:00:00",
  };
  const embed = alertEmbed(alert);
  assert.equal(embed.url, alert.link);
  assert.equal(embed.color, 0xfbbf24);
  assert.ok(!embed.fields.some((f) => f.name === "Trade"), "a forum link is not a trade link");
}

async function testListContract(): Promise<void> {
  resetTables();
  indexPatches();
  storeBody(RECENT, ["Fixed a crash."]);
  storeBody(OLD, ["Old fix."]);
  await drainPatchSummaries({ db, fetchImpl: coachOk, now: () => NOW });
  db.prepare("UPDATE patch_summary SET status = 'failed', last_error = 'Coach patch summary HTTP 503' WHERE thread_id = ?").run(OLD);
  const page = listPatches(2, null, db);
  assert.deepEqual(page.map((p) => p.threadId), [LATER, RECENT], "newest first");
  assert.deepEqual(listPatches(5, RECENT, db).map((p) => p.threadId), [OLD], "?before pages to older threads");
  const items = listPatches(5, null, db).map((row) => toPatchListItem(row, false));
  const body = patchesResponseSchema.parse({ patches: items, nextBefore: null, canResummarize: false });
  assert.equal(body.patches[0]?.summary, null, "a thread without a body has no summary job");
  assert.equal(body.patches[1]?.summary?.data?.tldr, SUMMARY.tldr);
  assert.equal(body.patches[2]?.summary?.error, null, "members never see Coach error detail");
  const ownerView = toPatchListItem(listPatches(1, RECENT, db)[0]!, true);
  assert.equal(ownerView.summary?.error, "Coach patch summary HTTP 503");
  db.prepare("UPDATE patch_summary SET summary_json = '{\"tldr\":1}' WHERE thread_id = ?").run(RECENT);
  const broken = toPatchListItem(listPatches(1, LATER, db)[0]!, true);
  assert.equal(broken.summary?.data, null);
  assert.match(broken.summary?.error ?? "", /no longer matches/, "a broken stored summary is reported, not hidden");
  assert.equal(patchesQuerySchema.safeParse({ limit: "51" }).success, false);
  assert.equal(patchesQuerySchema.parse({}).limit, 20);
}

function testRequestClipping(): void {
  const { body, clipped } = buildSummaryRequest({ threadId: 1, versionText: "0.5.5", title: "T", headings: ["", "H"], listItems: ["x".repeat(3_000)] });
  assert.equal(clipped, true);
  assert.deepEqual(body.headings, ["H"]);
  assert.equal(body.list_items[0]?.length, 2_000);
}

async function main(): Promise<void> {
  testEnqueueRules();
  await testDrainAndAnnounceOnce();
  await testRetryBackoffAndFailure();
  await testNonRetryableFailsAtOnce();
  await testLeasePreventsDoubleCalls();
  await testUnreachableCoachSkipsTheDrain();
  await testStaleWaitingNeverAlerts();
  await testContractAndStaleResults();
  testBackfillIsQuietAndIdempotent();
  testMessageAndEmbed();
  testRequestClipping();
  await testListContract();
  console.log("patch-summary tests passed");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
