import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../auth/session";
import { patchDetail, requestResummary } from "../../../../db/patchSummaryQueries";
import {
  patchActionSchema,
  patchDetailSchema,
  patchThreadIdSchema,
  resummarizeResponseSchema,
} from "../../../../lib/patchesContract";
import { toPatchDetail } from "../../../../lib/patchesView";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ threadId: string }>;
}

async function threadIdOf(context: RouteContext): Promise<number | null> {
  const parsed = patchThreadIdSchema.safeParse((await context.params).threadId);
  return parsed.success ? parsed.data : null;
}

/** GET /api/patches/:threadId → one patch with its stored headings and change list. */
export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const threadId = await threadIdOf(context);
  const row = threadId == null ? null : patchDetail(threadId);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(patchDetailSchema.parse(toPatchDetail(row, user.role === "owner")));
}

/**
 * POST /api/patches/:threadId {action:"resummarize"} (owner only) → queue a fresh summary even for
 * unchanged text, e.g. after a prompt change. It never re-announces; the poller runs it.
 */
export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (user.role !== "owner") return NextResponse.json({ error: "owner only" }, { status: 403 });
  const threadId = await threadIdOf(context);
  if (threadId == null) return NextResponse.json({ error: "not found" }, { status: 404 });
  const action = patchActionSchema.safeParse(await request.json().catch(() => null));
  if (!action.success) return NextResponse.json({ error: "invalid action" }, { status: 400 });
  const outcome = requestResummary(threadId);
  if (outcome === "not_found") return NextResponse.json({ error: "not found" }, { status: 404 });
  if (outcome === "no_body") {
    return NextResponse.json({ error: "this patch has no stored body to summarize" }, { status: 409 });
  }
  return NextResponse.json(resummarizeResponseSchema.parse({ status: outcome }));
}
