import { z } from "zod";
import {
  coachBrowserRequestSchema,
  coachBrowserResponseSchema,
  coachErrorResponseSchema,
  coachHealthSchema,
  type CoachBrowserResponse,
  type CoachError,
} from "../../lib/coachContract";
import {
  coachConversationDetailSchema,
  coachConversationListSchema,
  coachConversationSummarySchema,
  type CoachConversationDetail,
  type CoachConversationSummary,
} from "../../lib/coachHistoryContract";

export type CoachHealth = z.infer<typeof coachHealthSchema>;

export class CoachApiError extends Error {
  public readonly status: number;
  public readonly detail: CoachError;

  public constructor(detail: CoachError, status: number) {
    super(detail.message);
    this.name = "CoachApiError";
    this.status = status;
    this.detail = detail;
  }
}

export async function sendCoachMessage(
  message: string,
  conversationId: string,
  turnId: string,
  expectedTurnCount: number,
  signal?: AbortSignal,
): Promise<CoachBrowserResponse> {
  const payload = coachBrowserRequestSchema.parse({
    message, conversationId, turnId, expectedTurnCount,
  });
  const response = await fetch("/api/coach/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
  return parseResponse(response, coachBrowserResponseSchema);
}

export async function fetchCoachConversations(
  signal?: AbortSignal,
): Promise<CoachConversationSummary[]> {
  const response = await fetch("/api/coach/conversations", { signal, cache: "no-store" });
  return (await parseResponse(response, coachConversationListSchema)).conversations;
}

export async function fetchCoachConversation(
  conversationId: string,
  signal?: AbortSignal,
): Promise<CoachConversationDetail> {
  const response = await fetch(`/api/coach/conversations/${encodeURIComponent(conversationId)}`, {
    signal,
    cache: "no-store",
  });
  return parseResponse(response, coachConversationDetailSchema);
}

export async function renameCoachConversation(
  conversationId: string,
  title: string,
): Promise<CoachConversationSummary> {
  const response = await fetch(`/api/coach/conversations/${encodeURIComponent(conversationId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  const schema = z.object({ conversation: coachConversationSummarySchema }).strict();
  return (await parseResponse(response, schema)).conversation;
}

export async function deleteCoachConversation(conversationId: string): Promise<void> {
  const response = await fetch(`/api/coach/conversations/${encodeURIComponent(conversationId)}`, {
    method: "DELETE",
  });
  if (!response.ok) await parseResponse(response, z.never());
}

export async function fetchCoachHealth(signal?: AbortSignal): Promise<CoachHealth> {
  const response = await fetch("/api/coach/health", { signal });
  return parseResponse(response, coachHealthSchema);
}

async function parseResponse<T>(response: Response, schema: z.ZodType<T>): Promise<T> {
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = coachErrorResponseSchema.safeParse(body);
    const detail: CoachError = parsed.success
      ? parsed.data.error
      : {
          code: "internal",
          message: `Coach request failed (${response.status})`,
          requestId: "unknown",
          retryable: false,
          resetConversation: false,
        };
    throw new CoachApiError(
      detail,
      response.status,
    );
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new CoachApiError(
      {
        code: "contract_violation",
        message: "Coach returned invalid data.",
        requestId: "unknown",
        retryable: false,
        resetConversation: false,
      },
      response.status,
    );
  }
  return parsed.data;
}

