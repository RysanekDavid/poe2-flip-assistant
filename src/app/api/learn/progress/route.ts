import { getCurrentUser } from "../../../../auth/session";
import { progressGet, progressPost } from "../../../../core/learn/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/learn/progress → the atlas checklist and the steps this user ticked. */
export async function GET(): Promise<Response> {
  return progressGet(await getCurrentUser());
}

/** POST /api/learn/progress { step_id, done } → tick/untick a step; returns the updated progress. */
export async function POST(req: Request): Promise<Response> {
  return progressPost(await getCurrentUser(), req, Date.now());
}
