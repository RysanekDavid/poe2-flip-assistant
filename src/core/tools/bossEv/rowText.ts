import type { BossRow, EntryChip } from "../../../lib/farmContract";
import type { LootLineView } from "../../../lib/tools/bossEvContract";
import { fmtDiv, fmtRate } from "./headline";

/*
 * The farm board's cell wording, pure and client-safe so the rules are unit-tested rather than
 * living inside React components. Every "left out" count is spelled out: an EV that skips drops
 * without a rate or a price is a lower bound, and the player must see why.
 */

export interface CellText {
  text: string;
  title: string;
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** What EV leaves out, e.g. "6 drops have unknown rates, 2 unpriced (1 lineage)"; null when nothing. */
export function leftOutText(row: Pick<BossRow, "unknownRate" | "unpriced" | "unpricedLineage">): string | null {
  const parts: string[] = [];
  if (row.unknownRate > 0) parts.push(`${plural(row.unknownRate, "drop has an unknown rate", "drops have unknown rates")}`);
  if (row.unpriced.length > 0) {
    parts.push(`${row.unpriced.length} unpriced${row.unpricedLineage > 0 ? ` (${row.unpricedLineage} lineage)` : ""}`);
  }
  return parts.length > 0 ? parts.join(", ") : null;
}

type EvRow = Pick<BossRow, "unknownRate" | "unpriced" | "unpricedLineage" | "confidence" | "unmodelledEntry">;

/**
 * The EV/net tooltip's data line: how complete the number is and how well its rates are sourced.
 * "Listed" is deliberate: the curated drop list is only as complete as its sources.
 */
export function evConfidenceText(row: EvRow): string {
  const parts: string[] = [];
  if (row.unmodelledEntry) parts.push(`upper bound — the entry leaves out ${row.unmodelledEntry.label}`);
  const leftOut = leftOutText(row);
  if (leftOut) parts.push(row.unmodelledEntry ? `EV skips: ${leftOut}` : `lower bound — ${leftOut}`);
  if (parts.length === 0) parts.push("every listed drop priced and rated");
  return `${parts.join("; ")} · weakest deciding rate: ${row.confidence}`;
}

/** Floor tooltip: the drops it sums, each with its rate and per-kill share. */
export function floorTitle(drops: BossRow["floorDrops"], exPerDiv: number): string {
  const lines = drops.map((d) => `${d.name} — ${fmtDiv(d.evDiv, exPerDiv)} per kill (${fmtRate(d.rate)})`);
  return ["priced loot on most kills (guaranteed, or 1 in 10 or better):", ...lines].join("\n");
}

/** P(lose) caveats: covering drops without a rate, and data weaker than confirmed behind the number. */
export function loseCaveats(row: Pick<BossRow, "losingRunUnknownRates" | "losingRunConfidence" | "unmodelledEntry">): string[] {
  const out: string[] = [];
  if (row.losingRunUnknownRates > 0) out.push(`${row.losingRunUnknownRates} covering drop(s) have no known rate and count as never dropping`);
  if (row.losingRunConfidence != null && row.losingRunConfidence !== "confirmed") out.push(`rests on ${row.losingRunConfidence} data`);
  if (row.unmodelledEntry) out.push(`the entry leaves out ${row.unmodelledEntry.label}`);
  return out;
}

/**
 * The floor when no priced drop lands on most kills. A kill still drops loot — it is just not
 * counted — so the cell says "≥ 0", never an empty dash that reads as "no data".
 */
export function floorFallback(row: Pick<BossRow, "floorDiv" | "unknownRate" | "unpriced" | "unpricedLineage">): CellText | null {
  if (row.floorDiv > 0) return null;
  const leftOut = leftOutText(row);
  return {
    text: "≥ 0 · no guaranteed priced drop",
    title: `no guaranteed or 1-in-10-or-better drop has a market price${leftOut ? ` — ${leftOut}` : ""}`,
  };
}

/** "1× Breachlord Sac" — the quantity always shown, so a 5-item entry is never read as one. */
export function entryLabel(chip: Pick<EntryChip, "qty" | "name">): string {
  return `${chip.qty.toLocaleString("en-US")}× ${chip.name}`;
}

/** "Fragment" → "Fragments", "Fate" → "Fates", "Sac" → "Sacs"; the entry names are all simple nouns. */
function pluralWord(word: string): string {
  if (/(s|x|ch|sh)$/.test(word)) return `${word}es`;
  if (/[^aeiou]y$/.test(word)) return `${word.slice(0, -1)}ies`;
  return `${word}s`;
}

/** Trailing words every name shares ("Crisis Fragment" of Weathered/Faded/Ancient Crisis Fragment). */
function sharedTail(names: readonly string[]): string[] {
  const split = names.map((n) => n.trim().split(/\s+/));
  const shortest = Math.min(...split.map((w) => w.length));
  const tail: string[] = [];
  for (let i = 1; i <= shortest; i += 1) {
    const word = split[0]?.[split[0].length - i];
    if (word === undefined || !split.every((w) => w[w.length - i] === word)) break;
    tail.unshift(word);
  }
  return tail;
}

/**
 * The entry cell's one-line summary: "An Audience with the King" for one item (the quantity only
 * when it is more than one), "3 Crisis Fragments" when every item shares a family name, else
 * "2 items". Counts are units consumed, so 5× of one thing never reads as one.
 */
export function entrySummaryLabel(chips: readonly Pick<EntryChip, "qty" | "name">[]): string {
  const first = chips[0];
  if (!first) throw new Error("entrySummaryLabel: an entry has at least one item");
  if (chips.length === 1) return first.qty > 1 ? entryLabel(first) : first.name;
  const units = chips.reduce((sum, c) => sum + c.qty, 0);
  const tail = sharedTail(chips.map((c) => c.name));
  const last = tail.at(-1);
  if (last === undefined) return `${units.toLocaleString("en-US")} items`;
  return `${units.toLocaleString("en-US")} ${[...tail.slice(0, -1), pluralWord(last)].join(" ")}`;
}

/**
 * Short form of an unmodelled entry cost for the table ("N× Waystone + Stronghold clear" →
 * "Waystones"); the full label and its note stay in the tooltip.
 */
export function unmodelledShort(label: string): string {
  const head = (label.split(" + ")[0] ?? label).replace(/^\S+×\s*/, "").trim();
  if (head === "") throw new Error(`unmodelledShort: nothing to show for "${label}"`);
  const words = head.split(/\s+/);
  const last = words.at(-1) ?? head;
  return /×/.test(label) ? [...words.slice(0, -1), pluralWord(last)].join(" ") : head;
}

/** Full cost breakdown for the entry tooltip, one item per line, then the total. */
export function entryBreakdown(chips: readonly EntryChip[], entryDiv: number, complete: boolean, exPerDiv: number): string {
  const lines = chips.map((c) => {
    const cost = c.costDiv == null ? "unpriced" : `${fmtDiv(c.costDiv, exPerDiv)}${c.route === "craft" ? " (craft)" : ""}`;
    return `${entryLabel(c)} — ${cost}`;
  });
  lines.push(complete ? `total ${fmtDiv(entryDiv, exPerDiv)}` : `total ≥ ${fmtDiv(entryDiv, exPerDiv)} (part of the entry is unpriced)`);
  return lines.join("\n");
}

/**
 * Detail-table order: rated and priced drops by EV (price × rate) first, then unknown-rate drops
 * by price, unpriced drops last. A drop without a rate must not outrank one with a real EV.
 */
export function sortLoot(loot: readonly LootLineView[]): LootLineView[] {
  const group = (l: LootLineView): number => (l.evDiv != null ? 0 : l.price != null ? 1 : 2);
  return [...loot].sort(
    (a, b) => group(a) - group(b) || (b.evDiv ?? 0) - (a.evDiv ?? 0) || (b.price?.div ?? 0) - (a.price?.div ?? 0) || a.name.localeCompare(b.name),
  );
}
