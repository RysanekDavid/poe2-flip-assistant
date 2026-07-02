import { buildStatIndex, type StatIndex } from "./statResolver";
import type { StatFilter } from "../lib/tradeLink";

/**
 * Curated craft-target library — the CORE of the Craft Helper.
 *
 * This is build-knowledge, not a market scan: the meta is stable per ~6-month season and ~99% of
 * builds chase the same mods per slot, so the *desirable* mod set is hand-curated here (season-stable)
 * rather than scraped. The poe.ninja builds scrape (src/data/buildMeta.json) only *weights* and
 * *prioritises* these — it never decides what's desirable, so if the scrape goes stale the library
 * still works. The user (build expert) owns and tunes this list each season.
 *
 * Mods are declared by catalog TEXT (with '#' for the roll) and resolved to real trade ids at runtime
 * via the same /data/stats catalog (see profileToFilters). Any text the catalog lacks drops silently.
 */

export type ModTier = "core" | "ideal" | "luxury";

export interface DesiredMod {
  /** catalog template, e.g. "# to maximum Life" */
  text: string;
  /** core = nearly every build wants it; ideal = strong; luxury = chase/expensive */
  tier: ModTier;
  /** suggested min roll to aim for (and to search on) */
  min?: number;
  /** prefer the pseudo-group id when the text exists in several groups */
  pseudoFirst?: boolean;
  /** short why/build context shown in the UI */
  note?: string;
}

export interface CraftTarget {
  key: string;
  /** human label, e.g. "Caster Wand — spell levels" */
  label: string;
  /** trade2 category option, e.g. "weapon.wand" — for the resell search */
  category: string;
  /** poe.ninja slot facet label, e.g. "Weapon" | "Helmet" — joins to the scrape */
  slot: string;
  /** suggested base type to craft on (optional hint) */
  baseHint?: string;
  /** ilvl floor for a worthwhile craft */
  ilvlMin: number;
  /** ascendancies that run this (manual hint; the scrape refines/weights it) */
  ascendancies: string[];
  desiredMods: DesiredMod[];
}

// Shared defensive cores so slots stay consistent and DRY. Spread into a target's desiredMods.
const LIFE: DesiredMod = { text: "# to maximum Life", tier: "core", min: 80, note: "flat life is the universal survival stat" };
const RES_CORE: DesiredMod[] = [
  { text: "#% to Cold Resistance", tier: "core", min: 30 },
  { text: "#% to Fire Resistance", tier: "core", min: 30 },
  { text: "#% to Lightning Resistance", tier: "core", min: 30 },
];
const CHAOS_RES: DesiredMod = { text: "#% to Chaos Resistance", tier: "luxury", min: 15, note: "rare, expensive, build-saving at endgame" };
const ATTR_ALL: DesiredMod = { text: "# to all Attributes", tier: "ideal", min: 10, note: "stat-stick to hit gem requirements" };

/**
 * VALUABLE PoE2 ("Runes of Aldur") craft archetypes. Weapons are split by build; armour/accessory
 * slots carry a shared defensive core plus a few slot-specific chase mods. Mins are starting points
 * from market research — tune against the live ladder.
 */
