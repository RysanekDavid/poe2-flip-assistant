import { CX_CURRENCY_IDS, CX_HOUR_SECONDS, type CxDigest } from "../../../api/cxClient";
import type { CxMarketRow } from "../../../db/cxMarketQueries";
import type { SampledHour, StartDayRow } from "../../../db/cxStartQueries";
import { hourEdges } from "../cxEdges";
import { toMarketRow } from "../cxIngest";
import type { ModelParams } from "../cxMarketModel";
import { median } from "./curves";

/**
 * One league day from a handful of sampled digest hours. Pure.
 *
 * A league's first two weeks are ~336 digests of ~3000 markets each; fetching every one for four
 * past leagues is gigabytes for a curve whose unit is a DAY. Six evenly spaced hours per day give a
 * robust median (one dumped hour cannot move it) at a sixth of the cost.
 */

export const SAMPLE_STEP_HOURS = 4;
export const SAMPLES_PER_DAY = 24 / SAMPLE_STEP_HOURS;

/** Request hours sampled for league day `day`. */
export function sampleHours(startHour: number, day: number): number[] {
  const first = startHour + day * 24 * CX_HOUR_SECONDS;
  return Array.from({ length: SAMPLES_PER_DAY }, (_, i) => first + i * SAMPLE_STEP_HOURS * CX_HOUR_SECONDS);
}

interface ItemObs {
  mids: number[];
  units: number;
}

/** One digest's markets for one league as stored-shape rows. */
function leagueRows(digest: CxDigest, league: string, hour: number): CxMarketRow[] {
  return digest.markets
    .filter((m) => m.league === league)
    .map((m) => toMarketRow(m, hour))
    .filter((r): r is CxMarketRow => r != null);
}

/**
 * Accumulates sampled hours of one day, so each ~MB digest can be dropped as soon as it is read.
 * Items are priced by the same model Top Flips uses (most liquid quote's VWAP in Div).
 */
export class DayFolder {
  private readonly obs = new Map<string, ItemObs>();
  private readonly sampled: SampledHour[] = [];

  constructor(
    private readonly league: string,
    private readonly day: number,
    private readonly params: ModelParams,
  ) {}

  add(hour: number, digest: CxDigest): void {
    const rows = leagueRows(digest, this.league, hour);
    this.sampled.push({ hour, markets: rows.length });
    for (const [item, h] of hourEdges(hour, rows, this.params)) {
      if (item === CX_CURRENCY_IDS.divine || !(h.midDiv > 0) || !Number.isFinite(h.midDiv)) continue;
      const o = this.obs.get(item) ?? { mids: [], units: 0 };
      o.mids.push(h.midDiv);
      o.units += h.marketUnits;
      this.obs.set(item, o);
    }
  }

  /** Base ids seen so far — names are resolved for these before storing. */
  items(): string[] {
    return [...this.obs.keys()];
  }

  result(): { rows: StartDayRow[]; sampled: SampledHour[] } {
    const rows: StartDayRow[] = [];
    for (const [item, o] of this.obs) {
      const mid = median(o.mids);
      if (mid == null || !(mid > 0)) continue;
      rows.push({ day: this.day, item, midDiv: mid, volumeUnits: o.units, hours: o.mids.length });
    }
    return { rows, sampled: [...this.sampled] };
  }
}
