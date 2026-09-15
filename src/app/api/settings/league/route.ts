import { NextResponse } from "next/server";
import { z } from "zod";
import { fetchScoutLeagues } from "../../../../api/scoutClient";
import { getCurrentUser } from "../../../../auth/session";
import { fireLeagueAlert } from "../../../../core/leagueAlerts";
import { getActiveLeague, setActiveLeague, MAX_LEAGUE_LENGTH } from "../../../../core/leagueState";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/settings/league → the league the app is tracking right now. */
export async function GET(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ league: getActiveLeague() });
}

const Body = z.object({
  league: z.string().trim().min(1, "league must not be empty").max(MAX_LEAGUE_LENGTH),
});

/**
 * PUT /api/settings/league { league } → switch the tracked league at runtime (owner only).
 *
 * The requested name is resolved against poe2scout's league list first: scoutClient matches
 * `Value` CASE-SENSITIVELY, so storing "forbidden rites" would 502 every scout-backed panel
 * until someone re-PUT it. We store scout's canonical spelling or refuse.
 */
export async function PUT(req: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (user.role !== "owner") return NextResponse.json({ error: "owner only" }, { status: 403 });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "bad request" }, { status: 400 });
  }
  const requested = parsed.data.league;

  // No-op: same league. Don't purge history and don't cry wolf in everyone's alert feed.
  const current = getActiveLeague();
  if (requested.toLowerCase() === current.toLowerCase()) return NextResponse.json({ league: current });

  const resolved = await resolveAgainstScout(requested);
  if ("error" in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status });

  const { league, changed } = setActiveLeague(resolved.league);
  // `changed` is decided from a fresh read inside setActiveLeague, so a stale league cache
  // cannot turn a no-op PUT into an alert in everyone's feed.
  if (changed) {
    try {
      fireLeagueAlert(league, `League switched to ${league} — market history reset`);
    } catch (caught: unknown) {
      // The switch is already committed; a failed feed notification must not turn a
      // successful PUT into a 500 that a retry would then silently no-op.
      console.warn("league switch alert failed", caught);
    }
  }
  return NextResponse.json({ league });
}

type Resolved = { league: string } | { error: string; status: 400 | 503 };

/** Canonical scout spelling for the requested league, or a reason we refuse to store it. */
async function resolveAgainstScout(requested: string): Promise<Resolved> {
  let known: string[];
  try {
    known = (await fetchScoutLeagues()).map((l) => l.name);
  } catch (err) {
    // Fail loud: an unvalidated switch would point every price source at a league that may
    // not exist, AND purge the history we would need to roll back to.
    return {
      error: `could not reach poe2scout to verify the league: ${err instanceof Error ? err.message : String(err)}`,
      status: 503,
    };
  }

  const match = known.find((name) => name.toLowerCase() === requested.toLowerCase());
  if (!match) {
    return { error: `unknown league "${requested}". poe2scout knows: ${known.join(", ")}`, status: 400 };
  }
  return { league: match };
}