export const CRAFT_TARGETS: CraftTarget[] = [
  // ---------------- weapons (the top chase, per build) ----------------
  {
    key: "wand_caster",
    label: "Caster Wand — spell levels",
    category: "weapon.wand",
    slot: "Weapon",
    ilvlMin: 80,
    ascendancies: ["Stormweaver", "Blood Mage", "Infernalist", "Chronomancer", "Lich"],
    desiredMods: [
      { text: "# to Level of all Spell Skills", tier: "core", min: 4, note: "the value driver on a caster wand" },
      { text: "#% increased Spell Damage", tier: "ideal", min: 100 },
      { text: "#% increased Critical Hit Chance for Spells", tier: "ideal", min: 70 },
      { text: "# to maximum Mana", tier: "luxury", min: 60 },
    ],
  },
  {
    key: "staff_caster",
    label: "Caster Staff — spell levels",
    category: "weapon.staff",
    slot: "Weapon",
    ilvlMin: 80,
    ascendancies: ["Stormweaver", "Infernalist", "Lich"],
    desiredMods: [
      { text: "# to Level of all Spell Skills", tier: "core", min: 5 },
      { text: "#% increased Spell Damage", tier: "ideal", min: 120 },
      { text: "#% increased Critical Hit Chance for Spells", tier: "luxury", min: 80 },
    ],
  },
  {
    key: "sceptre_spirit",
    label: "Sceptre — Spirit",
    category: "weapon.sceptre",
    slot: "Weapon",
    ilvlMin: 80,
    ascendancies: ["Titan", "Warbringer", "Smith of Kitava"],
    desiredMods: [
      { text: "# to Spirit", tier: "core", min: 40, note: "Spirit fuels persistent buffs/minions — the whole point" },
      { text: "#% increased Spirit", tier: "ideal", min: 20 },
    ],
  },
  {
    key: "quarterstaff_melee",
    label: "Quarterstaff — melee levels + AS",
    category: "weapon.warstaff",
    slot: "Weapon",
    ilvlMin: 80,
    ascendancies: ["Martial Artist", "Invoker"],
    desiredMods: [
      { text: "# to Level of all Melee Skills", tier: "core", min: 2, note: "Martial Artist is the #1 meta ascendancy" },
      { text: "#% increased Attack Speed (Local)", tier: "ideal", min: 20 },
      { text: "#% increased Physical Damage", tier: "ideal", min: 100 },
    ],
  },
  {
    key: "crossbow_attack",
    label: "Crossbow — projectile levels + AS",
    category: "weapon.crossbow",
    slot: "Weapon",
    ilvlMin: 80,
    ascendancies: ["Witchhunter", "Tactician", "Gemling Legionnaire"],
    desiredMods: [
      { text: "# to Level of all Projectile Skills", tier: "core", min: 2 },
      { text: "#% increased Attack Speed (Local)", tier: "ideal", min: 20 },
      { text: "#% increased Physical Damage", tier: "luxury", min: 100 },
    ],
  },
  {
    key: "spear_attack",
    label: "Spear — flat damage + projectile levels",
    category: "weapon.spear",
    slot: "Weapon",
    ilvlMin: 80,
    ascendancies: ["Spirit Walker", "Amazon", "Ritualist"],
    desiredMods: [
      { text: "Adds # to # Physical Damage", tier: "core", min: 25, note: "Twister scales flat hit damage, not DPS tooltip — set-2 spear" },
      { text: "# to Level of all Projectile Skills", tier: "core", min: 2, note: "Spirit Walker Twister is the #2 meta build" },
      { text: "#% increased Critical Hit Chance", tier: "ideal", min: 25 },
      { text: "Adds # to # Cold Damage", tier: "ideal", min: 20, note: "flat ele stacks with phys for Twister" },
      { text: "#% increased Attack Speed (Local)", tier: "luxury", min: 20, note: "set-1 Whirling Slash spear chases AS instead of flat" },
    ],
  },
  {
    key: "bow_attack",
    label: "Bow — projectile levels + AS",
    category: "weapon.bow",
    slot: "Weapon",
    ilvlMin: 80,
    ascendancies: ["Deadeye", "Pathfinder", "Amazon"],
    desiredMods: [
      { text: "# to Level of all Projectile Skills", tier: "core", min: 2, note: "LA Deadeye is the most-played build (~34% of top ladder)" },
      { text: "#% increased Attack Speed (Local)", tier: "ideal", min: 20 },
    ],
  },
  // ---------------- offhand ----------------
  {
    key: "focus_caster",
    label: "Focus — spells + crit",
    category: "armour.focus",
    slot: "Focus",
    ilvlMin: 80,
    ascendancies: ["Stormweaver", "Blood Mage", "Chronomancer"],
    desiredMods: [
      { text: "# to Level of all Spell Skills", tier: "core", min: 2 },
      { text: "#% increased Critical Hit Chance for Spells", tier: "ideal", min: 80 },
      { text: "# to Spirit", tier: "ideal", min: 30 },
      { ...LIFE, tier: "ideal", min: 60 },
    ],
  },
  // ---------------- armour ----------------
  {
    key: "helmet",
    label: "Helmet — life + res",
    category: "armour.helmet",
    slot: "Helmet",
    ilvlMin: 80,
    ascendancies: ["(all)"],
    desiredMods: [LIFE, ...RES_CORE, ATTR_ALL, { text: "# to Spirit", tier: "luxury", min: 20 }, CHAOS_RES],
  },
  {
    key: "body_armour",
    label: "Body Armour — life + spirit",
    category: "armour.chest",
    slot: "Body Armour",
    ilvlMin: 80,
    ascendancies: ["(all)"],
    desiredMods: [
      { ...LIFE, min: 100 },
      { text: "# to Spirit", tier: "ideal", min: 30, note: "body is a top Spirit slot for buff/minion builds" },
      ...RES_CORE,
      CHAOS_RES,
    ],
  },
  {
    key: "gloves",
    label: "Gloves — life + res (+AS for attackers)",
    category: "armour.gloves",
    slot: "Gloves",
    ilvlMin: 80,
    ascendancies: ["(all)"],
    desiredMods: [
      LIFE,
      ...RES_CORE,
      { text: "#% increased Attack Speed", tier: "ideal", min: 12, note: "attack builds only — huge dps on gloves" },
      ATTR_ALL,
    ],
  },
  {
    key: "boots",
    label: "Boots — movement speed + life",
    category: "armour.boots",
    slot: "Boots",
    ilvlMin: 80,
    ascendancies: ["(all)"],
    desiredMods: [
      { text: "#% increased Movement Speed", tier: "core", min: 30, note: "30%+ MS is non-negotiable; 35% is the chase" },
      LIFE,
      ...RES_CORE,
    ],
  },
  // ---------------- accessories ----------------
  {
    key: "amulet_caster",
    label: "Amulet — spell levels",
    category: "accessory.amulet",
    slot: "Amulet",
    ilvlMin: 75,
    ascendancies: ["Stormweaver", "Blood Mage", "Infernalist"],
    desiredMods: [
      { text: "# to Level of all Spell Skills", tier: "core", min: 3, note: "amulet +levels is a defining caster slot" },
      { text: "# to Spirit", tier: "ideal", min: 30 },
      { ...LIFE, min: 60 },
      ATTR_ALL,
    ],
  },
  {
    key: "ring",
    label: "Ring — life + res",
    category: "accessory.ring",
    slot: "Ring",
    ilvlMin: 75,
    ascendancies: ["(all)"],
    desiredMods: [LIFE, ...RES_CORE, ATTR_ALL, { text: "# to maximum Mana", tier: "luxury", min: 60 }],
  },
  {
    key: "belt",
    label: "Belt — life + res",
    category: "accessory.belt",
    slot: "Belt",
    ilvlMin: 75,
    ascendancies: ["(all)"],
    desiredMods: [{ ...LIFE, min: 100 }, ...RES_CORE, CHAOS_RES],
  },
];

