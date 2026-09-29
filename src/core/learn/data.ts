/*
 * The Learn tab's curated JSON, parsed at module load: a malformed or dangling file must break every
 * caller loudly (and `npm run test:learn`), never render an empty primer.
 */
import primerRaw from "../../data/poe2/learn/currency-primer.json";
import atlasRaw from "../../data/poe2/learn/atlas-checklist.json";
import type { PrimerCard } from "../../lib/learnContract";
import { entityById } from "../entities/load";
import { toEntityLookup, type LookupPrices } from "./lookup";
import { atlasChecklistSchema, currencyPrimerSchema, type AtlasChecklist, type CurrencyPrimer } from "./schema";

export const CURRENCY_PRIMER: CurrencyPrimer = currencyPrimerSchema.parse(primerRaw);
export const ATLAS_CHECKLIST: AtlasChecklist = atlasChecklistSchema.parse(atlasRaw);

const STEP_IDS: ReadonlySet<string> = new Set(ATLAS_CHECKLIST.steps.map((s) => s.id));

export const isAtlasStepId = (id: string): boolean => STEP_IDS.has(id);

/** Primer entries joined to the catalog (summary, art) and priced; a dangling entity id throws. */
export function primerCards(prices: LookupPrices): PrimerCard[] {
  return CURRENCY_PRIMER.entries.map((entry) => {
    const row = entityById(entry.entity_id);
    if (!row) throw new Error(`currency primer: entity "${entry.entity_id}" is not in the entity catalog`);
    return { entity: toEntityLookup(row, prices), who_uses: entry.who_uses, pickup: entry.pickup, claim: entry.claim };
  });
}
