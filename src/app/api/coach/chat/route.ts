import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../auth/session";
import { config } from "../../../../config/env";
import {
  coachBrowserRequestSchema,
  coachUpstreamResponseSchema,
} from "../../../../lib/coachContract";
import {
  coachEndpoint,
  coachPublicStatus,
  deriveCoachThreadId,
} from "../../../../lib/coachServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body: unknown = await request.json().catch(() => null);
  const parsed = coachBrowserRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid coach request" }, { status: 400 });
  }

  try {
    const threadId = deriveCoachThreadId(
      user.id,
      parsed.data.conversationId,
      config.coach.threadSecret,
    );
    const response = await callCoach(parsed.data.message, threadId);
    return NextResponse.json({
      conversationId: parsed.data.conversationId,
      answer: response.answer,
      toolsUsed: response.tools_used,
      processorsUsed: response.processors_used,
      sources: response.sources,
    });
  } catch (error: unknown) {
    if (error instanceof CoachUpstreamError && error.publicStatus === 503) {
      console.warn(`Coach unavailable: ${error.message}`);
    } else {
      console.error("Coach request failed", error);
    }
    return NextResponse.json(
      { error: coachError(error) },
      { status: error instanceof CoachUpstreamError ? error.publicStatus : 503 },
    );
  }
}

class CoachUpstreamError extends Error {
  public readonly publicStatus: number;

  public constructor(message: string, status: number) {
    super(message);
    this.name = "CoachUpstreamError";
    this.publicStatus = coachPublicStatus(status);
  }
}

async function callCoach(message: string, threadId: string) {
  const response = await fetch(coachEndpoint(config.coach.apiUrl, "/chat"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, thread_id: threadId }),
    cache: "no-store",
    signal: AbortSignal.timeout(config.coach.timeoutMs),
  });
  if (!response.ok) throw new CoachUpstreamError(await upstreamError(response), response.status);
  const body: unknown = await response.json();
  const parsed = coachUpstreamResponseSchema.safeParse(body);
  if (!parsed.success || parsed.data.thread_id !== threadId) {
    throw new Error("Coach API returned an invalid response contract");
  }
  return parsed.data;
}

async function upstreamError(response: Response): Promise<string> {
  const body: unknown = await response.json().catch(() => null);
  if (typeof body === "object" && body !== null && "detail" in body) {
    const detail = (body as { detail?: unknown }).detail;
    if (typeof detail === "string") return detail;
  }
  return `Coach API request failed (${response.status})`;
}

function coachError(error: unknown): string {
  if (error instanceof Error && error.name === "TimeoutError") {
    return "Coach timed out while checking its sources.";
  }
  return error instanceof Error ? error.message : "Coach failed for an unknown reason.";
}