const norm = (s: string): string => s.toLowerCase().replace(/\+/g, "").replace(/\s+/g, " ").trim();

export interface ResolvedMod extends DesiredMod {
  /** trade stat id once resolved against the catalog; null if the catalog lacks this text */
  id: string | null;
}

/** Resolve a target's mod texts to trade ids via the catalog. Keeps unresolved mods (id=null) so the UI can flag them. */
export function resolveTarget(target: CraftTarget, idx: StatIndex): ResolvedMod[] {
  return target.desiredMods.map((m) => {
    const matches = idx.byText.get(norm(m.text));
    if (!matches || matches.length === 0) return { ...m, id: null };
    const pick = m.pseudoFirst ? (matches.find((x) => x.group === "pseudo") ?? matches[0]!) : matches[0]!;
    return { ...m, id: pick.id };
  });
}

/** StatFilters for a resell search built from a target's resolved mods (drops unresolved). */
export function targetToFilters(resolved: ResolvedMod[], tiers: ModTier[] = ["core", "ideal"]): StatFilter[] {
  return resolved
    .filter((m): m is ResolvedMod & { id: string } => m.id !== null && tiers.includes(m.tier))
    .map((m) => ({ id: m.id, ...(m.min != null ? { min: m.min } : {}) }));
}

export { buildStatIndex };
