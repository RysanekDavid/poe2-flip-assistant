import { z } from "zod";
import type { ModMarker } from "../core/itemParser";

/**
 * trade2 `/fetch` response → Listing. Validated with zod because the shape moved under us once
 * already: GGG's API changelog 3.29.0 (2026-07-21; the trade site switched ~2026-06-19) turned
 * `explicitMods` entries from strings into ItemMod objects `{description, hash, flags, mods}` and
 * folded crafted/fractured/desecrated mods into `explicitMods` with a `flags` marker. The old
 * parser kept only `typeof m === "string"` entries — every rare lost every explicit mod, silently,
 * and the price book filled with bare "<base>|" signatures. Entries we can't read are now COUNTED.
 */
export interface ListingMod {
  text: string; // display text with trade markup stripped: "+18% to Cold Resistance"
  marker: ModMarker; // which bucket the game tagged it with (drives catalog-group preference)
  statId: string | null; // trade stat id when the API gave one ("explicit.stat_3299347043")
}

export interface ListingPrice {
  amount: number;
  currency: string;
}

export interface Listing {
  listingId: string; // unique listing hash — for de-duping across re-lists
  price: ListingPrice | null; // null = unpriced OR a non-positive amount (never a 0-Div ask)
  account: string;
  online: boolean; // seller currently in-game (instant-buyout sellers report null → false)
  instantBuyout: boolean; // Merchant/async listing (carries a gold `fee`) — buyable while offline
  indexed: string | null; // when the listing was indexed (age)
  whisper: string | null; // absent on instant-buyout listings
  itemName: string;
  baseType: string;
  rarity: string | null; // "Normal" | "Magic" | "Rare" | "Unique"
  itemLevel: number | null;
  corrupted: boolean;
  mirrored: boolean;
  icon: string | null;
  stackSize: number;
  mods: string[]; // display texts of modLines (craft routes + UI)
  modLines: ListingMod[];
  unreadableMods: number; // mod entries in neither string nor ItemMod shape — a contract break
  stash: string | null;
}

const ItemModSchema = z
  .object({
    description: z.string(),
    hash: z.string().optional(),
    flags: z.record(z.unknown()).optional(),
  })
  .passthrough();

const ModArray = z.array(z.unknown()).optional();

