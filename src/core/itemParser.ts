/**
 * Parse the in-game Ctrl+C item text (PoE2 clipboard format) into structured fields +
 * candidate mod lines. We do NOT try to classify every line as a mod here — that's the
 * stat resolver's job (a line is a mod iff it resolves to a trade stat). This keeps the
 * parser dumb and robust to format drift: it just splits sections, reads the header, and
 * hands every plausible affix line downstream.
 */
export type ModMarker = "implicit" | "rune" | "enchant" | "crafted" | "fractured" | "explicit";

export interface ParsedModLine {
  raw: string; // original line, marker stripped: "+45 to maximum Life"
  placeholdered: string; // numbers → '#': "+# to maximum Life"
  numbers: number[]; // [45]  (or [5,10] for "Adds 5 to 10 …")
  marker: ModMarker; // which mod bucket the game tagged it as
}

export interface ParsedItem {
  rarity: string; // "Normal" | "Magic" | "Rare" | "Unique" | …
  name: string; // rare/unique proper name (first name line)
  baseType: string; // base type, e.g. "Vaal Gauntlets"
  itemLevel: number | null;
  corrupted: boolean;
  mirrored: boolean;
  mods: ParsedModLine[];
}

const SECTION_SEP = /^-{3,}$/; // the "--------" divider
const MARKERS: Record<string, ModMarker> = {
  implicit: "implicit",
  rune: "rune",
  enchant: "enchant",
  crafted: "crafted",
  fractured: "fractured",
};

/** Pull the trailing "(implicit)" / "(rune)" / … tag off a mod line, defaulting to explicit. */
function stripMarker(line: string): { text: string; marker: ModMarker } {
  const m = line.match(/\s*\((implicit|rune|enchant|crafted|fractured|desecrated)\)\s*$/i);
  if (!m) return { text: line.trim(), marker: "explicit" };
  const marker = MARKERS[m[1]!.toLowerCase()] ?? "explicit";
  return { text: line.slice(0, m.index).trim(), marker };
}

/** Numbers in a mod line, e.g. "Adds 5 to 10 Fire Damage" → [5,10], "+30%…" → [30]. */
export function extractNumbers(line: string): number[] {
  return (line.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
}

/** Replace each number with '#' to get the trade stat template key. */
export function placeholder(line: string): string {
  return line.replace(/-?\d+(?:\.\d+)?/g, "#").replace(/\s+/g, " ").trim();
}

// Lines that are properties/requirements, never mods. Resolver would reject them anyway,
// but skipping cheap obvious ones keeps noise (and false placeholder matches) down.
const NON_MOD = /^(Item Class|Rarity|Quality|Armour|Evasion Rating|Energy Shield|Requires|Level|Str|Dex|Int|Sockets|Item Level|Stack Size|Radius|Limited to|Requirements|Physical Damage|Elemental Damage|Critical|Attacks per Second|Reload Time):/i;

/** Parse pasted PoE2 item text. Returns null if it doesn't look like an item at all. */
export function parseItem(text: string): ParsedItem | null {
  const lines = text.replace(/\r/g, "").split("\n");
  const sections: string[][] = [[]];
  for (const ln of lines) {
    if (SECTION_SEP.test(ln.trim())) sections.push([]);
    else if (ln.trim()) sections[sections.length - 1]!.push(ln.trim());
  }

  const head = sections[0] ?? [];
  const rarityLine = head.find((l) => /^Rarity:/i.test(l));
  if (!rarityLine) return null;
  const rarity = rarityLine.replace(/^Rarity:\s*/i, "").trim();

  // header name lines: everything after the Rarity line that isn't a property line.
  const nameLines = head.slice(head.indexOf(rarityLine) + 1).filter((l) => !NON_MOD.test(l) && !/^Item Class/i.test(l));
  const name = nameLines[0] ?? "";
  const baseType = nameLines[1] ?? nameLines[0] ?? "";

  const flat = sections.flat();
  const ilvlLine = flat.find((l) => /^Item Level:\s*\d+/i.test(l));
  const itemLevel = ilvlLine ? Number(ilvlLine.match(/\d+/)?.[0]) : null;
  const corrupted = flat.some((l) => /^Corrupted$/i.test(l));
  const mirrored = flat.some((l) => /^Mirrored$/i.test(l));

  // candidate mod lines = every non-header line in sections AFTER the first (header) one.
  const mods: ParsedModLine[] = [];
  for (const sec of sections.slice(1)) {
    for (const ln of sec) {
      if (NON_MOD.test(ln) || /^(Corrupted|Mirrored|Note:)/i.test(ln)) continue;
      const { text: stripped, marker } = stripMarker(ln);
      const numbers = extractNumbers(stripped);
      mods.push({ raw: stripped, placeholdered: placeholder(stripped), numbers, marker });
    }
  }

  return { rarity, name, baseType, itemLevel, corrupted, mirrored, mods };
}
