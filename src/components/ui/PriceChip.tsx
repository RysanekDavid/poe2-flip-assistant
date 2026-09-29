import { CURRENCY_ART } from "../../lib/currencyArt";
import { fmtDivOrEx } from "../../lib/format";
import { fmtAgeMin } from "./StaleBadge";

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
 * A price the way the exchange shows it: amount plus currency art, Div at ≥1 and ex below.
 * Provenance rides on the native title plus screen-reader text, not a focusable Tooltip: a table
 * of prices must not gain a tab stop per cell.
 */
export function PriceChip({ div, exPerDiv, source, ageMin }: PriceChipProps) {
  const tip = provenance(source, ageMin);
  if (div === null || !(div > 0)) {
    const label = tip ? `unpriced · ${tip}` : "unpriced";
    return (
      <span className="text-sm text-neutral-500" title={label}>
        <span aria-hidden>—</span>
        <span className="sr-only">{label}</span>
      </span>
    );
  }
  const inEx = div < 1 && exPerDiv !== null && exPerDiv > 0;
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap text-sm tabular-nums text-neutral-100" title={tip ?? undefined}>
      <img src={inEx ? CURRENCY_ART.ex : CURRENCY_ART.div} alt="" className="h-4 w-4 shrink-0 object-contain" />
      {fmtDivOrEx(div, exPerDiv ?? 0)}
      {tip && <span className="sr-only"> ({tip})</span>}
    </span>
  );
}
