import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../auth/session";
import { config } from "../../../../config/env";
import { coachHealthSchema } from "../../../../lib/coachContract";
import { coachEndpoint } from "../../../../lib/coachServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const response = await fetch(coachEndpoint(config.coach.apiUrl, "/health"), {
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`Coach health failed (${response.status})`);
    const body: unknown = await response.json();
    return NextResponse.json(coachHealthSchema.parse(body));
  } catch (error: unknown) {
    console.error("Coach health check failed", error);
    return NextResponse.json({ error: "coach unavailable" }, { status: 503 });
  }
}
