import { NextResponse } from "next/server";
import { z } from "zod";
import { fetchScoutLeagues } from "../../../../api/scoutClient";
import { getCurrentUser } from "../../../../auth/session";
import { fireLeagueAlert } from "../../../../core/leagueAlerts";
import { getActiveLeague, setActiveLeague, MAX_LEAGUE_LENGTH } from "../../../../core/leagueState";
import { bootstrapRatesForLeague } from "../../../../core/rateSync";

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

  // No-op: same league. Skip the scout round trip and don't cry wolf in everyone's alert feed.
  const current = getActiveLeague();
  if (requested.toLowerCase() === current.toLowerCase()) return NextResponse.json({ league: current });

  const resolved = await resolveAgainstScout(requested);
  if ("error" in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status });

  const { league, changed } = setActiveLeague(resolved.league);
  // `changed` is decided from a fresh read inside setActiveLeague, so a stale league cache
  // cannot turn a no-op PUT into an alert in everyone's feed.
  let ratesSource: string | null = null;
  if (changed) {
    try {
      fireLeagueAlert(league, `League switched to ${league} — each league keeps its own history`);
    } catch (caught: unknown) {
      // The switch is already committed; a failed feed notification must not turn a
      // successful PUT into a 500 that a retry would then silently no-op.
      console.warn("league switch alert failed", caught);
    }
    // Give the new league rates before the poller's first cycle, so Div/Chaos/Ex are on screen
    // immediately. Bounded, because the switch itself is already committed and the worst case
    // otherwise is three hour-steps plus a scout call — over a minute of a hanging PUT. Past the
    // budget the fetch finishes in the background and the header picks it up on its next poll.
    ratesSource = await withBudget(bootstrapRatesForLeague(league), BOOTSTRAP_BUDGET_MS);
  }
  return NextResponse.json({ league, ratesSource });
}

/** How long the PUT waits for bootstrap rates before answering without them. */
const BOOTSTRAP_BUDGET_MS = 8_000;

/**
 * Resolve `work` if it finishes within `ms`, else report "pending" and let it run on.
 *
 * The write it performs still lands; only this response stops waiting for it. `work` is a
 * never-throwing bootstrap, so there is no rejection to lose here.
 */
async function withBudget(work: Promise<string>, ms: number): Promise<string> {
  let timer: NodeJS.Timeout | undefined;
  const budget = new Promise<string>((resolve) => {
    timer = setTimeout(() => resolve("pending"), ms);
  });
  try {
    return await Promise.race([work, budget]);
  } finally {
    clearTimeout(timer);
  }
}

type Resolved = { league: string } | { error: string; status: 400 | 503 };

/** Canonical scout spelling for the requested league, or a reason we refuse to store it. */
async function resolveAgainstScout(requested: string): Promise<Resolved> {
  let known: string[];
  try {
    known = (await fetchScoutLeagues()).map((l) => l.name);
  } catch (err) {
    // Fail loud: an unvalidated switch would point every price source at a league that may not
    // exist, and start accumulating market history under a name nothing else will ever match.
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
