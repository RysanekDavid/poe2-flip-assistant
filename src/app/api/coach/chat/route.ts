import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../auth/session";
import { config } from "../../../../config/env";
import {
  CoachHistoryError,
  beginCoachTurn,
  completeCoachTurn,
  releaseCoachTurn,
  type ModelHistoryMessage,
  type StoredCoachTurn,
} from "../../../../db/coachHistoryQueries";
import {
  coachBrowserRequestSchema,
  coachErrorResponseSchema,
  coachUpstreamResponseSchema,
  parseCoachUpstreamError,
  type CoachError,
} from "../../../../lib/coachContract";
import {
  coachEndpoint,
  coachPublicStatus,
  createCoachRequestId,
  deriveCoachActorToken,
  deriveCoachThreadId,
} from "../../../../lib/coachServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const requestId = createCoachRequestId();
  const body: unknown = await request.json().catch(() => null);
  const parsed = coachBrowserRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: publicError("request_rejected", "Invalid Coach request.", requestId) },
      { status: 400 },
    );
  }

  try {
    const threadId = deriveCoachThreadId(
      user.id,
      parsed.data.conversationId,
      config.coach.threadSecret,
    );
    const actorToken = deriveCoachActorToken(user.id, config.coach.proxySecret);
    // Lease must outlive the slowest inference even when COACH_TIMEOUT_MS is raised.
    const leaseMs = config.coach.timeoutMs + 20_000;
    const started = beginCoachTurn(user.id, { ...parsed.data, leaseMs });
    if (started.kind === "replay") {
      return NextResponse.json(browserTurn(started.turn, requestId, started.turnCount, true));
    }
    try {
      const response = await callCoach(
        parsed.data.message,
        threadId,
        requestId,
        actorToken,
        started.history,
      );
      const stored = completeCoachTurn(user.id, {
        ...parsed.data,
        answer: response.answer,
        toolsUsed: response.tools_used,
        processorsUsed: response.processors_used,
        sources: response.sources,
      });
      return NextResponse.json(browserTurn(stored, response.request_id, stored.ordinal, false));
    } catch (error: unknown) {
      releaseCoachTurn(user.id, parsed.data.conversationId, parsed.data.turnId);
      throw error;
    }
  } catch (error: unknown) {
    if (error instanceof CoachUpstreamError && error.publicStatus === 503) {
      console.warn(`Coach unavailable: ${error.message}`);
    } else {
      console.error("Coach request failed", error);
    }
    const detail = coachError(error, requestId);
    return NextResponse.json(
      { error: detail },
      { status: publicStatus(error) },
    );
  }
}

class CoachUpstreamError extends Error {
  public readonly publicStatus: number;
  public readonly detail: CoachError;

  public constructor(detail: CoachError, status: number) {
    super(detail.message);
    this.name = "CoachUpstreamError";
    this.publicStatus = coachPublicStatus(status);
    this.detail = detail;
  }
}

async function callCoach(
  message: string,
  threadId: string,
  requestId: string,
  actorToken: string,
  history: ModelHistoryMessage[],
) {
  const response = await fetch(coachEndpoint(config.coach.apiUrl, "/chat"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Coach-Request-Id": requestId,
      "X-Coach-Actor": actorToken,
    },
    body: JSON.stringify({ message, thread_id: threadId, history }),
    cache: "no-store",
    signal: AbortSignal.timeout(config.coach.timeoutMs),
  });
  if (!response.ok) throw new CoachUpstreamError(await upstreamError(response, requestId), response.status);
  const body: unknown = await response.json();
  const parsed = coachUpstreamResponseSchema.safeParse(body);
  if (
    !parsed.success ||
    parsed.data.thread_id !== threadId ||
    parsed.data.request_id !== requestId
  ) {
    throw new Error("Coach API returned an invalid response contract");
  }
  return parsed.data;
}

async function upstreamError(response: Response, requestId: string): Promise<CoachError> {
  const body: unknown = await response.json().catch(() => null);
  return parseCoachUpstreamError(body, requestId)
    ?? fallbackError(requestId, "Coach API returned an invalid error contract.");
}

function coachError(error: unknown, requestId: string): CoachError {
  if (error instanceof CoachUpstreamError) return error.detail;
  if (error instanceof CoachHistoryError) return historyError(error.code, requestId);
  if (error instanceof Error && error.name === "TimeoutError") {
    return {
      code: "provider_timeout",
      message: "Coach timed out while checking its sources.",
      requestId,
      retryable: true,
      resetConversation: false,
    };
  }
  return fallbackError(requestId, "Coach request failed.");
}

function fallbackError(requestId: string, message: string): CoachError {
  return publicError("internal", message, requestId, false, false);
}

function publicStatus(error: unknown): number {
  if (error instanceof CoachUpstreamError) return error.publicStatus;
  if (error instanceof CoachHistoryError) return error.code === "not_found" ? 404 : 409;
  return 503;
}

function historyError(code: CoachHistoryError["code"], requestId: string): CoachError {
  const details = {
    conversation_busy: ["This conversation is processing another turn.", true],
    stale_conversation: ["This conversation changed. Reload it and try again.", true],
    idempotency_conflict: ["This turn ID was already used for another prompt.", false],
    conversation_full: ["This conversation reached 50 turns. Continue in a new chat.", false],
    not_found: ["Conversation not found.", false],
  } as const;
  const [message, retryable] = details[code];
  const publicCode = code === "not_found" ? "internal" : code;
  return publicError(publicCode, message, requestId, retryable, false);
}

function browserTurn(
  turn: StoredCoachTurn,
  requestId: string,
  turnCount: number,
  replayed: boolean,
) {
  return {
    conversationId: turn.conversationId,
    turnId: turn.turnId,
    turnCount,
    replayed,
    requestId,
    answer: turn.assistantAnswer,
    toolsUsed: turn.toolsUsed,
    processorsUsed: turn.processorsUsed,
    sources: turn.sources,
  };
}

function publicError(
  code: CoachError["code"],
  message: string,
  requestId: string,
  retryable = false,
  resetConversation = false,
): CoachError {
  return coachErrorResponseSchema.parse({
    error: {
      code,
      message,
      requestId,
      retryable,
      resetConversation,
    },
  }).error;
}
