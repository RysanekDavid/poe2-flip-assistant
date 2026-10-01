import { getCurrentUser } from "../../../../auth/session";
import { cxShadowResponse } from "../../../../lib/cxShadowResponse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/system/cx-shadow?hours=24&league=… (owner only) → CX-derived shadow prices vs poe.ninja:
 * coverage, median/p90 deviation by method and the worst outliers. Same data as
 * `npm run cx:shadow-report`; league defaults to the owner's current one.
 */
export async function GET(req: Request): Promise<Response> {
  return cxShadowResponse(await getCurrentUser(), new URL(req.url));
}
