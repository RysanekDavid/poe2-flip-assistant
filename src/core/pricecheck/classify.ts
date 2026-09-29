import type { ParsedItem } from "../itemParser";
import type { ItemMeta } from "../tools/craftmoves/itemMeta";

/**
 * Which price path a pasted item takes. Pure: the exchange lookup is handed in, so the tests drive
 * it without a DB.
 *  - currency: stackables — on the exchange when poe.ninja lists the name (whatever its rarity), else
 *              a Currency-rarity stack that only trades on the trade site (e.g. Artificer's Shard)
 *  - unique:   an identified unique, priced by name
 *  - rare:     an identified rare, priced by its rolled mods
 *  - other:    no market value we can stand behind (normal/magic gear, unidentified items, gems…)
 */

export type PasteClass =
  | { kind: "currency"; name: string; qty: number; onExchange: boolean }
  | { kind: "unique"; name: string; baseType: string; corrupted: boolean }
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
  if (isExchangeItem(name)) return { kind: "currency", name, qty: readStackSize(text), onExchange: true };
  if (rarity === "currency") return { kind: "currency", name, qty: readStackSize(text), onExchange: false };
  if (meta.unidentified) {
    return { kind: "other", name, baseType, reason: "unidentified — identify it first; its value depends on what it rolled" };
  }
  if (rarity === "unique") return { kind: "unique", name, baseType, corrupted: parsed.corrupted };
  if (rarity === "rare") return { kind: "rare", name, baseType };
  return {
    kind: "other",
    name,
    baseType,
    reason: `${parsed.rarity.toLowerCase()} items have no market price here — craft on it or vendor it`,
  };
}
