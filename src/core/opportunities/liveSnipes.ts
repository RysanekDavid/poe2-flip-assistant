import type { OutcomeRow } from "../../db/snipeOutcomeQueries";
import type { LiveSnipe } from "../../lib/opportunitiesContract";
import type { SnipeCard } from "../../lib/snipeCard";
import { listingAgeMin } from "../snipeGate";

/**
 * Which of a viewer's SNIPE alerts are still worth buying: the listing is no older than the snipe
 * gate's own freshness limit and the outcome tracker has not seen it gone. Everything older is in
 * the Alerts feed already; Opportunities shows only what can still be acted on.
 */

export const LIVE_SNIPES_LIMIT = 6;

export interface SnipeAlertRow {
  alertId: number;
  /** The listing id (alerts.item_id for SNIPE rows). */
  listingId: string;
  league: string | null;
  seen: number;
  /** sqlite UTC text ("2026-09-30 12:00:00"). */
  createdAt: string;
  card: SnipeCard;
}

/** sqlite CURRENT_TIMESTAMP text → ISO, so listingAgeMin reads it as UTC. */
const sqliteIso = (at: string): string => (at.includes("T") ? at : `${at.replace(" ", "T")}Z`);

/** Listings a re-check found gone, at either checkpoint. */
export function goneListings(rows: readonly OutcomeRow[]): Set<string> {
  return new Set(rows.filter((r) => r.check_2h === "gone" || r.check_24h === "gone").map((r) => r.listing_id));
}

export function selectLiveSnipes(
  rows: readonly SnipeAlertRow[],
  gone: ReadonlySet<string>,
  opts: { viewerLeague: string; freshMinutes: number; nowMs: number; limit?: number },
): LiveSnipe[] {
  const seen = new Set<string>();
  const live: LiveSnipe[] = [];
  for (const r of rows) {
    if (seen.has(r.listingId) || gone.has(r.listingId)) continue;
    seen.add(r.listingId);
    const age = listingAgeMin(r.card.listedAt ?? sqliteIso(r.createdAt), opts.nowMs);
    if (!(age <= opts.freshMinutes)) continue;
    const foreign = r.league != null && r.league.toLowerCase() !== opts.viewerLeague.toLowerCase();
    live.push({ alertId: r.alertId, listingId: r.listingId, seen: r.seen, createdAt: r.createdAt, foreignLeague: foreign ? r.league : null, card: r.card });
  }
  return live.sort((a, b) => b.card.marginPct - a.card.marginPct).slice(0, opts.limit ?? LIVE_SNIPES_LIMIT);
}
