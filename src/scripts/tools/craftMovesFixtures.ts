/* Item fixtures for test:tools:craft-moves, rendered from the real craft catalog so a template or
 * tier change in a new RePoE snapshot is exercised instead of hidden behind hand-typed numbers. */
import assert from "node:assert/strict";
import { comboFor, type CraftCatalog } from "../../core/tools/craftmoves/catalog";

/** Lowest tier of a family on a base, rendered at each range's minimum ("+(5-8) to X" → "+5 to X"). */
export function renderFamily(cat: CraftCatalog, itemClass: string, base: string, side: "prefix" | "suffix", family: string, marker = ""): string[] {
  const combo = comboFor(cat, itemClass, base);
  assert.ok(combo, `${itemClass}/${base} must be in the catalog`);
  const tiers = combo[side][family];
  assert.ok(tiers, `${base} must roll ${side} family ${family}`);
  const [modId] = Object.entries(tiers).sort((a, b) => a[1] - b[1])[0]!;
  const lines = cat.mods[modId]!.text.split("\n").map((l) => l.replace(/\((-?\d+(?:\.\d+)?)-(-?\d+(?:\.\d+)?)\)/g, "$1"));
  return marker ? lines.map((l) => `${l} (${marker})`) : lines;
}

export interface ItemSpec {
  itemClass: string;
  rarity: "Normal" | "Magic" | "Rare";
  base: string;
  name?: string;
  ilvl: number;
  lines: string[];
  extra?: string[]; // trailing tag lines: "Corrupted", "Mirrored"
}

/** A PoE2 Ctrl+C block: header, item level, implicit-free explicit section. */
export function itemText(s: ItemSpec): string {
  const head = s.rarity === "Normal" ? [s.base] : s.rarity === "Magic" ? [`Hale ${s.base}`] : [s.name ?? "Doom Loop", s.base];
  return [
    `Item Class: ${s.itemClass}`,
    `Rarity: ${s.rarity}`,
    ...head,
    "--------",
    `Item Level: ${s.ilvl}`,
    "--------",
    ...s.lines,
    ...(s.extra ? ["--------", ...s.extra] : []),
  ].join("\n");
}

export const RING = { itemClass: "Rings", base: "Ruby Ring" } as const;

export function ringLines(cat: CraftCatalog, prefixes: string[], suffixes: string[], desecrated: string[] = []): string[] {
  const r = (side: "prefix" | "suffix", f: string) => renderFamily(cat, RING.itemClass, RING.base, side, f);
  const des = desecrated.map((modId) => `${cat.mods[modId]!.text.replace(/\((-?\d+)-(-?\d+)\)/g, "$1")} (desecrated)`);
  return [...prefixes.flatMap((f) => r("prefix", f)), ...suffixes.flatMap((f) => r("suffix", f)), ...des];
}

/** A desecrated ring suffix from the catalog pool (any family), for the one-desecrated-mod tests. */
export function ringDesecratedSuffix(cat: CraftCatalog): string {
  const combo = comboFor(cat, RING.itemClass, RING.base);
  assert.ok(combo);
  const id = Object.values(combo.desecrated).flatMap((t) => Object.keys(t)).find((m) => cat.mods[m]!.side === "suffix" && !cat.mods[m]!.text.includes("\n"));
  assert.ok(id, "rings must have a single-line desecrated suffix");
  return id;
}
