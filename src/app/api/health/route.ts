import { NextResponse } from "next/server";
import { latestFetchedAt } from "../../../db/marketQueries";
import { leagueForUser } from "../../../core/leagueUsers";
import { resolveRates } from "../../../core/rates";
import { scoutFetchedAt, fetchScout } from "../../../api/scoutClient";
import { buildIdentifier } from "../../../lib/buildInfo";
import { getCurrentUser } from "../../../auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Scout data is fetched on demand, so after a quiet stretch the cache goes stale until
// someone opens a scout-backed panel. Kick a refresh from here instead — the header polls
// this route every minute, so it self-heals.
const SCOUT_REFRESH_AFTER_MS = 30 * 60_000;

/**
 * GET /api/health — data freshness + current base rates for the header status strip.
 * ninja freshness comes from the DB (poller writes it, works across processes);
 * scout freshness is this web process's in-memory cache (null until first fetch).
 */
export async function GET(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const league = leagueForUser(user.id);
  const resolved = resolveRates(league);
  const scoutAt = scoutFetchedAt();
  if (scoutAt == null || Date.now() - scoutAt > SCOUT_REFRESH_AFTER_MS) {
    void fetchScout().catch((error: unknown) => {
      console.error("[health] scout refresh failed", error);
    }); // fire-and-forget; next poll reads the fresh timestamp
  }
  return NextResponse.json({
    league,
    ninjaFetchedAt: latestFetchedAt(league),
    scoutFetchedAt: scoutAt,
    rates: resolved?.rates ?? null,
    ratesSource: resolved?.source ?? null,
    ratesFetchedAt: resolved?.fetchedAt ?? null,
    build: buildIdentifier(),
  });
}
