/**
 * poe2scout unique category (CategoryApiId) → the rail label and URL slug of Trade › Prices.
 * Client-safe (no node imports): the route labels its rows with it, and the Prices tool validates
 * `?cat=` against these slugs before the uniques have loaded.
 *
 * Order follows poe.ninja's UNIQUES rail (weapons, armours, accessories, flasks, jewels, relics).
 * The ids are exactly the categories the demand fetch pages (scoutDemand DEMAND_CATEGORIES); the
 * node test pins that every one of them has a label here.
 */
export interface UniqueCategory {
  /** poe2scout CategoryApiId. */
  id: string;
  /** URL value of ?cat=; prefixed so it can never collide with an exchange slug. */
  slug: string;
  label: string;
}

export const UNIQUE_CATEGORIES: readonly UniqueCategory[] = [
  { id: "weapon", slug: "unique-weapons", label: "Weapons" },
  { id: "armour", slug: "unique-armours", label: "Armours" },
  { id: "accessory", slug: "unique-accessories", label: "Accessories" },
  // scout's "flask" holds the charms too (Golden Charm, Silver Charm; live read 2026-09-30)
  { id: "flask", slug: "unique-flasks", label: "Flasks & Charms" },
  { id: "jewel", slug: "unique-jewels", label: "Jewels" },
  // poe2scout files Sanctum relics under "sanctum"; players (and poe.ninja) call them relics.
  { id: "sanctum", slug: "unique-relics", label: "Relics" },
];

/** The label of a scout category, or null when nobody labelled it. */
export function uniqueCategory(id: string): UniqueCategory | null {
  return UNIQUE_CATEGORIES.find((c) => c.id === id) ?? null;
}

export const isUniqueSlug = (slug: string): boolean => UNIQUE_CATEGORIES.some((c) => c.slug === slug);
