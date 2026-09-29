import { getCurrentUser } from "../../../auth/session";
import { entitiesGet } from "../../../core/learn/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/entities?q=&limit=8 → catalog typeahead with live price, sell route and pickup hint. */
export async function GET(req: Request): Promise<Response> {
  return entitiesGet(await getCurrentUser(), new URL(req.url), Date.now());
}
