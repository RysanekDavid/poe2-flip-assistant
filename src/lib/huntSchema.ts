import { z } from "zod";
import type { HuntFields } from "../db/huntQueries";

/**
 * Runtime contract for hunt create/edit bodies. Without it a malformed hunt (stats not an array,
 * "abc" as a price, an unknown mode) was stored verbatim and then failed on every scan, forever,
 * with nothing in the UI saying why.
 */
const optText = z
  .string()
  .trim()
  .max(200)
  .nullish()
  .transform((s) => (s ? s : null));

const optPositive = z.number().finite().positive().nullish().transform((n) => n ?? null);

export const StatFilterSchema = z
  .object({
    id: z.string().trim().min(1).max(120),
    min: z.number().finite().optional(),
    max: z.number().finite().optional(),
  })
  .strict();

export const HuntBodySchema = z.object({
  label: z.string().trim().min(1).max(120),
  mode: z.enum(["SNIPE", "CRAFT_BASE", "RESELL"]).default("SNIPE"),
  itemName: optText,
  baseType: optText,
  category: optText,
  ilvlMin: z.number().int().min(0).max(100).nullish().transform((n) => n ?? null),
  rarity: z.enum(["normal", "magic", "rare", "unique"]).nullish().transform((r) => r ?? null),
  stats: z.array(StatFilterSchema).max(12).nullish().transform((s) => (s && s.length > 0 ? s : null)),
  maxAmount: optPositive,
  maxCcy: z.enum(["divine", "exalted", "chaos"]).nullish().transform((c) => c ?? null),
  targetDiv: optPositive,
});

export type HuntBody = z.infer<typeof HuntBodySchema>;

/** Body → DB columns. A price ceiling needs both halves; half of one is rejected upstream. */
export function huntBodyToFields(b: HuntBody): HuntFields {
  return {
    label: b.label,
    mode: b.mode,
    item_name: b.itemName,
    base_type: b.baseType,
    category: b.category,
    ilvl_min: b.ilvlMin,
    rarity: b.rarity,
    stats_json: b.stats ? JSON.stringify(b.stats) : null,
    max_amount: b.maxAmount,
    max_ccy: b.maxAmount != null ? b.maxCcy : null,
    target_div: b.targetDiv,
  };
}

/** Parse + cross-field checks. Returns the fields or a human error for a 400. */
export function parseHuntBody(raw: unknown): { ok: true; fields: HuntFields } | { ok: false; error: string } {
  const parsed = HuntBodySchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue ? `${issue.path.join(".") || "body"}: ${issue.message}` : "invalid hunt" };
  }
  const b = parsed.data;
  if (b.maxAmount != null && b.maxCcy == null) return { ok: false, error: "maxCcy: required when maxAmount is set" };
  if (!b.itemName && !b.baseType && !b.category && !b.stats) {
    return { ok: false, error: "a hunt needs an item name, base type, category or a stat filter — otherwise it searches everything" };
  }
  return { ok: true, fields: huntBodyToFields(b) };
}
