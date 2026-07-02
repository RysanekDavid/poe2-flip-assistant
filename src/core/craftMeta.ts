import buildMeta from "../data/buildMeta.json";
import { fetchTradeMeta } from "../api/tradeMeta";
import { buildStatIndex } from "./statResolver";
import { CRAFT_TARGETS, resolveTarget, type CraftTarget, type ResolvedMod } from "./craftTargets";

/**
 * Merge layer: curated craft targets (src/core/craftTargets.ts) × scraped meta weights
 * (src/data/buildMeta.json, refreshed monthly via `npm run scrape:builds`). The scrape only
 * ranks — desirability always comes from the curated library.
 */

export interface TargetWeight {
  /** % of characters running this weapon type (weaponConfig join); null for non-weapons */
  weaponPct: number | null;
  /** % of characters wearing a Rare in this slot (items "Rare <Slot>" join); null if not listed */
  slotUsagePct: number | null;
  /** summed % of the target's hinted ascendancies; 100 for "(all)" */
  ascendancyPct: number;
  /** ranking score — max of the availables, so every target is comparable */
  score: number;
}

export interface WeightedTarget extends CraftTarget {
  resolvedMods: ResolvedMod[];
  weight: TargetWeight;
}

export interface MetaUnique {
  name: string;
  pct: number;
  baseType: string | null;
}

export interface CraftTargetsPayload {
  league: string;
  scrapedAt: string;
  totalCharacters: number;
  targets: WeightedTarget[];
  /** top uniques from the builds page (mostly jewels/charms/flasks) — market context, not craft targets */
  metaUniques: MetaUnique[];
  ascendancies: Array<{ name: string; pct: number }>;
}

// trade2 category → weaponConfig token ("Wand / Sceptre" counts for both wand and sceptre)
const WEAPON_TOKEN: Record<string, string> = {
  "weapon.wand": "Wand",
  "weapon.staff": "Staff",
  "weapon.sceptre": "Sceptre",
  "weapon.warstaff": "Quarterstaff",
  "weapon.crossbow": "Crossbow",
  "weapon.bow": "Bow",
  "weapon.spear": "Spear",
  "armour.focus": "Focus",
};

function weaponPct(category: string): number | null {
  const token = WEAPON_TOKEN[category];
  if (!token) return null;
  let sum = 0;
  let hit = false;
  for (const row of buildMeta.weaponConfig) {
    const tokens = row.name.split("/").map((t) => t.trim());
    if (tokens.some((t) => t === token || t.startsWith(`${token} `))) {
      sum += row.pct;
      hit = true;
    }
  }
  return hit ? sum : null;
}

function slotUsagePct(slot: string): number | null {
  const row = buildMeta.items.find((i) => i.name === `Rare ${slot}`);
  return row ? row.pct : null;
}

function ascendancyPct(hints: string[]): number {
  if (hints.includes("(all)")) return 100;
  let sum = 0;
  for (const a of buildMeta.ascendancies) {
    if (hints.includes(a.name)) sum += a.pct;
  }
  return Math.round(sum * 10) / 10;
}

function weigh(target: CraftTarget): TargetWeight {
  const w = weaponPct(target.category);
  const s = slotUsagePct(target.slot);
  const asc = ascendancyPct(target.ascendancies);
  // "(all)"-ascendancy targets rank by slot usage, build-specific ones by weapon/ascendancy share.
  // A universal slot the truncated scrape misses (e.g. Belt) still deserves a mid-list default.
  let score = Math.max(w ?? 0, s ?? 0, asc === 100 ? 0 : asc);
  if (score === 0 && asc === 100) score = 50;
  return { weaponPct: w, slotUsagePct: s, ascendancyPct: asc, score };
}

/** Full payload for /api/craft/targets — resolves the curated library against the live stat catalog. */
export async function buildCraftTargetsPayload(): Promise<CraftTargetsPayload> {
  const { stats, uniques } = await fetchTradeMeta();
  const idx = buildStatIndex(stats);
  const uniqueByName = new Map(uniques.map((u) => [u.name, u.type]));

  const targets: WeightedTarget[] = CRAFT_TARGETS.map((t) => ({
    ...t,
    resolvedMods: resolveTarget(t, idx),
    weight: weigh(t),
  })).sort((a, b) => b.weight.score - a.weight.score);

  const metaUniques: MetaUnique[] = buildMeta.items
    .filter((i) => !/^(Rare|Magic) /.test(i.name))
    .map((i) => ({ name: i.name, pct: i.pct, baseType: uniqueByName.get(i.name) ?? null }));

  return {
    league: buildMeta.league,
    scrapedAt: buildMeta.scrapedAt,
    totalCharacters: buildMeta.totalCharacters,
    targets,
    metaUniques,
    ascendancies: buildMeta.ascendancies.filter((a) => a.pct >= 0.5),
  };
}
