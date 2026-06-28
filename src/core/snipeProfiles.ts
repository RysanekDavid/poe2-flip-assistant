import { buildStatIndex, type StatIndex } from "./statResolver";
import type { StatFilter, TradeQuery } from "../lib/tradeLink";

/**
 * Built-in valuable rare archetypes the auto-scanner rotates over. This is the
 * NO-MANUAL-ENTRY part: the user never types a search — we ship the high-value stat
 * profiles (life + total resistance gear, caster weapons, …) and the scanner searches each,
 * treating the returned cheapest-first listings as a comparable set (median = value, a
 * listing far under = snipe). Categories/mins are tunable once live data confirms them.
 *
 * Stats are declared by their catalog TEXT (with '#' for the roll) so we resolve the real
 * trade id from the same `/data/stats` catalog at runtime — no hardcoded `stat_XXXX`.
 */
export interface ProfileStat {
  text: string; // catalog template, "#% total Elemental Resistance"
  min: number; // minimum roll to search on
  pseudoFirst?: boolean; // prefer the pseudo-group id when the text exists in several groups
}
export interface SnipeProfile {
  key: string;
  label: string;
  category: string; // trade2 category option, e.g. "armour.gloves"
  ilvlMin: number;
  stats: ProfileStat[];
}

/**
 * VALUABLE PoE2 (0.5 "Runes of Aldur") rare archetypes — the engine values each candidate item
 * individually, so these searches exist to point it at the chase mods that actually carry value
 * (+skill levels, Spirit, high flat phys, movement speed), NOT generic life/resistance gear which
 * is worthless in PoE2. Stat texts must match the `/data/stats` catalog; any that don't resolve
 * are dropped silently (a profile that resolves 0 stats is reported as an archetype error). Mins
 * are starting points from market research — tune against the live diag.
 *
 * Category strings flagged uncertain in research (quarterstaff/spear are new in PoE2): if one is
 * wrong the archetype 400s and is surfaced in `errors`, it doesn't abort the scan. Verify against
 * a live `data/items` fetch and adjust.
 */
export const SNIPE_PROFILES: SnipeProfile[] = [
  // --- caster weapons (the top chase) ---
  {
    key: "wand_spell_levels",
    label: "Wand · spell levels",
    category: "weapon.wand",
    ilvlMin: 80,
    stats: [
      { text: "# to Level of all Spell Skills", min: 4 },
      { text: "#% increased Spell Damage", min: 100 },
    ],
  },
  {
    key: "focus_spell_levels",
    label: "Focus · spells + crit",
    category: "armour.focus",
    ilvlMin: 80,
    stats: [
      { text: "# to Level of all Spell Skills", min: 2 },
      { text: "#% increased Critical Hit Chance for Spells", min: 80 },
    ],
  },
  {
    key: "staff_spell_levels",
    label: "Staff · spell levels",
    category: "weapon.staff",
    ilvlMin: 80,
    stats: [
      { text: "# to Level of all Spell Skills", min: 5 },
      { text: "#% increased Spell Damage", min: 120 },
    ],
  },
  {
    key: "sceptre_spirit",
    label: "Sceptre · Spirit",
    category: "weapon.sceptre",
    ilvlMin: 80,
    stats: [{ text: "# to Spirit", min: 40 }],
  },
  // --- attack weapons ---
  {
    key: "quarterstaff_phys",
    label: "Quarterstaff · melee lvls + AS",
    category: "weapon.warstaff",
    ilvlMin: 80,
    stats: [
      { text: "# to Level of all Melee Skills", min: 2 },
      { text: "#% increased Attack Speed (Local)", min: 20 },
    ],
  },
  {
    key: "crossbow_phys",
    label: "Crossbow · proj lvls + AS",
    category: "weapon.crossbow",
    ilvlMin: 80,
    stats: [
      { text: "# to Level of all Projectile Skills", min: 2 },
      { text: "#% increased Attack Speed (Local)", min: 20 },
    ],
  },
  {
    key: "bow_phys",
    label: "Bow · proj lvls + AS",
    category: "weapon.bow",
    ilvlMin: 80,
    stats: [
      { text: "# to Level of all Projectile Skills", min: 2 },
      { text: "#% increased Attack Speed (Local)", min: 20 },
    ],
  },
  // --- spirit + +levels accessories ---
  {
    key: "amulet_spell_levels",
    label: "Amulet · spell levels",
    category: "accessory.amulet",
    ilvlMin: 75,
    stats: [{ text: "# to Level of all Spell Skills", min: 3 }],
  },
  {
    key: "amulet_spirit",
    label: "Amulet · Spirit",
    category: "accessory.amulet",
    ilvlMin: 75,
    stats: [{ text: "# to Spirit", min: 40 }],
  },
  {
    key: "ring_attributes",
    label: "Ring · all attributes",
    category: "accessory.ring",
    ilvlMin: 75,
    stats: [{ text: "# to all Attributes", min: 10 }],
  },
  // --- armour with chase mods ---
  {
    key: "gloves_melee_levels",
    label: "Gloves · melee lvls + AS",
    category: "armour.gloves",
    ilvlMin: 80,
    stats: [
      { text: "# to Level of all Melee Skills", min: 2 },
      { text: "#% increased Attack Speed", min: 12 },
    ],
  },
  {
    key: "boots_ms",
    label: "Boots · 35% MS",
    category: "armour.boots",
    ilvlMin: 80,
    stats: [{ text: "#% increased Movement Speed", min: 35 }],
  },
  {
    key: "chest_spirit_es",
    label: "Body · Spirit",
    category: "armour.chest",
    ilvlMin: 80,
    stats: [{ text: "# to Spirit", min: 30 }],
  },
];

const norm = (s: string): string => s.toLowerCase().replace(/\+/g, "").replace(/\s+/g, " ").trim();

/** Resolve a profile's stat texts to trade ids via the catalog. Drops any the catalog lacks. */
export function profileToQuery(profile: SnipeProfile, idx: StatIndex): { query: TradeQuery; resolved: number } {
  const filters: StatFilter[] = [];
  for (const s of profile.stats) {
    const matches = idx.byText.get(norm(s.text));
    if (!matches || matches.length === 0) continue;
    const pick = s.pseudoFirst ? (matches.find((m) => m.group === "pseudo") ?? matches[0]!) : matches[0]!;
    filters.push({ id: pick.id, min: s.min });
  }
  return {
    query: { category: profile.category, rarity: "rare", ilvlMin: profile.ilvlMin, corrupted: false, online: true, stats: filters },
    resolved: filters.length,
  };
}

/** Helper re-export so callers build the index once and pass it to profileToQuery. */
export { buildStatIndex };
