import { z } from "zod";

export const coachUuidSchema = z.string().uuid();
const requestIdSchema = z.string().regex(/^[a-f0-9]{24,32}$/);

export const coachErrorCodeSchema = z.enum([
  "tool_invalid_input",
  "tool_no_result",
  "tool_source_unavailable",
  "provider_timeout",
  "provider_rejected",
  "request_rejected",
  "contract_violation",
  "rate_limited",
  "thread_busy",
  "conversation_busy",
  "stale_conversation",
  "idempotency_conflict",
  "conversation_full",
  "internal",
]);

export const coachErrorResponseSchema = z.object({
  error: z.object({
    code: coachErrorCodeSchema,
    message: z.string().min(1),
    requestId: requestIdSchema,
    retryable: z.boolean(),
    resetConversation: z.boolean(),
  }),
});

export const coachUpstreamErrorSchema = z.object({
  error: z.object({
    code: coachErrorCodeSchema,
    message: z.string().min(1),
    request_id: requestIdSchema,
    retryable: z.boolean(),
    reset_conversation: z.boolean(),
  }),
});

export const coachSourceSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["market", "live", "knowledge", "web", "game_data"]),
  title: z.string().min(1),
  url: z.string().url().regex(/^https?:\/\//i).nullable(),
}).strict();

export const coachBrowserRequestSchema = z.object({
  message: z.string().trim().min(1).max(8_000),
  conversationId: coachUuidSchema,
  turnId: coachUuidSchema,
  expectedTurnCount: z.number().int().min(0).max(50),
}).strict();

const tokenCountSchema = z.number().int().nonnegative();

/** Per-turn cost/latency telemetry from FastAPI; carries no conversation content. */
export const coachTurnUsageSchema = z.object({
  input_tokens: tokenCountSchema,
  output_tokens: tokenCountSchema,
  total_tokens: tokenCountSchema,
  model_calls: tokenCountSchema,
  duration_ms: tokenCountSchema,
}).strict();

export const coachUpstreamResponseSchema = z.object({
  thread_id: coachUuidSchema,
  request_id: requestIdSchema,
  // Trim so a whitespace-only answer fails loudly here instead of bricking the
  // conversation at FastAPI history validation on the next turn; the 64k cap in
  // UTF-16 units keeps stored answers readable by coachHistoryMessageSchema.
  answer: z.string().trim().min(1).max(64_000),
  tools_used: z.array(z.string().min(1)),
  processors_used: z.array(z.string().min(1)),
  sources: z.array(coachSourceSchema),
  usage: coachTurnUsageSchema,
});

export const coachBrowserResponseSchema = z.object({
  conversationId: coachUuidSchema,
  turnId: coachUuidSchema,
  turnCount: z.number().int().min(1).max(50),
  replayed: z.boolean(),
  requestId: requestIdSchema,
  answer: z.string().min(1),
  toolsUsed: z.array(z.string().min(1)),
  processorsUsed: z.array(z.string().min(1)),
  sources: z.array(coachSourceSchema),
});

export const coachHealthSchema = z.object({
  status: z.enum(["ok", "degraded"]),
  market_ready: z.boolean(),
  knowledge_ready: z.boolean(),
  item_data_ready: z.boolean(),
  model_configured: z.boolean(),
  web_search_ready: z.boolean(),
  model: z.string().min(1),
  patch_monitor_ready: z.boolean(),
  game_data_patch: z.string().min(1).nullable(),
  latest_official_patch: z.string().min(1).nullable(),
  recommendations_ready: z.boolean(),
  patch_checked_at: z.string().datetime().nullable().optional(),
  pending_patch_reviews: z.number().int().nonnegative(),
});

/** Validate and translate one correlated FastAPI error without exposing unknown fields. */
export function parseCoachUpstreamError(
  body: unknown,
  expectedRequestId: string,
): CoachError | null {
  const parsed = coachUpstreamErrorSchema.safeParse(body);
  if (!parsed.success || parsed.data.error.request_id !== expectedRequestId) return null;
  return {
    code: parsed.data.error.code,
    message: parsed.data.error.message,
    requestId: expectedRequestId,
    retryable: parsed.data.error.retryable,
    resetConversation: parsed.data.error.reset_conversation,
  };
}

export type CoachBrowserResponse = z.infer<typeof coachBrowserResponseSchema>;
export type CoachSource = z.infer<typeof coachSourceSchema>;
export type CoachTurnUsage = z.infer<typeof coachTurnUsageSchema>;
export type CoachError = z.infer<typeof coachErrorResponseSchema>["error"];
