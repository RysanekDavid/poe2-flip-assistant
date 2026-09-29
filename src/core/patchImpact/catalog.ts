import type Database from "better-sqlite3";
import { cxItemNames, ninjaCatalog, scoutUniqueKeys, SENTINEL_ITEM_ID, type NinjaCatalogRow, type PatchImpactSourceRow } from "../../db/priceAtQueries";
import { patchSummarySchema } from "../../sources/patchNotes/summaryContract";
import { SMALL_WORDS, type CatalogEntry, type PatchText } from "./match";

/** Name catalogs and patch texts the matcher runs over. */

/** item_values keeps scout uniques only as lowercased keys; restore a readable name for display. */
export function titleCaseKey(key: string): string {
  return key
    .split(" ")
    .map((word, i) => (i > 0 && SMALL_WORDS.has(word) ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(" ");
}

export interface NameCatalog {
  entries: CatalogEntry[];
  /** Items whose moves can be measured (category members); excludes the Divine base unit. */
  ninja: NinjaCatalogRow[];
}

/**
 * Prices are in Divine, so the Divine line is 1 by definition and its "move" is always 0 %: a named
 * Divine Orb is listed as likely affected, and it never dilutes a Currency median.
 */
function ninjaEntry(r: NinjaCatalogRow): CatalogEntry {
  if (r.itemId === SENTINEL_ITEM_ID) return { name: r.itemName, kind: "exchange", itemId: null, category: null, icon: r.icon };
  return { name: r.itemName, kind: "ninja", itemId: r.itemId, category: r.category, icon: r.icon };
}

export function buildNameCatalog(league: string, bases: readonly string[], nowMs: number, db: Database.Database): NameCatalog {
  const all = ninjaCatalog(league, nowMs, db);
  const entries: CatalogEntry[] = [
    ...all.map(ninjaEntry),
    ...cxItemNames(db).map((name): CatalogEntry => ({ name, kind: "exchange", itemId: null, category: null, icon: null })),
    ...scoutUniqueKeys(league, db).map((key): CatalogEntry => ({ name: titleCaseKey(key), kind: "unique", itemId: null, category: null, icon: null })),
    ...bases.map((name): CatalogEntry => ({ name, kind: "base", itemId: null, category: null, icon: null })),
  ];
  return { entries, ninja: all.filter((r) => r.itemId !== SENTINEL_ITEM_ID) };
}

/** The AI summary's prose, or null when none is done. A stored summary that stopped parsing is a defect. */
function summaryText(row: PatchImpactSourceRow): string | null {
  if (row.summaryJson === null) return null;
  const parsed = patchSummarySchema.safeParse(JSON.parse(row.summaryJson));
  if (!parsed.success) throw new Error(`patch_summary ${row.threadId}: stored summary no longer matches the summary schema`);
  const s = parsed.data;
  return [s.tldr, ...s.groups.flatMap((g) => g.bullets), s.trading_impact].join("\n");
}

/** title | body (headings + change list, else the flat body text) | summary. */
export function patchTexts(row: PatchImpactSourceRow): PatchText[] {
  const bodyParts = row.listItems.length > 0 ? [...row.headings, ...row.listItems] : [...row.headings, row.bodyText ?? ""];
  const texts: PatchText[] = [
    { source: "title", text: row.title },
    { source: "body", text: bodyParts.join("\n") },
  ];
  const summary = summaryText(row);
  if (summary !== null) texts.push({ source: "summary", text: summary });
  return texts;
}
