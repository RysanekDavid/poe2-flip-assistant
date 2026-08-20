import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../../auth/session";
import {
  CoachHistoryError,
  deleteCoachConversation,
  getCoachConversation,
  renameCoachConversation,
} from "../../../../../db/coachHistoryQueries";
import { coachRenameRequestSchema } from "../../../../../lib/coachHistoryContract";
import { coachUuidSchema } from "../../../../../lib/coachContract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const identity = await identityFor(context);
  if (identity instanceof NextResponse) return identity;
  try {
    return NextResponse.json(getCoachConversation(identity.userId, identity.id));
  } catch (error: unknown) {
    return historyFailure(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const identity = await identityFor(context);
  if (identity instanceof NextResponse) return identity;
  const parsed = coachRenameRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid title" }, { status: 400 });
  try {
    return NextResponse.json({
      conversation: renameCoachConversation(identity.userId, identity.id, parsed.data.title),
    });
  } catch (error: unknown) {
    return historyFailure(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const identity = await identityFor(context);
  if (identity instanceof NextResponse) return identity;
  try {
    deleteCoachConversation(identity.userId, identity.id);
    return new NextResponse(null, { status: 204 });
  } catch (error: unknown) {
    return historyFailure(error);
  }
}

async function identityFor(
  context: RouteContext,
): Promise<{ userId: number; id: string } | NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = coachUuidSchema.safeParse((await context.params).id);
  if (!parsed.success) return NextResponse.json({ error: "not found" }, { status: 404 });
  return { userId: user.id, id: parsed.data };
}

function historyFailure(error: unknown): NextResponse {
  if (error instanceof CoachHistoryError && error.code === "not_found") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  throw error;
}
