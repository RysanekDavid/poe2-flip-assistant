import { recordObservation, observedPrices } from "../db/marketQueries";
import { referenceValue, signatureModCount, type ReferenceValue } from "./priceBook";

/**
 * The only write path into the price book. It REFUSES zero-mod signatures: a bare "<base>|" key
 * pools every listing of a base into one bucket (the "1111 samples" behind the Apocalypse Grasp
 * bait alert). Refusals are counted, never silent, so a scan report shows mod capture breaking.
 */
export interface BookCounters {
  recorded: number;
  refusedZeroMod: number;
}

export const newBookCounters = (): BookCounters => ({ recorded: 0, refusedZeroMod: 0 });

export interface BookObservation {
  sig: string;
  baseType: string;
  div: number;
  listingId: string | null;
}

export function feedPriceBook(league: string, o: BookObservation, counters: BookCounters): void {
  if (signatureModCount(o.sig) === 0) {
    counters.refusedZeroMod++;
    return;
  }
  recordObservation(league, o.sig, o.baseType, o.div, o.listingId);
  counters.recorded++;
}

/** Trimmed-median book reference for a signature, with the judged listing excluded. */
export function bookReference(league: string, sig: string, excludeListingId: string | null): ReferenceValue {
  return referenceValue(observedPrices(league, sig, excludeListingId));
}

/** One-line human summary for scan reports / runtime errors; null when nothing is wrong. */
export function describeRefusals(c: BookCounters): string | null {
  if (c.refusedZeroMod === 0) return null;
  return `price book refused ${c.refusedZeroMod} zero-mod observation(s) (recorded ${c.recorded}) — mod capture/resolution is failing`;
}
