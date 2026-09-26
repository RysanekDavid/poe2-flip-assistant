import { z } from "zod";

/**
 * GET /api/system/health (owner only). Shared by the route and the Settings System section so a
 * server-side shape change fails the client parse loudly instead of rendering blanks.
 */

/**
 * failing  — the latest run failed (newer error than success)
 * stale    — no success within the loop's stale window
 * never    — enabled, but no run recorded yet (fresh deploy, or the poller never started it)
 * idle     — per-league loop for a league nobody polls any more
 * disabled — switched off by configuration
 */
export const heartbeatStatusSchema = z.enum(["ok", "failing", "stale", "never", "idle", "disabled"]);
export type HeartbeatStatus = z.infer<typeof heartbeatStatusSchema>;

export const heartbeatViewSchema = z.object({
  name: z.string(),
  label: z.string(),
  hint: z.string(),
  league: z.string(),
  status: heartbeatStatusSchema,
  lastOkAt: z.string().nullable(),
  lastErrorAt: z.string().nullable(),
  lastError: z.string().nullable(),
  durationMs: z.number().nullable(),
  runs: z.number().int(),
  expectedSec: z.number().nullable(),
  staleAfterSec: z.number().nullable(),
});
export type HeartbeatView = z.infer<typeof heartbeatViewSchema>;

export const coachSummarySchema = z.discriminatedUnion("reachable", [
  z.object({
    reachable: z.literal(true),
    status: z.enum(["ok", "degraded"]),
    model: z.string(),
    marketReady: z.boolean(),
    marketFresh: z.boolean().nullable(),
    knowledgeReady: z.boolean(),
    modelConfigured: z.boolean(),
    agentReady: z.boolean().nullable(),
    patchMonitorReady: z.boolean(),
    pendingPatchReviews: z.number().int(),
  }),
  z.object({ reachable: z.literal(false), error: z.string() }),
]);
export type CoachSummary = z.infer<typeof coachSummarySchema>;

export const dbHealthSchema = z.object({
  fileBytes: z.number(),
  walBytes: z.number(),
  pageSize: z.number(),
  pageCount: z.number(),
  freelistCount: z.number(),
});

export const diskHealthSchema = z.object({ freeBytes: z.number().nullable(), error: z.string().nullable() });

export const tradeGovernorSchema = z.object({
  kind: z.enum(["search", "fetch"]),
  blockedUntil: z.string().nullable(),
  windows: z.array(z.object({ periodSec: z.number(), limit: z.number(), used: z.number() })),
});
export type TradeGovernorView = z.infer<typeof tradeGovernorSchema>;

export const systemHealthSchema = z.object({
  generatedAt: z.string(),
  build: z.string(),
  heartbeats: z.array(heartbeatViewSchema),
  db: dbHealthSchema,
  disk: diskHealthSchema,
  coach: coachSummarySchema,
  trade2: z.array(tradeGovernorSchema),
});
export type SystemHealth = z.infer<typeof systemHealthSchema>;
