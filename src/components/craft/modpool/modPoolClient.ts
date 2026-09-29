import type { z } from "zod";
import { apiErrorSchema } from "../../../lib/tools/craftMovesContract";
import {
  modValueResponseSchema,
  type ModLiveValue,
  type ModPoolQuery,
  type ModValueRequest,
} from "../../../lib/tools/modPoolContract";
import { postJson, type PostResult } from "../moves/craftMovesClient";

/** GET + zod parse. A shape mismatch throws (loud); an HTTP error comes back typed for the UI. */
export async function getJson<T>(url: string, schema: z.ZodType<T>): Promise<PostResult<T>> {
  const res = await fetch(url, { cache: "no-store" });
  const json: unknown = await res.json().catch((e: unknown) => ({ error: `unreadable response (${res.status}): ${String(e)}` }));
  if (!res.ok) {
    const err = apiErrorSchema.safeParse(json);
    return { ok: false, status: res.status, error: err.success ? err.data.error : `request failed (${res.status})`, retryAfterSec: null };
  }
  return { ok: true, data: schema.parse(json) };
}

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
    return { kind: "error", error: r.error, retryAt: r.retryAfterSec != null ? Date.now() + r.retryAfterSec * 1000 : null };
  } catch (e: unknown) {
    console.error("[mod-pool] live value failed", e);
    return { kind: "error", error: e instanceof Error ? e.message : String(e), retryAt: null };
  }
}
