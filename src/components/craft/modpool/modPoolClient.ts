import {
  modValueResponseSchema,
  type ModLiveValue,
  type ModPoolQuery,
  type ModValueRequest,
} from "../../../lib/tools/modPoolContract";
import { postJson } from "../moves/craftMovesClient";

export function poolUrl(q: ModPoolQuery): string {
  const p = new URLSearchParams({ class: q.itemClass, base: q.base, ilvl: String(q.ilvl), rarity: q.rarity });
  return `/api/tools/mod-pool?${p.toString()}`;
}

export const rowKeyOf = (r: { side: string; family: string }): string => `${r.side}:${r.family}`;

export type LiveState =
  | { kind: "loading" }
  | { kind: "done"; live: ModLiveValue; cached: boolean }
  | { kind: "error"; error: string; retryAt: number | null };

/** One family's live value: a shared cache hit, or 1 trade2 search + 1 fetch with your POESESSID. */
export async function fetchFamilyValue(req: ModValueRequest): Promise<LiveState> {
  try {
    const r = await postJson("/api/tools/mod-pool/value", req, modValueResponseSchema);
    if (r.ok) return { kind: "done", live: r.data.live, cached: r.data.cached };
    // 429 (your hourly cap) and 503 (shared budget / stat catalog) both carry Retry-After
    return { kind: "error", error: r.error, retryAt: r.retryAfterSec != null ? Date.now() + r.retryAfterSec * 1000 : null };
  } catch (e: unknown) {
    console.error("[mod-pool] live value failed", e);
    return { kind: "error", error: e instanceof Error ? e.message : String(e), retryAt: null };
  }
}
