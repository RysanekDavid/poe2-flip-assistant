/*
 * RePoE mods_by_base → one RegexPool per tab. Tiers collapse into their mod family (one selectable
 * row per family); every tier keeps its own ranges and bands so thresholds and tier filters stay
 * exact. Only rolled prefix/suffix mods (plus desecrated ones) are selectable: unique, logbook and
 * corruption sides are skipped, the latter kept as collision-only `foreignLines`.
 */
import { cleanTemplate, spawnsOn, type Repoe, type RepoeMod } from "../repoe/snapshot";
import { generalizeLine, segmentsOf } from "../../core/tools/regex/pools/template";
import type { PoolLine, PoolMod, PoolTab, PoolTier, RegexPool, Stamp } from "../../core/tools/regex/pools/schema";
import { OTHER_GROUP, TAB_GROUPS, groupOf } from "./groups";

type Side = "prefix" | "suffix";

interface TabSource {
  /** mods_by_base key (the item class display name). */
  classKey: string;
  bands: ReadonlyArray<{ id: string; label: string }>;
  bandOf: (tags: ReadonlySet<string>) => string | null;
  /** Waystone/tablet mods carry extra "N% more …" lines the tooltip folds into header properties. */
  dropHeaderBonus: boolean;
}

const tagMatch = (tags: ReadonlySet<string>, re: RegExp): string | null => {
  for (const t of tags) {
    const m = re.exec(t);
    if (m?.[1]) return m[1];
  }
  return null;
};

export const TAB_SOURCES: Readonly<Record<PoolTab, TabSource>> = {
  waystone: {
    classKey: "Waystones",
    bands: [
      { id: "low", label: "Tier 1–5" },
      { id: "medium", label: "Tier 6–10" },
      { id: "high", label: "Tier 11–15" },
      { id: "highest", label: "Tier 16" },
    ],
    bandOf: (tags) => tagMatch(tags, /^map_key_(low|medium|high|highest)$/),
    dropHeaderBonus: true,
  },
  tablet: {
    classKey: "Tablet",
    bands: TAB_GROUPS.tablet.filter((g) => g.id !== "shared"),
    bandOf: (tags) => tagMatch(tags, /^tower_augment_(\w+)$/),
    dropHeaderBonus: true,
  },
  relic: {
    classKey: "Relics",
    bands: TAB_GROUPS.relic.filter((g) => g.id !== "shared"),
    bandOf: (tags) => tagMatch(tags, /^(small|medium|large)_sanctum_relic$/),
    dropHeaderBonus: false,
  },
  jewel: {
    classKey: "Jewels",
    bands: [
      { id: "jewel", label: "Ruby / Emerald / Sapphire / Diamond" },
      { id: "radius", label: "Time-Lost (radius)" },
    ],
    bandOf: (tags) => (tags.has("radius_jewel") ? "radius" : tags.has("jewel") ? "jewel" : null),
    dropHeaderBonus: false,
  },
};

/**
 * Hidden bonus lines RePoE lists under waystone/tablet mods. The tooltip sums them into header
 * properties (Item Rarity, Monster Rarity, Waystone Drop Chance, …) — verified against the
 * Sidekick #1276 clipboard, whose header totals equal the sums of these lines — so they are never
 * item text a search can hit. Fixed numbers only: a rolled "(10-15)% increased Effectiveness"
 * tablet mod is a real line and must survive.
 */
export const HEADER_BONUS_LINES: readonly RegExp[] = [
  /^\d+% more Waystones found in Area$/,
  /^Monsters have \d+% more Effectiveness$/,
  /^\d+% more Rarity of Items found in this Area$/,
  /^\d+% more Pack size$/,
  /^\d+% more Magic and Rare Monsters$/,
  /^Rare Monsters have \d+% more chance of Monster Modifiers$/,
];

interface RawTier {
  modId: string;
  family: string;
  side: Side;
  desecrated: boolean;
  level: number;
  name: string;
  tags: string[];
  lines: string[];
  bands: Set<string>;
  combos: Set<string>;
}

export interface PoolBuildStats {
  zeroWeight: string[];
  hiddenText: string[];
}

const isSide = (g: string): g is Side => g === "prefix" || g === "suffix";
const familyOf = (m: RepoeMod): string => m.type ?? m.groups[0] ?? "";

