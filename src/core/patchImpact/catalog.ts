import type Database from "better-sqlite3";
import { cxItemNames, ninjaCatalog, scoutUniqueKeys, type NinjaCatalogRow, type PatchImpactSourceRow } from "../../db/priceAtQueries";
import { patchSummarySchema } from "../../sources/patchNotes/summaryContract";
import type { CatalogEntry, PatchText } from "./match";

/** Name catalogs and patch texts the matcher runs over. */

const SMALL_WORDS = new Set(["of", "the", "and", "a", "an", "in", "on", "to", "for"]);

/** item_values keeps scout uniques only as lowercased keys; restore a readable name for display. */
export function titleCaseKey(key: string): string {
  return key
    .split(" ")
    .map((word, i) => (i > 0 && SMALL_WORDS.has(word) ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(" ");
}

export interface NameCatalog {
  entries: CatalogEntry[];
  ninja: NinjaCatalogRow[];
}

export function buildNameCatalog(league: string, bases: readonly string[], db: Database.Database): NameCatalog {
  const ninja = ninjaCatalog(league, db);
  const entries: CatalogEntry[] = [
    ...ninja.map((r): CatalogEntry => ({ name: r.itemName, kind: "ninja", itemId: r.itemId, category: r.category, icon: r.icon })),
    ...cxItemNames(db).map((name): CatalogEntry => ({ name, kind: "exchange", itemId: null, category: null, icon: null })),
    ...scoutUniqueKeys(league, db).map((key): CatalogEntry => ({ name: titleCaseKey(key), kind: "unique", itemId: null, category: null, icon: null })),
    ...bases.map((name): CatalogEntry => ({ name, kind: "base", itemId: null, category: null, icon: null })),
  ];
  return { entries, ninja };
}

/** The AI summary's prose, or null when there is none or it no longer parses (logged). */
function summaryText(row: PatchImpactSourceRow): string | null {
  if (row.summaryJson === null) return null;
  const parsed = patchSummarySchema.safeParse(JSON.parse(row.summaryJson));
  if (!parsed.success) {
    console.error(`[patch-impact] thread ${row.threadId}: stored summary no longer matches the summary schema — matching without it`);
    return null;
  }
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
