import type { UserRole } from "../db/userQueries";
import { fireLeagueAlert } from "./leagueAlerts";
import { getLeagueList } from "./leagueList";
import { getDefaultLeague, setActiveLeague } from "./leagueState";
import { clearUserLeague, leagueForUser, ownLeague, sameLeague, setUserLeague } from "./leagueUsers";
import { bootstrapRatesForLeague } from "./rateSync";
import { baseLeagueName, leagueFirstSeen } from "../db/leagueQueries";

/**
 * The two league switches, as functions rather than route bodies: one that moves the CALLER's
 * own view (any member) and one that moves the app default for everyone (owner only).
 *
 * They live here so the rules — validation against GGG's league list, the bootstrap-rates
 * budget, who may do what — are testable without standing up HTTP and a session cookie. The
 * routes are thin wrappers.
 */

/** How long a switch waits for bootstrap rates before answering without them. */
const BOOTSTRAP_BUDGET_MS = 8_000;

export type SwitchOutcome =
  | { ok: true; league: string; ratesSource: string | null }
  | { ok: false; error: string; status: 400 | 403 | 503 };

/** The two side-effecting reads, injectable so the tests never touch the network. */
export interface SwitchDeps {
  leagueNames: () => Promise<string[]>;
  bootstrap: (league: string) => Promise<string>;
}

const LIVE_DEPS: SwitchDeps = {
  leagueNames: cachedLeagueNames,
  bootstrap: bootstrapRatesForLeague,
};

/**
 * League names GGG's trade2 list knows (core/leagueList: shared cache, last good list on a
 * failed refresh, throws only with nothing cached), in NEWEST-FIRST order. GGG's list carries no
 * dates, so ordering comes from our league_registry chronology — seeded history plus first-sighting
 * stamps for new leagues.
 */
export async function cachedLeagueNames(): Promise<string[]> {
  return orderNewestFirst((await getLeagueList()).names);
}

/**
 * Newest league first by our own first-seen chronology; HC/SSF variants inherit their base
 * league's position; names the registry has never seen (only the permanent Standard/Hardcore,
 * by construction) sink to the bottom. Stable for equal stamps.
 */
export function orderNewestFirst(
  names: readonly string[],
  database?: import("better-sqlite3").Database,
): string[] {
  const seen = leagueFirstSeen(database);
  const stamp = (name: string) => seen.get(baseLeagueName(name).toLowerCase()) ?? "";
  return [...names].sort((a, b) => stamp(b).localeCompare(stamp(a)));
}

type Resolved = { league: string } | { error: string; status: 400 | 503 };

/**
 * GGG's spelling of the requested league, or a reason we refuse to store it.
 *
 * League names reach URLs and SQL as exact values (poe2scout and the exchange digest match them
 * case-sensitively), so storing "forbidden rites" would empty every panel. We store GGG's
 * trade2 id or refuse.
 */
async function resolveAgainstList(requested: string, deps: SwitchDeps): Promise<Resolved> {
  let known: string[];
  try {
    known = await deps.leagueNames();
  } catch (err) {
    // Fail loud: an unvalidated switch would point every price source at a league that may not
    // exist, and start accumulating market history under a name nothing else will ever match.
    return {
      error: `could not load GGG's league list to verify the league: ${err instanceof Error ? err.message : String(err)}`,
      status: 503,
    };
  }

  const match = known.find((name) => name.toLowerCase() === requested.toLowerCase());
  if (!match) {
    return { error: `unknown league "${requested}". GGG lists: ${known.join(", ")}`, status: 400 };
  }
  return { league: match };
}

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

/**
 * Give the target league rates before the next poll cycle, so Div/Chaos/Ex are on screen the
 * moment the view changes instead of after five minutes of "rates unavailable". Bounded: the
 * switch is already committed, and past the budget the fetch finishes in the background.
 */
async function bootstrapWithinBudget(league: string, deps: SwitchDeps): Promise<string> {
  return withBudget(deps.bootstrap(league), BOOTSTRAP_BUDGET_MS);
}

/**
 * Point ONE user's view at another league, or — with `requested: null` — un-pin them so they
 * follow the app default again.
 *
 * A view preference: available to every member, fires no alert, purges nothing, and leaves the
 * app default and every other account alone. Un-pinning matters because a user who pinned the
 * current challenge league by name would otherwise be stranded on it forever once the owner moves
 * the default to the next one.
 */
export async function switchViewLeague(
  userId: number,
  requested: string | null,
  deps: SwitchDeps = LIVE_DEPS,
): Promise<SwitchOutcome> {
  if (requested === null) {
    clearUserLeague(userId);
    const league = getDefaultLeague();
    return { ok: true, league, ratesSource: await bootstrapWithinBudget(league, deps) };
  }

  // No-op only against the user's OWN pin. A follower selecting the current default BY NAME
  // is asking to pin it (so the owner moving the default later will not silently move them).
  const pinned = ownLeague(userId);
  if (pinned !== null && sameLeague(requested, pinned)) {
    return { ok: true, league: leagueForUser(userId), ratesSource: null };
  }

  const resolved = await resolveAgainstList(requested, deps);
  if ("error" in resolved) return { ok: false, error: resolved.error, status: resolved.status };

  const { league } = setUserLeague(userId, resolved.league);
  return { ok: true, league, ratesSource: await bootstrapWithinBudget(league, deps) };
}

/**
 * Move the app DEFAULT league — what users who never chose one see, and the league the poller,
 * the Coach and the shared trade2 pipelines run under. Market-wide news, so it still lands in
 * every feed; owner only, and still no purge.
 */
export async function switchDefaultLeague(
  role: UserRole,
  requested: string,
  deps: SwitchDeps = LIVE_DEPS,
): Promise<SwitchOutcome> {
  if (role !== "owner") return { ok: false, error: "owner only", status: 403 };

  const current = getDefaultLeague();
  if (sameLeague(requested, current)) {
    return { ok: true, league: current, ratesSource: null };
  }

  const resolved = await resolveAgainstList(requested, deps);
  if ("error" in resolved) return { ok: false, error: resolved.error, status: resolved.status };

  const { league, changed } = setActiveLeague(resolved.league);
  if (!changed) return { ok: true, league, ratesSource: null };

  try {
    fireLeagueAlert(league, `Default league is now ${league} — each league keeps its own history`);
  } catch (caught: unknown) {
    // The switch is already committed; a failed feed notification must not turn a successful
    // request into a 500 that a retry would then silently no-op.
    console.warn("default league switch alert failed", caught);
  }
  return { ok: true, league, ratesSource: await bootstrapWithinBudget(league, deps) };
}
