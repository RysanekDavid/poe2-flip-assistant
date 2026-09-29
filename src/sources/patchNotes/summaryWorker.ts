import type Database from "better-sqlite3";
import { config } from "../../config/env";
import { sanitizeHeartbeatError } from "../../core/heartbeat";
import { getDb } from "../../db/database";
import {
  dueSummaryJobs,
  leaseSummaryJob,
  markAnnounced,
  markSummaryDone,
  markSummaryRetry,
  unannouncedTerminal,
  type AnnounceCandidate,
  type DueSummaryJob,
} from "../../db/patchSummaryQueries";
import { parseCoachUpstreamError } from "../../lib/coachContract";
import { coachEndpoint, createCoachRequestId, deriveCoachActorToken } from "../../lib/coachServer";
import { firePatchAlert, patchAlertMessage } from "./patchAlert";
import { buildSummaryRequest } from "./summaryInput";
import {
  coachPatchSummaryResponseSchema,
  patchSummarySchema,
  type CoachPatchSummaryResponse,
  type PatchSummary,
} from "./summaryContract";

/** Summaries are system work: they run under the owner's Coach identity (and rate limit). */
const OWNER_ID = 1;
const BATCH = 5;
const TIMEOUT_MS = 120_000;
// Longer than one call's deadline, so a live claim never expires under its own drainer.
const LEASE_MS = 5 * 60_000;
const HEALTH_TIMEOUT_MS = 10_000;
export const MAX_SUMMARY_ATTEMPTS = 8;
const BASE_BACKOFF_MS = 30 * 60_000;
const MAX_BACKOFF_MS = 6 * 3600_000;

type FetchImpl = (input: string, init: RequestInit) => Promise<Response>;

export interface DrainOptions {
  db?: Database.Database;
  fetchImpl?: FetchImpl;
  now?: () => number;
}

export interface DrainResult {
  summarized: number;
  retried: number;
  failed: number;
  announced: number;
  errors: string[];
  /** The drain was skipped because the Coach did not answer its health check. */
  coachUnreachable: boolean;
}

/** 30m, 1h, 2h, 4h, then 6h — a Coach outage heals without hammering it. Pure. */
export function summaryBackoffMs(attempts: number): number {
  return Math.min(BASE_BACKOFF_MS * 2 ** Math.max(0, attempts - 1), MAX_BACKOFF_MS);
}

/** Heartbeat text: an unreachable Coach is red too, even though no attempt was spent. */
export function drainProblem(result: DrainResult): string | null {
  if (result.coachUnreachable) return "Coach unreachable; summaries skipped until it answers /health";
  return result.errors.length === 0 ? null : `${result.errors.length} summary attempt(s) failed: ${result.errors.join("; ")}`;
}

/**
 * A failed attempt that says whether trying again can help. Transient trouble (timeouts, rate
 * limits, 5xx, an unreachable Coach) backs off; a deterministic one (no model key, a rejected or
 * schema-breaking request, a missing proxy secret) fails the job at once so the patch is still
 * announced — as "summary unavailable" — instead of sitting silent for a day of retries.
 */
export class SummaryFailure extends Error {
  public constructor(message: string, public readonly retryable: boolean) {
    super(message);
    this.name = "SummaryFailure";
  }
}

/** Anything not classified (a fetch network error, an abort on our deadline) is transient. */
function isRetryable(error: unknown): boolean {
  return error instanceof SummaryFailure ? error.retryable : true;
}

const transientStatus = (status: number): boolean => status === 429 || status >= 500;
/**
 * Without a Coach error envelope, 401/403/404 mean something other than the Coach answered — a
 * proxy in front of a Coach still starting, or a web build ahead of the Coach (route not there
 * yet). That heals on the next deploy or restart, so it must not burn the job.
 */
const transientWithoutEnvelope = (status: number): boolean => transientStatus(status) || [401, 403, 404].includes(status);

let coachDownLogged = false;

/**
 * True when the Coach answers at all (any HTTP status). An unreachable Coach — the web and poller
 * restarting before it — skips the drain instead of spending attempts, logged once per outage.
 */
async function coachReachable(fetchImpl: FetchImpl): Promise<boolean> {
  try {
    await fetchImpl(coachEndpoint(config.coach.apiUrl, "/health"), {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    });
    coachDownLogged = false;
    return true;
  } catch (error: unknown) {
    if (!coachDownLogged) {
      console.warn(`[patch-summary] Coach unreachable, summaries wait for it: ${sanitizeHeartbeatError(error)}`);
      coachDownLogged = true;
    }
    return false;
  }
}

