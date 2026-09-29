/**
 * poe.ninja exchange `type` (what price_snapshots.category stores) → the word a player uses, the
 * URL slug and the item whose art stands for the category. Client-safe (no node imports): the
 * route builds the rail from it and the Prices tool parses `?cat=` against it.
 *
 * Order follows poe.ninja's own economy rail, so a player moving between the two finds things in
 * the same place. ninja's taxonomy differs from the in-game labels (Breach = catalysts, Ritual =
 * omens, Abyss = abyssal bones, Delirium = liquid emotions).
 */
export interface EconomyCategory {
  /** poe.ninja exchange type, as stored in price_snapshots.category. */
  type: string;
  /** URL value of ?cat=. */
  slug: string;
  label: string;
  /** ninja item id whose icon represents the category; the priciest item stands in when absent. */
  iconItemId: string;
}

export const ECONOMY_CATEGORIES: readonly EconomyCategory[] = [
  { type: "Currency", slug: "currency", label: "Currency", iconItemId: "divine" },
  { type: "Fragments", slug: "fragments", label: "Fragments", iconItemId: "the-trialmasters-reliquary-key" },
  { type: "Abyss", slug: "abyssal-bones", label: "Abyssal Bones", iconItemId: "preserved-cranium" },
  { type: "UncutGems", slug: "uncut-gems", label: "Uncut Gems", iconItemId: "uncut-skill-gem-20" },
  { type: "Essences", slug: "essences", label: "Essences", iconItemId: "essence-of-hysteria" },
  { type: "SoulCores", slug: "soul-cores", label: "Soul Cores", iconItemId: "xopecs-soul-core-of-power" },
  { type: "Idols", slug: "idols", label: "Idols", iconItemId: "fox-idol" },
  { type: "Runes", slug: "runes", label: "Runes", iconItemId: "perfect-stone-rune" },
  { type: "Ritual", slug: "omens", label: "Omens", iconItemId: "omen-of-light" },
  { type: "Expedition", slug: "expedition", label: "Expedition", iconItemId: "expedition-logbook" },
  { type: "Delirium", slug: "liquid-emotions", label: "Liquid Emotions", iconItemId: "potent-liquid-ferocity" },
  { type: "Breach", slug: "catalysts", label: "Catalysts", iconItemId: "sibilant-catalyst" },
  { type: "Verisium", slug: "verisium", label: "Verisium", iconItemId: "celestial-alloy" },
];

export const DEFAULT_CATEGORY_SLUG = "currency";

/** A stored category with no entry here is a new poller type nobody labelled — fail loudly. */
export function economyCategory(type: string): EconomyCategory {
  const found = ECONOMY_CATEGORIES.find((c) => c.type === type);
  if (!found) throw new Error(`economyCategories: poe.ninja type "${type}" has no label — add it to ECONOMY_CATEGORIES`);
  return found;
}

/** `?cat=` → a category, or null when the slug is unknown (the caller warns and rewrites the URL). */
export function categoryBySlug(slug: string): EconomyCategory | null {
  return ECONOMY_CATEGORIES.find((c) => c.slug === slug) ?? null;
}
