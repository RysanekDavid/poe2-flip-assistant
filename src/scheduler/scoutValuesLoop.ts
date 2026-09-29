import { withHeartbeat } from "../core/heartbeat";
import { getPolledLeagues } from "../core/leagueUsers";
import { SCOUT_VALUES_INTERVAL_SEC, type SubsystemName } from "../core/subsystems";
import { refreshLineageValues, refreshUniqueValues } from "../core/valuation";

/**
 * poe2scout unique and lineage-gem prices (item_values), refreshed from the poller for every polled
 * league instead of only when a balance read happens to run. The loop ticks hourly; each refresh
 * keeps its own 6h freshness guard, so scout is hit ~4× a day per league. Uniques and lineage
 * record separate heartbeats: a failing lineage fetch turns its own row red and is never masked
 * by fresh uniques.
 */
export interface ScoutValuesDeps {
  leagues: () => string[];
  uniques: (league: string) => Promise<number>;
  lineage: (league: string) => Promise<number>;
}

const LIVE_DEPS: ScoutValuesDeps = { leagues: () => getPolledLeagues(), uniques: refreshUniqueValues, lineage: refreshLineageValues };

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export interface ScoutValuesResult {
  written: number;
  failed: string[];
}

async function tracked(name: SubsystemName, league: string, fn: () => Promise<number>, result: ScoutValuesResult): Promise<void> {
  try {
    result.written += await withHeartbeat(name, league, fn);
  } catch (e: unknown) {
    // recorded red by withHeartbeat; logged here so one failure does not stop the other refreshes
    console.error(`[scout-values] ${name} for ${league} failed:`, errText(e));
    result.failed.push(`${name}/${league}: ${errText(e)}`);
  }
}

/** One pass over every polled league: uniques, then lineage, each on its own heartbeat. */
export async function refreshScoutValues(deps: ScoutValuesDeps = LIVE_DEPS): Promise<ScoutValuesResult> {
  const result: ScoutValuesResult = { written: 0, failed: [] };
  for (const league of deps.leagues()) {
    await tracked("unique-values", league, () => deps.uniques(league), result);
    await tracked("lineage-values", league, () => deps.lineage(league), result);
  }
  return result;
}

/** Start the hourly tick (plus one run now so a fresh box prices uniques without waiting). */
export function startScoutValues(): void {
  let running = false;
  const run = (): void => {
    if (running) {
      console.warn("[scout-values] tick skipped — previous refresh still running");
      return;
    }
    running = true;
    refreshScoutValues()
      .then((r) => {
        if (r.written > 0) console.log(`[scout-values] wrote ${r.written} rows${r.failed.length > 0 ? `, ${r.failed.length} refresh(es) failed` : ""}`);
      })
      .catch((e: unknown) => console.error("[scout-values] refresh pass failed:", errText(e)))
      .finally(() => {
        running = false;
      });
  };
  setInterval(run, SCOUT_VALUES_INTERVAL_SEC * 1000);
  run();
}
