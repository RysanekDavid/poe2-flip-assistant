/*
 * Item text that is not a rolled mod line: the name/base line, header properties, state tags and
 * boilerplate. RePoE does not carry these (waystone header properties are the SUM of hidden bonus
 * lines the builder drops), so they are written by hand here and each spelling records where it
 * was verified:
 *   corpus    — present in a real clipboard sample under src/scripts/tools/regexCorpus/
 *   poe2.re   — used verbatim by poe2.re's working search tokens
 *   unverified — best guess; the UI must show a "verify in-game" marker
 * Header lines are on (nearly) every item of the tab, so no mod fragment may ever match them.
 */
import type { PoolTab } from "./schema";

export const HEADER_VERIFICATION = ["corpus", "poe2.re", "unverified"] as const;
export type HeaderVerification = (typeof HEADER_VERIFICATION)[number];

export const HEADER_KINDS = ["class", "rarity", "tier", "property", "state", "boilerplate"] as const;
export type HeaderKind = (typeof HEADER_KINDS)[number];

export const RARITIES = ["normal", "magic", "rare", "unique"] as const;
export type Rarity = (typeof RARITIES)[number];

export interface PoolHeader {
  /** Stable id; selections reference it (props thresholds, rarity, corrupted). */
  id: string;
  /** Line as the tooltip prints it, numbers as "#" (template.ts conventions). */
  template: string;
  kind: HeaderKind;
  verified: HeaderVerification;
  /** Why the spelling is trusted or doubted — shown next to the "verify in-game" marker. */
  note?: string;
}

// Sidekick issue #1276 (a T15 rare waystone, Ctrl+C) is the corpus sample for these lines.
const SIDEKICK_1276 = "Sidekick #1276 waystone clipboard";

const RARITY_HEADERS: readonly PoolHeader[] = [
  { id: "rarity.normal", template: "Rarity: Normal", kind: "rarity", verified: "poe2.re", note: "poe2.re rarity toggle" },
  { id: "rarity.magic", template: "Rarity: Magic", kind: "rarity", verified: "poe2.re", note: "poe2.re rarity toggle" },
  { id: "rarity.rare", template: "Rarity: Rare", kind: "rarity", verified: "corpus", note: SIDEKICK_1276 },
  { id: "rarity.unique", template: "Rarity: Unique", kind: "rarity", verified: "unverified" },
];

const COMMON_TAIL: readonly PoolHeader[] = [
  { id: "itemLevel", template: "Item Level: #", kind: "property", verified: "corpus", note: SIDEKICK_1276 },
  { id: "corrupted", template: "Corrupted", kind: "state", verified: "corpus", note: SIDEKICK_1276 },
  { id: "unidentified", template: "Unidentified", kind: "state", verified: "unverified" },
];

const WAYSTONE: readonly PoolHeader[] = [
  { id: "class", template: "Item Class: Waystones", kind: "class", verified: "corpus", note: SIDEKICK_1276 },
  ...RARITY_HEADERS,
  { id: "tier", template: "Waystone (Tier #)", kind: "tier", verified: "corpus", note: `${SIDEKICK_1276}; poe2.re er 1[0-6]\\)` },
  { id: "revives", template: "Revives Available: #", kind: "property", verified: "corpus", note: SIDEKICK_1276 },
  { id: "itemRarity", template: "Item Rarity: +#%", kind: "property", verified: "corpus", note: SIDEKICK_1276 },
  { id: "monsterRarity", template: "Monster Rarity: +#%", kind: "property", verified: "corpus", note: SIDEKICK_1276 },
  { id: "waystoneDrop", template: "Waystone Drop Chance: +#%", kind: "property", verified: "corpus", note: SIDEKICK_1276 },
  {
    id: "monsterEffectiveness",
    template: "Monster Effectiveness: +#%",
    kind: "property",
    verified: "unverified",
    note: "sum of the hidden 'Monsters have N% more Effectiveness' lines; label spelling not seen in a paste yet",
  },
  {
    id: "packSize",
    template: "Pack Size: +#%",
    kind: "property",
    verified: "unverified",
    note: "sum of the hidden 'N% more Pack size' lines; label spelling not seen in a paste yet",
  },
  {
    id: "mapDevice",
    template: "Can be used in a Map Device, allowing you to enter a Map. Waystones can only be used once.",
    kind: "boilerplate",
    verified: "corpus",
    note: SIDEKICK_1276,
  },
  { id: "delirious", template: "Delirious", kind: "state", verified: "unverified", note: "Delirium-instilled waystones; exact line unknown" },
  ...COMMON_TAIL,
];

const TABLET: readonly PoolHeader[] = [
  { id: "class", template: "Item Class: Tablet", kind: "class", verified: "unverified", note: "RePoE item class name" },
  ...RARITY_HEADERS,
  { id: "uses", template: "Uses Remaining: #", kind: "property", verified: "unverified", note: "tablet charge line; spelling not seen in a paste yet" },
  ...COMMON_TAIL,
];

const RELIC: readonly PoolHeader[] = [
  { id: "class", template: "Item Class: Relics", kind: "class", verified: "unverified", note: "RePoE item class name" },
  ...RARITY_HEADERS,
  {
    id: "relicAltar",
    template: "Place this item on the Relic Altar at the start of the Trial of the Sekhemas",
    kind: "boilerplate",
    verified: "unverified",
  },
  ...COMMON_TAIL,
];

const JEWEL: readonly PoolHeader[] = [
  { id: "class", template: "Item Class: Jewels", kind: "class", verified: "unverified", note: "RePoE item class name" },
  ...RARITY_HEADERS,
  {
    id: "jewelSocket",
    template: "Place into an allocated Jewel Socket on the Passive Skill Tree. Right click to remove from the Socket.",
    kind: "boilerplate",
    verified: "unverified",
  },
  ...COMMON_TAIL,
];

export const POOL_HEADERS: Readonly<Record<PoolTab, readonly PoolHeader[]>> = {
  waystone: WAYSTONE,
  tablet: TABLET,
  relic: RELIC,
  jewel: JEWEL,
};

export function headerById(tab: PoolTab, id: string): PoolHeader {
  const header = POOL_HEADERS[tab].find((h) => h.id === id);
  if (!header) throw new Error(`no ${tab} header "${id}"`);
  return header;
}

/** Rarity header id for a rarity, e.g. "rare" → "rarity.rare". */
export const rarityHeaderId = (rarity: Rarity): string => `rarity.${rarity}`;
