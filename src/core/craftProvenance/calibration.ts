import type { CraftRecipe } from "../craftRecipes";
import type { HitRateView, RecipeProvenance } from "./schema";

/**
 * Logged attempts pull the curated hit rate toward what players actually hit, with shrinkage:
 *   effective = (hits + k · model) / (closed + k),  k = 20
 * so a handful of attempts nudges the estimate and 20 attempts weigh as much as the curated number.
 * The log is shared and self-reported, so the pooled sample is guarded against one account steering
 * it: it needs two or more users, no single user may supply more than half of it, and zero-cost
 * attempts (nothing spent, nothing proven) and attempts from before the recipe's verified patch are
 * dropped. Client-safe: no DB or fs imports — the rows come from craftProvenance/samples.ts.
 */
export const CALIBRATION_K = 20;
export const MIN_CALIBRATION_USERS = 2;
export const MAX_USER_SHARE = 0.5;

/** One closed attempt as logged. */
export interface AttemptRow {
  userId: number;
  outcome: "hit" | "brick";
  costDiv: number;
  /** SQLite CURRENT_TIMESTAMP text (UTC). */
  createdAt: string;
}

/** The pooled calibration sample for one recipe; `hits` may be fractional after the per-user cap. */
export interface AttemptStats {
  closed: number;
  hits: number;
  /** Distinct users with an eligible attempt (reported even when too few to pool). */
  users: number;
}

const sqliteMs = (ts: string): number => Date.parse(`${ts.replace(" ", "T")}Z`);

function perUser(rows: readonly AttemptRow[], cutoffMs: number | null): Map<number, { closed: number; hits: number }> {
  const by = new Map<number, { closed: number; hits: number }>();
  for (const r of rows) {
    if (!(r.costDiv > 0)) continue;
    const at = sqliteMs(r.createdAt);
    if (Number.isNaN(at)) throw new Error(`craft attempt has an unparseable created_at "${r.createdAt}"`);
    if (cutoffMs !== null && at < cutoffMs) continue;
    const u = by.get(r.userId) ?? { closed: 0, hits: 0 };
    u.closed += 1;
    if (r.outcome === "hit") u.hits += 1;
    by.set(r.userId, u);
  }
  return by;
}

/** Pure: eligible attempts → the pooled sample, empty unless 2+ users contributed. */
export function poolAttempts(rows: readonly AttemptRow[], cutoffMs: number | null): AttemptStats {
  const users = [...perUser(rows, cutoffMs).values()];
  if (users.length < MIN_CALIBRATION_USERS) return { closed: 0, hits: 0, users: users.length };
  const total = users.reduce((n, u) => n + u.closed, 0);
  // only the largest contributor can exceed half the sample; clamp it to the rest, scaling its hits
  const top = users.reduce((a, b) => (b.closed > a.closed ? b : a));
  const rest = total - top.closed;
  const maxTop = (rest * MAX_USER_SHARE) / (1 - MAX_USER_SHARE);
  const topClosed = Math.min(top.closed, maxTop);
  // a user is only listed once they have a closed attempt, so top.closed ≥ 1
  const topHits = (top.hits * topClosed) / top.closed;
  const restHits = users.reduce((n, u) => n + u.hits, 0) - top.hits;
  return { closed: rest + topClosed, hits: restHits + topHits, users: users.length };
}

export function effectiveHitRate(
  recipe: Pick<CraftRecipe, "hitRate">,
  prov: Pick<RecipeProvenance, "hitRateBasis">,
  stats: AttemptStats | undefined,
  k = CALIBRATION_K,
): HitRateView {
  const n = stats?.closed ?? 0;
  const hits = stats?.hits ?? 0;
  if (hits < 0 || hits > n) throw new Error(`attempt stats are inconsistent: ${hits} hits of ${n} closed`);
  const curated = prov.hitRateBasis;
  return {
    model: recipe.hitRate,
    measured: n > 0 ? hits / n : null,
    n,
    users: stats?.users ?? 0,
    effective: (hits + k * recipe.hitRate) / (n + k),
    // from n = k on, the log carries at least half the weight
    basis: n >= k ? "measured" : curated.basis,
    claimN: curated.basis === "creator_claim" ? curated.n : null,
    note: curated.note,
  };
}
