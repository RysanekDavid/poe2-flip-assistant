import { getCurrentUser } from "../../../../auth/session";
import { navModeGet, navModePost } from "../../../../core/learn/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/settings/nav-mode → { nav_mode } of the signed-in user. */
export async function GET(): Promise<Response> {
  return navModeGet(await getCurrentUser());
}

/** POST /api/settings/nav-mode { nav_mode: "beginner" | "advanced" } → switch this user's nav. */
export async function POST(req: Request): Promise<Response> {
  return navModePost(await getCurrentUser(), req);
}
