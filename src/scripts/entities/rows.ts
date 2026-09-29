/*
 * Assemble entity rows. Exchange items come from trade2 `data/static` (the authoritative list of
 * what players trade, with signed art) joined to RePoE base items by art path; uniques come from
 * RePoE `uniques` with art + base type from poe2scout.
 */
import { ENTITY_ID_PATTERN, POECDN_ICON_PATTERN, type EntityKind, type EntityRow } from "../../core/entities/schema";
import type { EntityRepoe, RepoeBaseItem } from "./repoeText";
import { gameText, itemText, poe2dbUrl, slugify } from "./repoeText";
import { absoluteIcon, artPathFromDds, artPathFromImage, type EntitySources } from "./sources";

/**
 * Extra surface forms the Coach may use. Deliberately tiny and unambiguous: bare "Divine",
 * "Chaos" or "Exalted" would hit "Divine Orb" but also "Trial of Chaos" and "chaos damage".
 */
const CURATED_ALIASES: Record<string, string[]> = {
  "Orb of Alchemy": ["Alchemy Orb"],
  "Orb of Annulment": ["Annulment Orb"],
  "Orb of Transmutation": ["Transmutation Orb"],
  "Orb of Augmentation": ["Augmentation Orb"],
  "Gemcutter's Prism": ["GCP"],
  "Scroll of Wisdom": ["Wisdom Scroll"],
};

const FRAGMENT_CLASSES = new Set(["MapFragment", "PinnacleKey_OLD", "PinnacleKeyStackable", "VaultKey", "Breachstone", "AtlasCurrency"]);
const AUGMENT_KIND: Record<string, EntityKind> = { Rune: "rune", SoulCore: "soul_core", Idol: "idol" };

interface BaseCandidate {
  id: string;
  base: RepoeBaseItem;
}

function classify(group: string, candidate: BaseCandidate, repoe: EntityRepoe, name: string): EntityKind {
  const itemClass = candidate.base.item_class;
  if (itemClass === "Omen") return "omen";
  if (group === "Essences") return "essence";
  if (/ Catalyst$/.test(name)) return "catalyst";
  if (itemClass === "SoulCore") return AUGMENT_KIND[repoe.augments[candidate.id]?.type_id ?? ""] ?? "augment";
  if (group === "LineageSupportGems") return "lineage_gem";
  if (group === "UncutGems") return "uncut_gem";
  if (group === "Waystones") return "waystone";
  if (FRAGMENT_CLASSES.has(itemClass) || / Splinter$/.test(name)) return "fragment";
  if (itemClass === "StackableCurrency" || itemClass === "IncubatorStackable") return "currency";
  return "other";
}

/** Several RePoE records share one art file (quest copies, retired `_OLD` classes): prefer the live, texted one. */
function candidateScore({ id, base }: BaseCandidate): number {
  let score = 0;
  if (base.release_state === "released") score += 8;
  if (base.item_class !== "QuestItem" && !base.item_class.endsWith("_OLD") && !id.includes("Quest")) score += 4;
  if (gameText(base.properties?.description)) score += 2;
  if (gameText(base.properties?.directions)) score += 1;
  return score;
}

function pickBase(candidates: BaseCandidate[]): BaseCandidate {
  const sorted = [...candidates].sort((a, b) => candidateScore(b) - candidateScore(a) || a.id.localeCompare(b.id));
  return sorted[0]!;
}

function basesByArt(repoe: EntityRepoe): Map<string, BaseCandidate[]> {
  const index = new Map<string, BaseCandidate[]>();
  for (const [id, base] of Object.entries(repoe.base_items)) {
    const dds = base.visual_identity?.dds_file;
    if (!dds) continue;
    const key = artPathFromDds(dds);
    index.set(key, [...(index.get(key) ?? []), { id, base }]);
  }
  return index;
}

function exchangeRow(group: string, entry: { id: string; text: string; image: string }, picked: BaseCandidate, repoe: EntityRepoe): EntityRow {
  // trade2 ids are slugs but may keep diacritics ("legacy-of-mjölner"); exchange_id keeps the raw one.
  const id = slugify(entry.id);
  if (!ENTITY_ID_PATTERN.test(id)) throw new Error(`trade2 static id "${entry.id}" does not slug to a valid entity id`);
  const text = itemText(picked.id, picked.base, repoe);
  return {
    id,
    kind: classify(group, picked, repoe, entry.text),
    name: entry.text,
    aliases: CURATED_ALIASES[entry.text] ?? [],
    summary: text.summary,
    directions: text.directions,
    stack_size: picked.base.properties?.stack_size && picked.base.properties.stack_size > 0 ? picked.base.properties.stack_size : null,
    icon_url: absoluteIcon(entry.image),
    exchange_id: entry.id,
    repoe_id: picked.id,
    item_class: picked.base.item_class,
    base_type: null,
    poe2db_url: poe2dbUrl(entry.text),
  };
}

