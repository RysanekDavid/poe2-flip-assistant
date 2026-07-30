import { z } from "zod";
import {
  coachBrowserRequestSchema,
  coachBrowserResponseSchema,
  coachHealthSchema,
  type CoachBrowserResponse,
} from "../../lib/coachContract";

export type CoachHealth = z.infer<typeof coachHealthSchema>;

export class CoachApiError extends Error {
  public readonly status: number;

  public constructor(message: string, status: number) {
    super(message);
    this.name = "CoachApiError";
    this.status = status;
  }
}

export async function sendCoachMessage(
  message: string,
  conversationId: string,
  signal?: AbortSignal,
): Promise<CoachBrowserResponse> {
  const payload = coachBrowserRequestSchema.parse({ message, conversationId });
  const response = await fetch("/api/coach/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
  return parseResponse(response, coachBrowserResponseSchema);
}

export async function fetchCoachHealth(signal?: AbortSignal): Promise<CoachHealth> {
  const response = await fetch("/api/coach/health", { signal });
  return parseResponse(response, coachHealthSchema);
}

async function parseResponse<T>(response: Response, schema: z.ZodType<T>): Promise<T> {
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = z.object({ error: z.string() }).safeParse(body);
    throw new CoachApiError(
      parsed.success ? parsed.data.error : `Coach request failed (${response.status})`,
      response.status,
    );
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new CoachApiError("Coach returned invalid data.", response.status);
  return parsed.data;
}

