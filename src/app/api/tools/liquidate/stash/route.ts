import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../../auth/session";
import { getDefaultLeague } from "../../../../../core/leagueState";
import { leagueForUser } from "../../../../../core/leagueUsers";
import { resolveRates } from "../../../../../core/rates";
import { groupStashItems } from "../../../../../core/tools/liquidate/plan";
import { latestStashItems, type StashSnapshotHead } from "../../../../../db/balanceItemQueries";
import type { StashResponse } from "../../../../../lib/tools/liquidateContract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const READ_HINT = "use “read from trade” on the Wealth tab (the only step that spends a trade request)";

/** SQLite CURRENT_TIMESTAMP is UTC without a zone marker. */
function ageMinutes(fetchedAt: string, nowMs: number): number {
  const at = Date.parse(`${fetchedAt.replace(" ", "T")}Z`);
  if (Number.isNaN(at)) throw new Error(`balance snapshot has an unreadable fetched_at "${fetchedAt}"`);
  return Math.max(0, Math.round((nowMs - at) / 60_000));
}

function emptyReason(league: string, snapshot: StashSnapshotHead | null, rows: number, skippedOrbs: number): string {
  const defaultLeague = getDefaultLeague();
  if (snapshot == null) {
    return league === defaultLeague
      ? `no stash read in ${league} yet — ${READ_HINT}`
      : `stash reads run in ${defaultLeague}; you are viewing ${league}, which has none`;
  }
  if (rows === 0 && (snapshot.listed_seen ?? 0) > 0) return `your latest stash read predates item capture — ${READ_HINT} again`;
  if (rows === 0) return "your latest stash read saw no public listings — make the tab public, then read again";
  return `only raw currency (${skippedOrbs} Divine/Exalted/Chaos stacks) in your latest read — nothing to liquidate`;
}

/**
 * GET /api/tools/liquidate/stash → the items of the caller's latest stash read in their league,
 * merged per name, with its age. Reads the DB only — the read itself is the Wealth tab's button.
 */
export async function GET(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const league = leagueForUser(user.id);
  const resolved = resolveRates(league);
  if (!resolved) {
    return NextResponse.json({ error: `no exchange rates available for ${league} — cannot price your asks` }, { status: 409 });
  }
  const { snapshot, items: rows } = latestStashItems(user.id, league);
  const { items, skippedOrbs } = groupStashItems(rows, resolved.rates);
  const body: StashResponse = {
    league,
    items,
    reason: items.length > 0 ? null : emptyReason(league, snapshot, rows.length, skippedOrbs),
    fetchedAt: snapshot?.fetched_at ?? null,
    ageMin: snapshot == null ? null : ageMinutes(snapshot.fetched_at, Date.now()),
    skippedOrbs,
  };
  return NextResponse.json(body);
}
