import type { TradeCred } from "../api/tradeClient";
import { credForUser } from "../auth/credForUser";
import { recordTradeBalance } from "../core/balanceRead";
import { withHeartbeat } from "../core/heartbeat";
import { getDefaultLeague } from "../core/leagueState";
import { resolveRates, type ResolvedRates } from "../core/rates";
import { refreshUniqueValues } from "../core/valuation";
import { listUsers, type UserPublic } from "../db/userQueries";

/**
 * Scheduled net-worth snapshots, on exactly the path POST /api/balance/read takes: the default
 * league, rates from the shared resolveRates ladder (not a separate scout fetch), and
 * recordTradeBalance so truncation and gear-at-ask provenance are stored for auto reads too.
 */
export interface BalanceLoopDeps {
  league: () => string;
  users: () => UserPublic[];
  credFor: (user: UserPublic) => TradeCred | null;
  rates: (league: string) => ResolvedRates | null;
  record: typeof recordTradeBalance;
  refreshUniques: (league: string) => Promise<number>;
}

export interface BalanceRunResult {
  league: string;
  read: number;
  /** Users without a stored POESESSID + account name — not an error, nothing to read. */
  skipped: number;
  failed: string[];
}

const LIVE_DEPS: BalanceLoopDeps = {
  league: () => getDefaultLeague(),
  users: listUsers,
  credFor: credForUser,
  rates: resolveRates,
  record: recordTradeBalance,
  refreshUniques: refreshUniqueValues,
};

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/**
 * Daily-guarded scout unique-price refresh. Its failure must not block the currency read (the
 * web read behaves the same), but it is logged and recorded on its own heartbeat, never dropped.
 */
export async function refreshUniquesTracked(league: string, refresh: BalanceLoopDeps["refreshUniques"]): Promise<void> {
  try {
    await withHeartbeat("unique-values", "", () => refresh(league));
  } catch (e: unknown) {
    console.warn(`[balance] unique-price refresh failed — uniques valued from the older cache: ${errText(e)}`);
  }
}

/** Read every connected user's public-tab currency and store one snapshot each. */
export async function snapshotBalancesAll(deps: BalanceLoopDeps = LIVE_DEPS): Promise<BalanceRunResult> {
  const league = deps.league();
  await refreshUniquesTracked(league, deps.refreshUniques);
  const resolved = deps.rates(league);
  if (!resolved) throw new Error(`no exchange rates available for ${league} — cannot price balance snapshots`);

  const result: BalanceRunResult = { league, read: 0, skipped: 0, failed: [] };
  for (const user of deps.users()) {
    const cred = deps.credFor(user);
    if (!cred || !cred.account) {
      result.skipped++;
      continue;
    }
    try {
      const { scan } = await deps.record(user.id, league, cred.account, resolved.rates, cred);
      result.read++;
      console.log(
        `[balance] ${user.name}: ${scan.divine}d ${scan.exalted}ex ${scan.chaos}c (${scan.tabs.length} tabs, ${scan.unpriced} unpriced, rates ${resolved.source})`,
      );
      if (scan.truncated) console.warn(`[balance] ${user.name}: read ${scan.listingsSeen}/${scan.total} listings — snapshot is partial`);
    } catch (e: unknown) {
      console.error(`[balance] ${user.name} auto-read failed:`, errText(e));
      result.failed.push(`${user.name}: ${errText(e)}`);
    }
  }
  return result;
}

/** A user's failed read is the loop's failure too — the owner needs to know snapshots stopped. */
export function balanceProblem(r: BalanceRunResult): string | null {
  const first = r.failed[0];
  return first ? `${r.failed.length} of ${r.read + r.failed.length} read(s) failed — ${first}` : null;
}
