import type Database from "better-sqlite3";
import { z } from "zod";
import { coachTurnUsageSchema, type CoachTurnUsage } from "../lib/coachContract";

/** Telemetry for one completed turn; the web layer adds its own end-to-end duration. */
export interface CoachUsageRecord {
  requestId: string;
  usage: CoachTurnUsage;
  proxyDurationMs: number;
}

const usageRecordSchema = z.object({
  requestId: z.string().regex(/^[a-f0-9]{24,32}$/),
  usage: coachTurnUsageSchema,
  proxyDurationMs: z.number().int().nonnegative(),
}).strict();

/**
 * Persist cost/latency for a turn inside the caller's completion transaction, so a recorded turn
 * always has its usage row and a failed completion leaves none. No prompt or answer text.
 */
export function insertCoachUsage(
  userId: number,
  record: CoachUsageRecord,
  completedAt: string,
  database: Database.Database,
): void {
  const { requestId, usage, proxyDurationMs } = usageRecordSchema.parse(record);
  database.prepare(`
    INSERT INTO coach_usage
      (user_id, request_id, model_calls, input_tokens, output_tokens, total_tokens,
       duration_ms, proxy_duration_ms, completed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    userId,
    requestId,
    usage.model_calls,
    usage.input_tokens,
    usage.output_tokens,
    usage.total_tokens,
    usage.duration_ms,
    proxyDurationMs,
    completedAt,
  );
}
