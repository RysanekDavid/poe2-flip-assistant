import { z } from "zod";
import {
  ENTITY_ID_PATTERN,
  POE2DB_URL_PATTERN,
  POECDN_ICON_PATTERN,
  entityKindSchema,
} from "../core/entities/schema";

export const coachUuidSchema = z.string().uuid();
const requestIdSchema = z.string().regex(/^[a-f0-9]{24,32}$/);

export const coachErrorCodeSchema = z.enum([
  "tool_invalid_input",
  "tool_no_result",
  "tool_source_unavailable",
  "provider_timeout",
  "provider_rejected",
  "provider_incomplete",
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

/**
 * A catalog entity the answer mentions (services/coach/src/entities/models.py CoachEntity).
 * `mentions` are exact substrings of the answer; the client wraps only those and the name.
 */
export const coachEntitySchema = z.object({
  id: z.string().regex(ENTITY_ID_PATTERN),
  name: z.string().min(1).max(160),
  kind: entityKindSchema,
  icon_url: z.string().regex(POECDN_ICON_PATTERN).nullable(),
  summary: z.string().min(1).max(4_000).nullable(),
  directions: z.string().min(1).max(2_000).nullable(),
  poe2db_url: z.string().url().regex(POE2DB_URL_PATTERN),
  mentions: z.array(z.string().min(1).max(160)).max(8),
  price_div: z.number().positive().finite().nullable(),
  price_at: z.string().datetime({ offset: true }).nullable(),
}).strict();
const coachEntitiesSchema = z.array(coachEntitySchema).max(20);
/** Matched item text the Coach gave no chip (past the cap, uncorroborated one-word unique). */
export const coachUnlinkedMentionsSchema = z.array(z.string().min(1).max(160)).max(40);

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
  // Optional: a Coach release older than this web release (rollback window) omits it.
  entities: coachEntitiesSchema.optional(),
  unlinked_mentions: coachUnlinkedMentionsSchema.optional(),
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
  entities: coachEntitiesSchema,
  unlinkedMentions: coachUnlinkedMentionsSchema,
});

export const coachHealthSchema = z.object({
  status: z.enum(["ok", "degraded"]),
  market_ready: z.boolean(),
  // Optional: a Coach release older than this web release (rollback window) omits them.
  market_schema_ready: z.boolean().optional(),
  market_fresh: z.boolean().optional(),
  knowledge_ready: z.boolean(),
  item_data_ready: z.boolean(),
  model_configured: z.boolean(),
  agent_ready: z.boolean().optional(),
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
export type CoachEntity = z.infer<typeof coachEntitySchema>;
export type CoachTurnUsage = z.infer<typeof coachTurnUsageSchema>;
export type CoachError = z.infer<typeof coachErrorResponseSchema>["error"];
