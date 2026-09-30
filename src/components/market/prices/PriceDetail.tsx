"use client";

import type { ReactNode } from "react";
import { fmtDivOrEx, fmtDivOrExRange } from "../../../lib/format";
import type { MarketPriceItem } from "../../../lib/marketPricesContract";
import { timestampAgeMs } from "../../../lib/sqliteTime";
import { PriceChart } from "../../PriceChart";
import { fmtAgeMin } from "../../ui/StaleBadge";

function Stat({ label, tip, children }: { label: string; tip: string; children: ReactNode }) {
  return (
    <div className="min-w-0" title={tip}>
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="text-base tabular-nums text-neutral-100">{children}</p>
    </div>
  );
}

const div = (n: number, exPerDiv: number | null): string => fmtDivOrEx(n, exPerDiv ?? 0);

/** The open row: three numbers (exchange band, ninja value, age), then the existing price chart. */
export function PriceDetail({ item, exPerDiv }: { item: MarketPriceItem; exPerDiv: number | null }) {
  const band = item.cxBand;
  return (
    <div className="grid gap-3 py-2">
      <div className="grid gap-2 rounded-md border border-line bg-neutral-900/40 px-3 py-2 sm:grid-cols-3 sm:gap-4">
        <Stat label="Exchange band" tip="Currency Exchange low–high over the last hour it traded; — = the exchange has no fresh market for it">
          {band === null ? <span className="text-neutral-500">—</span> : fmtDivOrExRange(band.low, band.high, exPerDiv ?? 0)}
        </Stat>
        <Stat label="poe.ninja value" tip="poe.ninja exchange value of one item">
          {item.valueDiv === null ? <span className="text-neutral-500">unpriced</span> : div(item.valueDiv, exPerDiv)}
        </Stat>
        <Stat label="Updated" tip="When this value was last written by the market poll">
          {fmtAgeMin(timestampAgeMs(item.valueAt) / 60_000)} ago
        </Stat>
      </div>
      <PriceChart itemId={item.itemId} itemName={item.name} exPerDiv={exPerDiv} />
    </div>
  );
}
