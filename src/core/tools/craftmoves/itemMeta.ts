import type { ParsedItem } from "../../itemParser";
import type { CraftCatalog } from "./catalog";

/** Header facts parseItem does not keep: the item class line, quality and the Unidentified tag. */
export interface ItemMeta {
  itemClass: string | null;
  quality: number | null;
  unidentified: boolean;
}

export function readItemMeta(text: string): ItemMeta {
  const lines = text.replace(/\r/g, "").split("\n").map((l) => l.trim());
  const cls = lines.find((l) => /^Item Class:/i.test(l));
  const q = lines.map((l) => /^Quality(?: \([^)]*\))?:\s*\+?(\d+)%/i.exec(l)).find(Boolean);
  return {
    itemClass: cls ? cls.replace(/^Item Class:\s*/i, "").trim() || null : null,
    quality: q ? Number(q[1]) : null,
    unidentified: lines.some((l) => /^Unidentified$/i.test(l)),
  };
}

export interface BaseResolution {
  itemClass: string | null;
  baseType: string | null;
  ambiguous: boolean;
}

let namesByClass: { cat: CraftCatalog; byClass: Map<string, string[]> } | null = null;

/** Base names per class, longest first, so containment picks "Vaal Gauntlets" over "Gauntlets". */
function classNames(cat: CraftCatalog): Map<string, string[]> {
  if (namesByClass?.cat === cat) return namesByClass.byClass;
  const byClass = new Map<string, string[]>();
  for (const [name, b] of Object.entries(cat.bases)) {
    const arr = byClass.get(b.itemClass);
    if (arr) arr.push(name);
    else byClass.set(b.itemClass, [name]);
  }
  for (const arr of byClass.values()) arr.sort((a, b) => b.length - a.length);
  namesByClass = { cat, byClass };
  return byClass;
}

const containsWord = (hay: string, needle: string): boolean =>
  new RegExp(`(^|\\s)${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|\\s)`).test(hay);

/**
 * Which catalog base the pasted item is. Rares print the base on its own line; magic items fold it
 * into "Prefix Base of Suffix", so containment is the fallback. The class line wins over the base's
 * own class when both exist (it is what the game printed).
 */
export function resolveBase(cat: CraftCatalog, meta: ItemMeta, parsed: ParsedItem): BaseResolution {
  const exact = [parsed.baseType, parsed.name].map((n) => n.trim()).find((n) => cat.bases[n] != null);
  if (exact) {
    const b = cat.bases[exact]!;
    return { itemClass: meta.itemClass ?? b.itemClass, baseType: exact, ambiguous: b.ambiguous };
  }
  const pools = meta.itemClass ? [classNames(cat).get(meta.itemClass) ?? []] : [...classNames(cat).values()];
  for (const names of pools) {
    const hit = names.find((n) => containsWord(parsed.baseType, n) || containsWord(parsed.name, n));
    if (hit) {
      const b = cat.bases[hit]!;
      return { itemClass: meta.itemClass ?? b.itemClass, baseType: hit, ambiguous: b.ambiguous };
    }
  }
  return { itemClass: meta.itemClass, baseType: null, ambiguous: false };
}
