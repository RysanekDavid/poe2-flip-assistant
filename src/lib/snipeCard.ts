import { z } from "zod";

/**
 * The item card stored with a SNIPE alert (alerts.details). Persisted because the scan report
 * that found the listing rotates away within minutes, and an alert that only says "Doom Grip,
 * 42% under" gives the player nothing to recognise or search. Pure module: the server writes it,
 * the Alerts tab renders it, both through this schema.
 */
const HttpsUrl = z
  .string()
  .url()
  .max(2000)
  .refine((u) => u.startsWith("https://"), "must be an https URL");

export const CARD_MOD_KINDS = ["implicit", "enchant", "rune", "explicit", "crafted", "fractured", "desecrated"] as const;
export type CardModKind = (typeof CARD_MOD_KINDS)[number];

export const CardModSchema = z.object({ kind: z.enum(CARD_MOD_KINDS), text: z.string().max(200) });
export type CardMod = z.infer<typeof CardModSchema>;

/** How the estimated value was derived — exactly what autosnipe's comparable valuation computed. */
export const CardValuationSchema = z.object({
  samples: z.number().int().nonnegative(), // comparables behind the median
  dropped: z.number().int().nonnegative(), // cheap outliers (bait) trimmed before the median
  unrated: z.number().int().nonnegative(), // comparables priced outside the rates ladder (ignored)
  total: z.number().int().nonnegative(), // live listings the comparable search reported
  minDiv: z.number().nullable(), // cheapest surviving comparable
  broadened: z.boolean(), // the distinctive-mod search was too thin → pseudo-totals-only search
  searchedMods: z.array(z.string().max(200)).max(12), // the rolls the comparable search filtered on
  comparablesUrl: HttpsUrl, // trade2 page of that comparable search
});
export type CardValuation = z.infer<typeof CardValuationSchema>;

export const SnipeCardSchema = z.object({
  v: z.literal(1),
  league: z.string(),
  icon: HttpsUrl.nullable(),
  name: z.string().max(200),
  baseType: z.string().max(200),
  rarity: z.string().max(20).nullable(), // trade2 "Normal" | "Magic" | "Rare" | "Unique"
  itemLevel: z.number().int().nullable(),
  corrupted: z.boolean(),
  desecrated: z.boolean(),
  mods: z.array(CardModSchema).max(24),
  price: z.object({ amount: z.number().positive(), currency: z.string().max(40) }),
  priceDiv: z.number().positive(),
  valueDiv: z.number().positive(),
  marginPct: z.number(),
  exaltPerDivine: z.number().positive(), // rate at scan time, so small asks render in exalted
  valuation: CardValuationSchema,
  listedAt: z.string().nullable(), // trade2 `indexed`
  sellerOnline: z.boolean(),
  instantBuyout: z.boolean(),
  whisper: z.string().max(2000).nullable(),
  tradeUrl: HttpsUrl, // official trade2 search that finds this listing
});
export type SnipeCard = z.infer<typeof SnipeCardSchema>;

/**
 * Read a stored card. A row that fails the schema is reported, not thrown: one bad row must not
 * blank the whole alert feed, but it must not render as if nothing was wrong either.
 */
export function parseStoredCard(raw: string | null, alertId: number): { card: SnipeCard | null; error: string | null } {
  if (raw == null) return { card: null, error: null };
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    const error = `stored card is not JSON: ${e instanceof Error ? e.message : String(e)}`;
    console.error(`[alerts] alert ${alertId}: ${error}`);
    return { card: null, error };
  }
  const parsed = SnipeCardSchema.safeParse(json);
  if (parsed.success) return { card: parsed.data, error: null };
  const issue = parsed.error.issues[0];
  const error = `stored card has an unexpected shape at ${issue?.path.join(".") ?? "?"}: ${issue?.message ?? "invalid"}`;
  console.error(`[alerts] alert ${alertId}: ${error}`);
  return { card: null, error };
}
