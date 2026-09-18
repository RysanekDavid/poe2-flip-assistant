import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "../../../../../auth/session";
import { getDefaultLeague, MAX_LEAGUE_LENGTH } from "../../../../../core/leagueState";
import { switchDefaultLeague } from "../../../../../core/leagueSwitch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  league: z.string().trim().min(1, "league must not be empty").max(MAX_LEAGUE_LENGTH),
});

/**
 * PUT /api/settings/league/default { league } → move the app default league (owner only).
 *
 * The default is what a user who never picked a league sees, and what the poller, the Coach and
 * the shared trade2 pipelines run under. Nothing is purged: every market table is league-scoped,
 * so the previous league's history stays queryable and switching back restores it instantly.
 */
export async function PUT(req: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "bad request" }, { status: 400 });
  }

  const outcome = await switchDefaultLeague(user.role, parsed.data.league);
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  return NextResponse.json({ default: outcome.league, ratesSource: outcome.ratesSource });
}

/** GET /api/settings/league/default → the app default league (any signed-in user). */
export async function GET(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ default: getDefaultLeague(), canSetDefault: user.role === "owner" });
}
