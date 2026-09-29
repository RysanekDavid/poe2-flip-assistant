"use client";

import { CURRENCY_ART } from "../../lib/currencyArt";
import { fmtDivOrEx } from "../../lib/format";
import { fmtAgeMin } from "./StaleBadge";
import { Tooltip } from "./Tooltip";

export type PriceSource = "cx" | "ninja" | "scout" | "trade" | "manual" | "book";

const SOURCE_LABEL: Record<PriceSource, string> = {
  cx: "Currency Exchange",
  ninja: "poe.ninja",
  scout: "poe2scout",
  trade: "trade site",
  manual: "your price",
  book: "price book",
};

interface PriceChipProps {
  /** Value in Divine; null = unpriced (never pass 0 for "unknown"). */
  div: number | null;
  /** Exalted per Divine, for showing sub-Div amounts in ex; null when the rate is unknown. */
  exPerDiv: number | null;
  source?: PriceSource;
  ageMin?: number;
}

function provenance(source: PriceSource | undefined, ageMin: number | undefined): string | null {
  const parts = [source ? SOURCE_LABEL[source] : null, ageMin === undefined ? null : `${fmtAgeMin(ageMin)} old`];
  const text = parts.filter((p): p is string => p !== null).join(" · ");
  return text === "" ? null : text;
}

/**
 * A price the way the exchange shows it: amount plus currency art, Div at ≥1 and ex below. Source
 * and age live in the tooltip rather than as extra chips, so a table of prices stays one line each.
 */
export function PriceChip({ div, exPerDiv, source, ageMin }: PriceChipProps) {
  const tip = provenance(source, ageMin);
  if (div === null || !(div > 0)) {
    const empty = <span className="text-sm text-neutral-500">—</span>;
    return <Tooltip tip={tip ? `unpriced · ${tip}` : "unpriced"}>{empty}</Tooltip>;
  }
  const inEx = div < 1 && exPerDiv !== null && exPerDiv > 0;
  const chip = (
    <span className="inline-flex items-center gap-1 whitespace-nowrap text-sm tabular-nums text-neutral-100">
      <img src={inEx ? CURRENCY_ART.ex : CURRENCY_ART.div} alt="" className="h-4 w-4 shrink-0 object-contain" />
      {fmtDivOrEx(div, exPerDiv ?? 0)}
    </span>
  );
  return tip ? <Tooltip tip={tip}>{chip}</Tooltip> : chip;
}