/** Every trade2 static entry with art resolves to exactly one RePoE item, or the build fails. */
export function exchangeRows(sources: EntitySources, repoe: EntityRepoe): EntityRow[] {
  const index = basesByArt(repoe);
  const rows: EntityRow[] = [];
  const seen = new Set<string>();
  const unresolved: string[] = [];
  for (const group of sources.tradeStatic.result) {
    for (const entry of group.entries) {
      // Entries without art are the static list's section separators ("Omens", "Soul Cores").
      if (!entry.image || seen.has(entry.text)) continue;
      const art = artPathFromImage(entry.image);
      const named = (index.get(art) ?? []).filter((c) => c.base.name === entry.text);
      if (named.length === 0) {
        unresolved.push(`${group.id}: ${entry.text} (${art})`);
        continue;
      }
      seen.add(entry.text);
      rows.push(exchangeRow(group.id, { ...entry, image: entry.image }, pickBase(named), repoe));
    }
  }
  if (unresolved.length > 0) {
    throw new Error(`${unresolved.length} trade2 static item(s) have no RePoE record by art path:\n  ${unresolved.join("\n  ")}`);
  }
  return rows;
}

interface ScoutUnique {
  icon: string | null;
  baseType: string | null;
}

function scoutUniqueIndex(sources: EntitySources): { byArt: Map<string, ScoutUnique>; byName: Map<string, ScoutUnique> } {
  const byArt = new Map<string, ScoutUnique>();
  const byName = new Map<string, ScoutUnique>();
  for (const item of sources.scoutUniques) {
    if (!item.Name) continue;
    const icon = item.IconUrl && POECDN_ICON_PATTERN.test(item.IconUrl) ? item.IconUrl : null;
    const value = { icon, baseType: item.Type ?? null };
    if (!byName.has(item.Name)) byName.set(item.Name, value);
    if (icon && !byArt.has(artPathFromImage(icon))) byArt.set(artPathFromImage(icon), value);
  }
  return { byArt, byName };
}

/** RePoE uniques (deduplicated by name; exchange rows win a name clash), art + base type from scout. */
export function uniqueRows(sources: EntitySources, repoe: EntityRepoe, taken: ReadonlySet<string>): EntityRow[] {
  const scout = scoutUniqueIndex(sources);
  const rows: EntityRow[] = [];
  const seen = new Set<string>(taken);
  for (const unique of Object.values(repoe.uniques)) {
    if (unique.is_alternate_art || seen.has(unique.name)) continue;
    seen.add(unique.name);
    const art = artPathFromDds(unique.visual_identity.dds_file);
    const match = scout.byArt.get(art) ?? scout.byName.get(unique.name) ?? null;
    rows.push({
      id: `unique-${slugify(unique.name)}`,
      kind: "unique",
      name: unique.name,
      aliases: [],
      // Uniques have no "what it does" line in RePoE; flavour text is the only game text available.
      summary: gameText(repoe.flavour[unique.visual_identity.id]),
      directions: null,
      stack_size: null,
      icon_url: match?.icon ?? null,
      exchange_id: null,
      repoe_id: unique.visual_identity.id,
      item_class: unique.item_class,
      base_type: match?.baseType ?? null,
      poe2db_url: poe2dbUrl(unique.name),
    });
  }
  return rows;
}

/** Aliases must point at real rows and never collide with another row's name. */
export function assertCatalogIntegrity(rows: EntityRow[]): void {
  const ids = new Set<string>();
  const surfaces = new Map<string, string>();
  for (const row of rows) {
    if (ids.has(row.id)) throw new Error(`duplicate entity id ${row.id}`);
    ids.add(row.id);
    for (const surface of [row.name, ...row.aliases]) {
      const key = surface.toLowerCase();
      const owner = surfaces.get(key);
      if (owner && owner !== row.id) throw new Error(`surface "${surface}" belongs to both ${owner} and ${row.id}`);
      surfaces.set(key, row.id);
    }
  }
  const names = new Set(rows.map((r) => r.name));
  const orphan = Object.keys(CURATED_ALIASES).filter((name) => !names.has(name));
  if (orphan.length > 0) throw new Error(`curated aliases for unknown entities: ${orphan.join(", ")}`);
}
