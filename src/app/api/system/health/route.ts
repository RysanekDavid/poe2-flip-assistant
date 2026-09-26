import { getCurrentUser } from "../../../../auth/session";
import { systemHealthResponse } from "../../../../core/systemHealth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/system/health (owner only) → poller loop heartbeats with stale flags, Coach health,
 * DB size + freelist, free disk, deployed build and the shared trade2 governor state.
 */
export async function GET(): Promise<Response> {
  return systemHealthResponse(await getCurrentUser());
}
