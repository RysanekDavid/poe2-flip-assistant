/*
 * The item a move card hopes to produce, as Ctrl+C text: the pasted item plus the aimed-at mod.
 * The catalog words a tier as "+(41-45)% to Fire Resistance"; a comparable search wants a rolled
 * line, so every range becomes its LOW end — the outcome is valued as the worst roll of that tier,
 * never flattered by a perfect one.
 */

const RANGE = /\((-?\d+(?:\.\d+)?)\s*[-–]\s*(-?\d+(?:\.\d+)?)\)/g;

/** "+(41-45)% to Fire Resistance" → "+41% to Fire Resistance"; hybrid tiers keep one line each. */
export function rolledLines(tierText: string): string[] {
  return tierText
    .split("\n")
    .map((l) => l.replace(RANGE, "$1").trim())
    .filter((l) => l !== "");
}

/**
 * Append the rolled target lines as the item's last mod lines. The parser reads every non-header
 * line after the first section as a mod, so the end of the text is always inside the mod block —
 * unless the paste ends with a status line (Corrupted/Mirrored), which then locks the item anyway.
 */
export function outcomeText(itemText: string, targetLine: string): string {
  const lines = rolledLines(targetLine);
  if (lines.length === 0) throw new Error("target mod line is empty");
  return `${itemText.replace(/\s+$/, "")}\n${lines.join("\n")}`;
}