const FetchEntrySchema = z
  .object({
    id: z.string().optional(),
    listing: z
      .object({
        indexed: z.string().optional(),
        price: z.object({ amount: z.number().optional(), currency: z.string().optional() }).passthrough().nullish(),
        account: z.object({ name: z.string().optional(), online: z.unknown().optional() }).passthrough().optional(),
        whisper: z.string().optional(),
        fee: z.number().nullish(),
        stash: z.object({ name: z.string().optional() }).passthrough().nullish(),
      })
      .passthrough()
      .optional(),
    item: z
      .object({
        name: z.string().optional(),
        typeLine: z.string().optional(),
        baseType: z.string().optional(),
        rarity: z.string().optional(),
        frameTypeId: z.string().optional(),
        ilvl: z.number().optional(),
        corrupted: z.boolean().optional(),
        duplicated: z.boolean().optional(),
        mirrored: z.boolean().optional(),
        icon: z.string().optional(),
        stackSize: z.number().optional(),
        implicitMods: ModArray,
        explicitMods: ModArray,
        runeMods: ModArray,
        enchantMods: ModArray,
        craftedMods: ModArray,
        fracturedMods: ModArray,
        desecratedMods: ModArray,
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

// entries stay `unknown` here and are validated one by one, so an error names the offending path
export const FetchResponseSchema = z.object({ result: z.array(z.unknown()) }).passthrough();
export type FetchEntry = z.infer<typeof FetchEntrySchema>;

/** Strip trade2 display markup: "[Resistances|Cold Resistance]" → "Cold Resistance", "[Bonded]" → "Bonded". */
export function cleanMod(m: string): string {
  return m
    .replace(/\[[^\]|]*\|([^\]]*)\]/g, "$1")
    .replace(/\[([^\]]*)\]/g, "$1")
    .trim();
}

/** "stat.explicit.stat_X" (ItemMod.hash) → "explicit.stat_X" (the id trade searches take). */
function statIdOf(hash: string | undefined): string | null {
  if (!hash) return null;
  return hash.startsWith("stat.") ? hash.slice(5) : hash;
}

function markerOf(bucket: ModMarker, flags: Record<string, unknown> | undefined): ModMarker {
  if (flags?.crafted === true) return "crafted";
  if (flags?.fractured === true) return "fractured";
  return bucket;
}

const BUCKETS: Array<[keyof NonNullable<FetchEntry["item"]>, ModMarker]> = [
  ["implicitMods", "implicit"],
  ["explicitMods", "explicit"],
  ["craftedMods", "crafted"],
  ["fracturedMods", "fractured"],
  ["desecratedMods", "explicit"],
  ["runeMods", "rune"],
  ["enchantMods", "enchant"],
];

/** Every mod line across every bucket, in both the legacy string and the ItemMod object shape. */
export function extractMods(item: FetchEntry["item"]): { lines: ListingMod[]; unreadable: number } {
  const lines: ListingMod[] = [];
  let unreadable = 0;
  for (const [key, bucket] of BUCKETS) {
    const arr = item?.[key];
    if (!Array.isArray(arr)) continue;
    for (const entry of arr) {
      if (typeof entry === "string") {
        lines.push({ text: cleanMod(entry), marker: bucket, statId: null });
        continue;
      }
      const obj = ItemModSchema.safeParse(entry);
      if (!obj.success) {
        unreadable++;
        continue;
      }
      lines.push({ text: cleanMod(obj.data.description), marker: markerOf(bucket, obj.data.flags), statId: statIdOf(obj.data.hash) });
    }
  }
  return { lines: lines.filter((l) => l.text !== ""), unreadable };
}

function priceOf(p: { amount?: number; currency?: string } | null | undefined): ListingPrice | null {
  if (!p || p.amount == null || !p.currency) return null;
  return p.amount > 0 && Number.isFinite(p.amount) ? { amount: p.amount, currency: p.currency } : null;
}

/** One fetch entry → Listing (null for a null entry = delisted between search and fetch). The
 *  schema only pins types of fields we read, so a failure here is a real contract break: throw. */
export function parseListing(raw: unknown): Listing | null {
  if (raw == null) return null;
  const parsed = FetchEntrySchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(`trade2 fetch entry has an unexpected shape at ${issue?.path.join(".") ?? "?"}: ${issue?.message ?? "invalid"}`);
  }
  const r = parsed.data;
  const item = r.item;
  const { lines, unreadable } = extractMods(item);
  return {
    listingId: r.id ?? "",
    price: priceOf(r.listing?.price),
    account: r.listing?.account?.name ?? "?",
    online: r.listing?.account?.online != null,
    instantBuyout: r.listing?.fee != null,
    indexed: r.listing?.indexed ?? null,
    whisper: r.listing?.whisper ?? null,
    itemName: item?.name || item?.baseType || item?.typeLine || "?",
    baseType: item?.baseType || item?.typeLine || "",
    rarity: item?.rarity ?? item?.frameTypeId ?? null,
    itemLevel: item?.ilvl ?? null,
    corrupted: item?.corrupted === true,
    mirrored: item?.duplicated === true || item?.mirrored === true,
    icon: item?.icon ?? null,
    stackSize: item?.stackSize ?? 0,
    mods: lines.map((l) => l.text),
    modLines: lines,
    unreadableMods: unreadable,
    stash: r.listing?.stash?.name ?? null,
  };
}

/** A whole fetch body → listings. A body that isn't `{result: [...]}` is a contract break: throw. */
export function parseFetchResponse(body: unknown): Listing[] {
  const parsed = FetchResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new Error(`trade2 fetch response has an unexpected shape: ${parsed.error.issues[0]?.message ?? "invalid"}`);
  }
  return parsed.data.result.map(parseListing).filter((l): l is Listing => l != null);
}

/** Buyable right now: seller online (in-person trade) or an instant-buyout Merchant listing. */
export const isBuyable = (l: Listing): boolean => l.online || l.instantBuyout;

/** A rare that came back with no mods at all means mod capture broke, not that the item is blank. */
export const isZeroModRare = (l: Listing): boolean => (l.rarity ?? "").toLowerCase() === "rare" && l.modLines.length === 0;
