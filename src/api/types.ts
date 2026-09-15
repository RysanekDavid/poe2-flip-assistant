import { z } from "zod";

/**
 * poe.ninja PoE2 currency-exchange response schema.
 *
 * Endpoint is undocumented. We validate at runtime and fail loud (see ninjaClient)
 * rather than trusting the shape — fields here are the minimum we consume.
 */
export const NinjaLineSchema = z.object({
  id: z.string(),
  // Price in the exchange BASE currency (Divine in PoE2), NOT chaos. No inversion.
  primaryValue: z.number(),
  volumePrimaryValue: z.number().nullish(),
  maxVolumeCurrency: z.string().nullish(),
  maxVolumeRate: z.number().nullish(),
  sparkline: z
    .object({
      totalChange: z.number().nullish(),
      // ninja pads short series with nulls — allow them, we strip downstream
      data: z.array(z.number().nullable()).nullish(),
    })
    .nullish(),
});

export const NinjaItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  image: z.string().nullish(),
  category: z.string().nullish(),
  detailsId: z.string().nullish(),
});

export const NinjaResponseSchema = z.object({
  // `core` holds reference currencies (divine/exalted) — passthrough, unused for now.
  core: z.unknown().nullish(),
  lines: z.array(NinjaLineSchema),
  items: z.array(NinjaItemSchema),
});

export type NinjaLine = z.infer<typeof NinjaLineSchema>;
export type NinjaItem = z.infer<typeof NinjaItemSchema>;
export type NinjaResponse = z.infer<typeof NinjaResponseSchema>;

/**
 * One league as a source reports it, in the source's own order. `current` is null when that
 * source exposes no current/active flag — poe2scout sets IsCurrent, poe.ninja has no flag at
 * all and is read by order instead (see leagueWatcher's two pickers).
 */
export interface LeagueOption {
  name: string;
  current: boolean | null;
}

/** Category descriptor — `type` is the API query param value. */
export interface NinjaCategory {
  type: string;
  endpoint: string;
}

// Verified live `type` values. ninja taxonomy ≠ in-game labels:
//   Abyss = "Abyssal Bones", Breach = "Catalysts", Ritual = "Omens".
// 12 req/full-fetch but cached 1h → ~12 req/hour, not per poll. Kulemak lives in Fragments.
const E = "exchange/current/overview";
export const CATEGORIES: readonly NinjaCategory[] = [
  { type: "Currency", endpoint: E },
  { type: "Fragments", endpoint: E },
  { type: "Runes", endpoint: E },
  { type: "Essences", endpoint: E },
  { type: "Breach", endpoint: E },
  { type: "Expedition", endpoint: E },
  { type: "Abyss", endpoint: E },
  { type: "Ritual", endpoint: E },
  { type: "UncutGems", endpoint: E },
  { type: "SoulCores", endpoint: E },
  { type: "Idols", endpoint: E },
  { type: "Verisium", endpoint: E },
  // Distilled/liquid emotions — the craft-margin engine prices Delirium instills (e.g. Liquid
  // Contempt) from here. This is the 13th request, so it spills into the next ninja limiter
  // window; tolerated (ninja is cached 1h, the poller isn't racing the budget).
  { type: "Delirium", endpoint: E },
] as const;

/**
 * A single priced item. `baseValue` is the price in the exchange base currency
 * (Divine in PoE2) — NOT chaos. Renamed/relabeled downstream once base unit is settled.
 */
export interface PricedItem {
  itemId: string;
  itemName: string;
  category: string;
  baseValue: number;
  volume: number;
  change7d: number | null;
  spark7d: number[] | null;
  icon: string | null;
}