/** Summarize up to five due patches through the Coach, then announce whatever became terminal. */
export async function drainPatchSummaries(options: DrainOptions = {}): Promise<DrainResult> {
  const db = options.db ?? getDb();
  const now = options.now ?? Date.now;
  const fetchImpl = options.fetchImpl ?? fetch;
  const result: DrainResult = { summarized: 0, retried: 0, failed: 0, announced: 0, errors: [], coachUnreachable: false };
  const due = dueSummaryJobs(BATCH, new Date(now()).toISOString(), db);
  if (due.length > 0 && !(await coachReachable(fetchImpl))) {
    result.coachUnreachable = true;
    result.announced = announcePatchSummaries(db, now);
    return result;
  }
  for (const job of due) {
    const leaseUntil = new Date(now() + LEASE_MS).toISOString();
    // Another drainer (poller vs patch:summarize) claimed it between the query and here.
    if (!leaseSummaryJob(job.threadId, job.inputSha256, new Date(now()).toISOString(), leaseUntil, db)) continue;
    try {
      storeSummary(job, await requestSummary(job, fetchImpl), now(), db, result);
    } catch (error: unknown) {
      recordFailure(job, error, now(), db, result);
    }
  }
  result.announced = announcePatchSummaries(db, now);
  return result;
}

function storeSummary(
  job: DueSummaryJob,
  response: CoachPatchSummaryResponse & { clipped: boolean },
  nowMs: number,
  db: Database.Database,
  result: DrainResult,
): void {
  const stored = markSummaryDone({
    threadId: job.threadId,
    inputSha256: job.inputSha256,
    model: response.model,
    promptVersion: response.prompt_version,
    truncated: response.truncated || response.clipped,
    summaryJson: JSON.stringify(response.summary),
    usage: response.usage,
    at: new Date(nowMs).toISOString(),
  }, db);
  if (stored) result.summarized += 1;
  else console.warn(`[patch-summary] thread ${job.threadId}: dropped a summary of superseded text (the thread changed during the call)`);
}

function recordFailure(job: DueSummaryJob, error: unknown, nowMs: number, db: Database.Database, result: DrainResult): void {
  const attempts = job.attempts + 1;
  const message = sanitizeHeartbeatError(error);
  const terminal = !isRetryable(error) || attempts >= MAX_SUMMARY_ATTEMPTS;
  const nextAt = terminal ? null : new Date(nowMs + summaryBackoffMs(attempts)).toISOString();
  markSummaryRetry(job.threadId, job.inputSha256, attempts, nextAt, message, db);
  if (terminal) result.failed += 1;
  else result.retried += 1;
  result.errors.push(`thread ${job.threadId} attempt ${attempts}${terminal ? " (final)" : ""}: ${message}`);
}

function actorToken(): string {
  try {
    return deriveCoachActorToken(OWNER_ID, config.coach.proxySecret);
  } catch (error: unknown) {
    throw new SummaryFailure(`Coach identity unavailable: ${error instanceof Error ? error.message : String(error)}`, false);
  }
}

async function requestSummary(
  job: DueSummaryJob,
  fetchImpl: FetchImpl,
): Promise<CoachPatchSummaryResponse & { clipped: boolean }> {
  const requestId = createCoachRequestId();
  const { body, clipped } = buildSummaryRequest(job);
  const response = await fetchImpl(coachEndpoint(config.coach.apiUrl, "/internal/patch-summary"), {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Coach-Request-Id": requestId, "X-Coach-Actor": actorToken() },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const payload: unknown = await response.json().catch((error: unknown) => {
    throw new SummaryFailure(`Coach patch summary returned HTTP ${response.status} without JSON: ${String(error)}`, transientWithoutEnvelope(response.status));
  });
  if (!response.ok) {
    const detail = parseCoachUpstreamError(payload, requestId);
    const text = `Coach patch summary HTTP ${response.status}${detail ? ` ${detail.code}: ${detail.message}` : " (invalid error body)"}`;
    throw new SummaryFailure(text, detail ? detail.retryable : transientWithoutEnvelope(response.status));
  }
  const parsed = coachPatchSummaryResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new SummaryFailure(`Coach patch summary broke its contract: ${parsed.error.issues[0]?.message ?? "invalid"}`, false);
  }
  if (parsed.data.request_id !== requestId) throw new SummaryFailure("Coach patch summary answered a different request id", false);
  return { ...parsed.data, clipped };
}

/**
 * One PATCH alert per announced patch, once: the alert rows and the announced mark commit
 * together, so a crash can neither drop the announcement nor send it twice.
 */
export function announcePatchSummaries(db: Database.Database = getDb(), now: () => number = Date.now): number {
  let announced = 0;
  for (const candidate of unannouncedTerminal(db)) {
    const sent = db.transaction(() => {
      if (!markAnnounced(candidate.threadId, new Date(now()).toISOString(), db)) return false;
      firePatchAlert({ ...candidate, message: patchAlertMessage(storedSummary(candidate)) }, db);
      return true;
    })();
    if (sent) announced += 1;
  }
  return announced;
}

/** A failed job, or a stored summary that no longer parses, announces as "summary unavailable". */
function storedSummary(candidate: AnnounceCandidate): PatchSummary | null {
  if (candidate.status !== "done" || candidate.summaryJson == null) return null;
  const parsed = patchSummarySchema.safeParse(JSON.parse(candidate.summaryJson));
  if (!parsed.success) {
    console.error(`[patch-summary] stored summary for thread ${candidate.threadId} no longer parses; announcing without it`);
    return null;
  }
  return parsed.data;
}
