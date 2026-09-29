import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../auth/session";
import { listPatches } from "../../../db/patchSummaryQueries";
import { patchesQuerySchema, patchesResponseSchema, type PatchesResponse } from "../../../lib/patchesContract";
import { toPatchListItem } from "../../../lib/patchesView";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/patches?limit=1..50&before=<thread id> → official patch threads newest first, each with
 * its AI summary state. Bodies are left out (they can be 100k+ characters); the detail route
 * serves one on demand. Shared data: every signed-in user sees the same list.
 */
export async function GET(request: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const query = patchesQuerySchema.safeParse({
    limit: params.get("limit") ?? undefined,
    before: params.get("before") ?? undefined,
  });
  if (!query.success) return NextResponse.json({ error: "invalid query" }, { status: 400 });
  const isOwner = user.role === "owner";
  const rows = listPatches(query.data.limit, query.data.before ?? null);
  const last = rows.at(-1);
  const body: PatchesResponse = {
    patches: rows.map((row) => toPatchListItem(row, isOwner)),
    nextBefore: rows.length === query.data.limit && last ? last.sourceOrder : null,
    canResummarize: isOwner,
  };
  // Outgoing contract check: a malformed row fails this request loudly instead of the UI later.
  return NextResponse.json(patchesResponseSchema.parse(body));
}
