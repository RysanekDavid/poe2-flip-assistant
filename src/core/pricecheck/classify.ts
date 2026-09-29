import type { ParsedItem } from "../itemParser";
import type { ItemMeta } from "../tools/craftmoves/itemMeta";

/**
 * Which price path a pasted item takes. Pure: the exchange lookup is handed in, so the tests drive
 * it without a DB.
 *  - currency: anything the exchange prices (Rarity: Currency, or a name poe.ninja lists) — stacks
 *  - unique:   an identified unique, priced by name
 *  - rare:     an identified rare, priced by its rolled mods
 *  - other:    no market value we can stand behind (normal/magic gear, unidentified items, gems…)
 */

export type PasteClass =
  | { kind: "currency"; name: string; qty: number }
  | { kind: "unique"; name: string; baseType: string }
  | { kind: "rare"; name: string; baseType: string }
  | { kind: "other"; name: string; baseType: string; reason: string };

/** "Stack Size: 1,234/5,000" → 1234; a missing or unreadable line is one unit. */
export function readStackSize(text: string): number {
  const m = /^Stack Size:\s*([\d,.\s]+?)\s*(?:\/|$)/im.exec(text);
  if (!m) return 1;
  const n = Number(m[1]!.replace(/[,.\s]/g, ""));
  return Number.isInteger(n) && n > 0 ? n : 1;
}

export function classifyPaste(
  parsed: ParsedItem,
  meta: ItemMeta,
  text: string,
  isExchangeItem: (name: string) => boolean,
): PasteClass {
  const rarity = parsed.rarity.toLowerCase();
  const name = parsed.name.trim();
  const baseType = parsed.baseType.trim();
  if (rarity === "currency" || (rarity !== "unique" && rarity !== "rare" && isExchangeItem(name))) {
    return { kind: "currency", name, qty: readStackSize(text) };
  }
  if (meta.unidentified) {
    return { kind: "other", name, baseType, reason: "unidentified — identify it first; its value depends on what it rolled" };
  }
  if (rarity === "unique") return { kind: "unique", name, baseType };
  if (rarity === "rare") return { kind: "rare", name, baseType };
  return {
    kind: "other",
    name,
    baseType,
    reason: `${parsed.rarity.toLowerCase()} items have no market price here — craft on it or vendor it`,
  };
}
