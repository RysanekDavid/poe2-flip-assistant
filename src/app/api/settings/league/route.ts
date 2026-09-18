import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "../../../../auth/session";
import { getDefaultLeague, MAX_LEAGUE_LENGTH } from "../../../../core/leagueState";
import { cachedLeagueNames, switchViewLeague } from "../../../../core/leagueSwitch";
import { getPolledLeagues, leagueForUser, ownLeague } from "../../../../core/leagueUsers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/settings/league → this user's league, the app default, what they can switch to, and
 * which leagues the poller actually collects (a just-picked league has no data until it dwells).
 *
 * A scout outage returns an EMPTY `available` plus the reason rather than a 503: the caller is
 * the header dropdown, and losing the whole header because a list could not be refreshed is
 * worse than a disabled picker that says why.
 */
export async function GET(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let available: string[] = [];
  let availableError: string | null = null;
  try {
    available = await cachedLeagueNames();
  } catch (err: unknown) {
    availableError = err instanceof Error ? err.message : String(err);
    console.warn(`[league] league list unavailable: ${availableError}`);
  }

  return NextResponse.json({
    league: leagueForUser(user.id),
    default: getDefaultLeague(),
    // false = following the default, so the picker can show that as the selected option and the
    // user keeps moving with the default instead of being stranded on last league's name.
    pinned: ownLeague(user.id) != null,
    available,
    availableError,
    polled: getPolledLeagues(),
    canSetDefault: user.role === "owner",
  });
}

const Body = z.object({
  // null = un-pin: follow the app default again, and keep following it as the owner moves it.
  league: z.string().trim().min(1, "league must not be empty").max(MAX_LEAGUE_LENGTH).nullable(),
});

/**
 * PUT /api/settings/league { league } → switch the CALLER's view (any signed-in member), or
 * { league: null } → follow the app default.
 *
 * This is a view preference, not an admin operation: it changes nothing for anyone else, fires
 * no alert and deletes nothing. The app default lives behind PUT /api/settings/league/default.
 */
export async function PUT(req: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "bad request" }, { status: 400 });
  }

  const outcome = await switchViewLeague(user.id, parsed.data.league);
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  return NextResponse.json({
    league: outcome.league,
    ratesSource: outcome.ratesSource,
    pinned: parsed.data.league !== null,
  });
}
