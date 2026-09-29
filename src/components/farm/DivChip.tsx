"use client";

import { PriceChip, type PriceSource } from "../ui/PriceChip";

interface Props {
  div: number | null;
  exPerDiv: number | null;
  source?: PriceSource;
  ageMin?: number;
}

/**
 * PriceChip, except when no Divine→Exalted rate is known yet: PriceChip then rounds a sub-0.1 Div
 * price to "0 div", which reads as a free item. Without the rate the amount keeps two significant
 * digits in Div instead ("0.0061 div").
 */
export function DivChip({ div, exPerDiv, source, ageMin }: Props) {
  if (div == null || !(div > 0) || div >= 0.1 || (exPerDiv != null && exPerDiv > 0)) {
    return <PriceChip div={div} exPerDiv={exPerDiv} source={source} ageMin={ageMin} />;
  }
  return (
    <span className="whitespace-nowrap text-sm tabular-nums text-neutral-100" title="no exchange rate yet — shown in Divine">
      {div.toPrecision(2)} div
    </span>
  );
}
