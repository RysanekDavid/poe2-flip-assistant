import type { z } from "zod";
import { apiErrorSchema } from "../../../lib/tools/craftMovesContract";

/** fetch + zod parse. A shape mismatch throws (loud); an HTTP error comes back typed for the UI. */
export type PostResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string; retryAfterSec: number | null };

export type JsonRequest = { method: "GET" } | { method: "POST"; body: unknown };

export async function requestJson<T>(url: string, init: JsonRequest, schema: z.ZodType<T>): Promise<PostResult<T>> {
  const res = await fetch(
    url,
    init.method === "GET"
      ? { method: "GET", cache: "no-store" }
      : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(init.body) },
  );
  const json: unknown = await res.json().catch((e: unknown) => ({ error: `unreadable response (${res.status}): ${String(e)}` }));
  if (!res.ok) {
    const err = apiErrorSchema.safeParse(json);
    const header = Number(res.headers.get("Retry-After"));
    return {
      ok: false,
      status: res.status,
      error: err.success ? err.data.error : `request failed (${res.status})`,
      retryAfterSec: err.success && err.data.retryAfterSec != null ? err.data.retryAfterSec : Number.isFinite(header) && header > 0 ? header : null,
    };
  }
  return { ok: true, data: schema.parse(json) };
}

export const postJson = <T>(url: string, body: unknown, schema: z.ZodType<T>): Promise<PostResult<T>> =>
  requestJson(url, { method: "POST", body }, schema);

/** A plain Ctrl+C rare on a real 0.5 base: two prefixes + two suffixes, so the exalt moves show. */
export const SAMPLE_ITEM = `Item Class: Rings
Rarity: Rare
Doom Loop
Ruby Ring
--------
Requirements:
Level: 60
--------
Item Level: 82
--------
+26% to Fire Resistance (implicit)
--------
+104 to maximum Life
Adds 22 to 34 Fire damage to Attacks
+38% to Cold Resistance
21% increased Cast Speed
--------`;