function displayLines(m: RepoeMod, dropHeaderBonus: boolean): string[] {
  const lines = cleanTemplate(m.text ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  return dropHeaderBonus ? lines.filter((l) => !HEADER_BONUS_LINES.some((re) => re.test(l))) : lines;
}

interface Walk {
  repoe: Repoe;
  src: TabSource;
  tiers: Map<string, RawTier>;
  foreign: Set<string>;
  stats: PoolBuildStats;
}

function addTier(w: Walk, modId: string, m: RepoeMod, side: Side, desecrated: boolean, where: { band: string; combo: string }): void {
  const existing = w.tiers.get(modId);
  if (existing) {
    existing.bands.add(where.band);
    existing.combos.add(where.combo);
    return;
  }
  const lines = displayLines(m, w.src.dropHeaderBonus);
  if (lines.length === 0) {
    // hidden or header-only mods have no tooltip line a search could hit
    if (!w.stats.hiddenText.includes(modId)) w.stats.hiddenText.push(modId);
    return;
  }
  w.tiers.set(modId, {
    modId,
    family: familyOf(m),
    side,
    desecrated,
    level: m.required_level,
    name: m.name?.trim() ?? "",
    tags: m.implicit_tags ?? [],
    lines,
    bands: new Set([where.band]),
    combos: new Set([where.combo]),
  });
}

function walkCombo(w: Walk, combo: string, sides: Record<string, Record<string, Record<string, number>>>): void {
  const tags = new Set(combo.split(","));
  const band = w.src.bandOf(tags);
  if (band === null) throw new Error(`${w.src.classKey} combo "${combo}" maps to no band`);
  for (const [side, families] of Object.entries(sides)) {
    for (const ids of Object.values(families)) {
      for (const modId of Object.keys(ids)) {
        const m = w.repoe.mods[modId];
        if (!m) throw new Error(`mods_by_base references unknown mod ${modId}`);
        if (side === "corrupted") {
          for (const line of displayLines(m, false)) w.foreign.add(generalizeLine(line).template);
          continue;
        }
        if (!isSide(side) || m.generation_type !== side) continue; // unique / logbook sides
        if (!spawnsOn(m, tags)) {
          if (!w.stats.zeroWeight.includes(modId)) w.stats.zeroWeight.push(modId);
          continue;
        }
        addTier(w, modId, m, side, false, { band, combo });
      }
    }
  }
  for (const [modId, m] of Object.entries(w.repoe.mods)) {
    if (m.domain !== "desecrated" || !isSide(m.generation_type) || !spawnsOn(m, tags)) continue;
    addTier(w, modId, m, m.generation_type, true, { band, combo });
  }
}

/** Released, non-unique-only bases of a combo; empty means the combo is not a real drop. */
function releasedBases(repoe: Repoe, ids: readonly string[]): string[] {
  return ids.flatMap((id) => {
    const b = repoe.base_items[id];
    const name = b?.name?.trim();
    return b && name && b.release_state === "released" ? [name] : [];
  });
}

function walkTab(repoe: Repoe, tab: PoolTab): { walk: Walk; baseBands: Map<string, Set<string>> } {
  const src = TAB_SOURCES[tab];
  const combos = repoe.mods_by_base[src.classKey];
  if (!combos) throw new Error(`RePoE mods_by_base has no "${src.classKey}" class`);
  const walk: Walk = { repoe, src, tiers: new Map(), foreign: new Set(), stats: { zeroWeight: [], hiddenText: [] } };
  const baseBands = new Map<string, Set<string>>();
  for (const [combo, entry] of Object.entries(combos)) {
    const names = releasedBases(repoe, entry.bases);
    if (names.length === 0) continue; // e.g. the unique-only Timeless Jewel combo
    const band = src.bandOf(new Set(combo.split(",")));
    for (const n of names) baseBands.set(n, new Set([...(baseBands.get(n) ?? []), ...(band ? [band] : [])]));
    walkCombo(walk, combo, entry.mods);
  }
  return { walk, baseBands };
}

const trailingNumber = (id: string): number | null => {
  const m = /(\d+)$/.exec(id);
  return m?.[1] ? Number(m[1]) : null;
};

/** Ordinal per band set: the id's trailing number when every tier has one, else level rank. */
function numberTiers(raw: readonly RawTier[]): Map<string, number> {
  const out = new Map<string, number>();
  const allNumbered = raw.every((t) => trailingNumber(t.modId) !== null);
  const byBands = new Map<string, RawTier[]>();
  for (const t of raw) {
    const key = [...t.bands].sort().join(",");
    byBands.set(key, [...(byBands.get(key) ?? []), t]);
  }
  for (const [key, group] of byBands) {
    const sorted = [...group].sort(
      (a, b) => a.level - b.level || (trailingNumber(a.modId) ?? 0) - (trailingNumber(b.modId) ?? 0) || a.modId.localeCompare(b.modId),
    );
    const taken = new Set<number>();
    sorted.forEach((t, i) => {
      const tier = allNumbered ? (trailingNumber(t.modId) ?? i + 1) : i + 1;
      if (taken.has(tier)) throw new Error(`tier ordinal ${tier} is not unique in family ${t.family} bands ${key}`);
      taken.add(tier);
      out.set(t.modId, tier);
    });
  }
  return out;
}

function toLines(raw: readonly RawTier[], tierNo: Map<string, number>, bandOrder: readonly string[]): { lines: PoolLine[]; tiers: PoolTier[] } {
  const lines: PoolLine[] = [];
  const index = new Map<string, number>();
  const bandRank = (t: RawTier): number => Math.min(...[...t.bands].map((b) => bandOrder.indexOf(b)));
  const ordered = [...raw].sort((a, b) => bandRank(a) - bandRank(b) || (tierNo.get(a.modId) ?? 0) - (tierNo.get(b.modId) ?? 0));
  const tiers = ordered.map((t): PoolTier => {
    const tierLines = t.lines.map((text) => {
      const g = generalizeLine(text);
      let at = index.get(g.template);
      if (at === undefined) {
        at = lines.length;
        index.set(g.template, at);
        lines.push({ template: g.template, segments: segmentsOf(g.template), numeric: { count: g.ranges.length, decimals: g.decimals } });
      }
      const line = lines[at];
      if (line && g.decimals > line.numeric.decimals) line.numeric = { ...line.numeric, decimals: g.decimals };
      return { line: at, ranges: g.ranges };
    });
    const bands = bandOrder.filter((b) => t.bands.has(b));
    return { modId: t.modId, tier: tierNo.get(t.modId) ?? 1, bands, level: t.level, lines: tierLines };
  });
  return { lines, tiers };
}

function collapse(tab: PoolTab, tiers: Iterable<RawTier>, bandOrder: readonly string[]): PoolMod[] {
  const families = new Map<string, RawTier[]>();
  for (const t of tiers) families.set(t.family, [...(families.get(t.family) ?? []), t]);
  const mods: PoolMod[] = [];
  for (const [family, raw] of families) {
    const first = raw[0];
    if (!first || family === "") throw new Error(`${tab}: mod ${first?.modId ?? "?"} has no family`);
    if (raw.some((t) => t.side !== first.side || t.desecrated !== first.desecrated)) {
      throw new Error(`${tab}: family ${family} mixes sides or desecrated/regular tiers — give it distinct ids`);
    }
    const { lines, tiers: poolTiers } = toLines(raw, numberTiers(raw), bandOrder);
    const bands = new Set(raw.flatMap((t) => [...t.bands]));
    const combos = new Set(raw.flatMap((t) => [...t.combos]));
    mods.push({
      id: family,
      side: first.side,
      name: [...raw].sort((a, b) => a.level - b.level)[0]?.name ?? "",
      group: groupOf(tab, { family, desecrated: first.desecrated, bands, combos }),
      tags: [...new Set(raw.flatMap((t) => t.tags))].sort(),
      desecrated: first.desecrated,
      lines,
      tiers: poolTiers,
    });
  }
  return mods;
}

export function buildPool(repoe: Repoe, tab: PoolTab, stamp: Stamp): { pool: RegexPool; stats: PoolBuildStats } {
  const src = TAB_SOURCES[tab];
  const { walk, baseBands } = walkTab(repoe, tab);
  const bandOrder = src.bands.map((b) => b.id);
  const bases = [...baseBands.keys()].sort();
  const mods = collapse(tab, walk.tiers.values(), bandOrder);
  const groups = [...TAB_GROUPS[tab]];
  const groupRank = (g: string): number => (g === OTHER_GROUP.id ? groups.length : groups.findIndex((x) => x.id === g));
  if (mods.some((m) => m.group === OTHER_GROUP.id)) groups.push(OTHER_GROUP);
  mods.sort((a, b) => groupRank(a.group) - groupRank(b.group) || a.side.localeCompare(b.side) || a.id.localeCompare(b.id));
  const usedGroups = groups.filter((g) => mods.some((m) => m.group === g.id));
  const pool: RegexPool = {
    stamp,
    tab,
    groups: usedGroups,
    bands: [...src.bands],
    bases,
    baseBands: Object.fromEntries(bases.map((b) => [b, bandOrder.filter((id) => baseBands.get(b)?.has(id))])),
    foreignLines: [...walk.foreign].sort(),
    mods,
  };
  return { pool, stats: walk.stats };
}
