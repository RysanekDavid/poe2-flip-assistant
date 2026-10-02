import { CX_CURRENCY_IDS, isPrivateLeague, type CxDigest } from "../../api/cxClient";
import type { LeagueActivityRow } from "../../db/cxActivityQueries";

/**
 * One digest → per-league activity for every PUBLIC league in it (private "(PLnnn)" leagues are
 * never stored). A market counts when either side traded; Divine volume sums the Divine side of
 * markets that have one, so leagues compare in one unit.
 */
export function summarizeLeagueActivity(digest: CxDigest): LeagueActivityRow[] {
  const byLeague = new Map<string, LeagueActivityRow>();
  for (const m of digest.markets) {
    if (isPrivateLeague(m.league)) continue;
    const traded = Object.values(m.volume_traded).some((v) => v > 0);
    if (!traded) continue;
    const row = byLeague.get(m.league) ?? { league: m.league, hour: digest.next_change_id, markets: 0, divineVolume: 0 };
    row.markets += 1;
    if (m.market_pair.includes(CX_CURRENCY_IDS.divine)) row.divineVolume += m.volume_traded[CX_CURRENCY_IDS.divine] ?? 0;
    byLeague.set(m.league, row);
  }
  return [...byLeague.values()];
}
