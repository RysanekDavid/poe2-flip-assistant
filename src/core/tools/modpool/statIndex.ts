import { fetchTradeMeta } from "../../../api/tradeMeta";
import { buildStatIndex, type StatIndex } from "../../statResolver";

/**
 * The trade2 stat catalog as a StatIndex for the mod pool. fetchTradeMeta caches a success for 24 h
 * but retries a failure on every call, and each retry can take ~50 s (two 25 s reads) — during a
 * trade2 /data outage every pool GET would hang that long. A failure is therefore remembered for
 * NEGATIVE_TTL_MS and re-thrown at once, loudly, with how long until the next real attempt.
 */
export const NEGATIVE_TTL_MS = 60_000;

export class StatCatalogUnavailableError extends Error {
  constructor(
    cause: string,
    readonly retryAfterSec: number,
  ) {
    super(`trade2 stat catalog unavailable (next attempt in ${retryAfterSec} s): ${cause}`);
    this.name = "StatCatalogUnavailableError";
  }
}

type MetaFetch = () => Promise<{ at: number; stats: Parameters<typeof buildStatIndex>[0] }>;

let built: { at: number; idx: StatIndex } | null = null;
let failed: { until: number; cause: string } | null = null;

/** Test hook: forget the built index and any remembered failure. */
export function resetStatIndexCache(): void {
  built = null;
  failed = null;
}

const secondsUntil = (untilMs: number, nowMs: number): number => Math.max(1, Math.ceil((untilMs - nowMs) / 1000));

export async function loadStatIndex(nowMs: number = Date.now(), fetchMeta: MetaFetch = fetchTradeMeta): Promise<StatIndex> {
  if (failed && nowMs < failed.until) throw new StatCatalogUnavailableError(failed.cause, secondsUntil(failed.until, nowMs));
  try {
    const meta = await fetchMeta();
    failed = null;
    // rebuilt only when the underlying 24 h snapshot changes, not on every request
    if (built?.at !== meta.at) built = { at: meta.at, idx: buildStatIndex(meta.stats) };
    return built.idx;
  } catch (e: unknown) {
    const cause = e instanceof Error ? e.message : String(e);
    failed = { until: nowMs + NEGATIVE_TTL_MS, cause };
    console.error(`[mod-pool] trade2 stat catalog unavailable: ${cause}`);
    throw new StatCatalogUnavailableError(cause, secondsUntil(failed.until, nowMs));
  }
}
