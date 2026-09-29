"use client";

import type { PriceCheckLiveResponse, PriceCheckResponse, ValueOrigin } from "../../../lib/priceCheckContract";
import { ItemArt } from "../../ui/ItemArt";
import { PriceChip } from "../../ui/PriceChip";
import { StaleBadge } from "../../ui/StaleBadge";

const KIND_LABEL: Record<PriceCheckResponse["kind"], string> = {
  currency: "exchange item",
  unique: "unique",
  rare: "rare",
  other: "no market price",
};

const SOURCE_TEXT: Record<ValueOrigin, string> = {
  cx: "Currency Exchange",
  ninja: "poe.ninja",
  scout: "poe2scout",
  book: "price book",
  trade: "trade site",
};

/** Past this age the source's data reads stale: hourly exchange/ninja data, daily poe2scout. */
const STALE_AFTER_MIN: Record<ValueOrigin, number> = { cx: 120, ninja: 120, scout: 36 * 60, book: 0, trade: 0 };

function Chip({ children, title }: { children: string; title?: string }) {
  return (
    <span className="rounded border border-line px-1.5 text-xs text-neutral-400" title={title}>
      {children}
    </span>
  );
}

function Provenance({ r }: { r: PriceCheckResponse }) {
  const { source, samples, ageMin } = r.confidence;
  if (source == null) return <Chip>unpriced</Chip>;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <Chip title="where this value came from">{SOURCE_TEXT[source]}</Chip>
      {ageMin != null && <StaleBadge ageMin={ageMin} warnAfterMin={STALE_AFTER_MIN[source]} />}
      {samples != null && samples > 0 && (
        <Chip title="prices behind this value">{source === "scout" ? `${samples} price-log points` : `${samples} samples`}</Chip>
      )}
    </span>
  );
}

function LiveLine({ v, ex }: { v: PriceCheckLiveResponse; ex: number | null }) {
  return (
    <p className="flex flex-wrap items-center gap-1.5 text-sm" title={`${v.method} · ${v.dropped} bait asks trimmed · ${v.unrated} unrated`}>
      <span className="text-neutral-400">live</span>
      <PriceChip div={v.valueDiv} exPerDiv={ex} source="trade" ageMin={0} />
      <Chip>{`${v.samples} of ${v.total} listed`}</Chip>
      {v.minDiv != null && (
        <span className="inline-flex items-center gap-1 text-xs text-neutral-400">
          cheapest <PriceChip div={v.minDiv} exPerDiv={ex} source="trade" />
        </span>
      )}
    </p>
  );
}

/** What the pasted item is: art, name, value per unit and for the stack, and where the value came from. */
export function ValueCard({ r, live }: { r: PriceCheckResponse; live: PriceCheckLiveResponse | null }) {
  const ex = r.exPerDiv;
  const source = r.confidence.source ?? undefined;
  return (
    <section className="flex gap-3 rounded-lg border border-line bg-neutral-950/60 p-3" aria-label="Item value">
      <ItemArt src={r.icon} size={12} />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <h3 className="truncate text-lg font-semibold text-neutral-100">{r.name || r.baseType}</h3>
          {r.baseType !== r.name && r.baseType !== "" && <span className="text-sm text-neutral-400">{r.baseType}</span>}
          <Chip>{KIND_LABEL[r.kind]}</Chip>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="inline-flex items-center gap-1.5 text-sm">
            <span className="text-neutral-400">{r.qty > 1 ? "each" : "value"}</span>
            <PriceChip div={r.unitDiv} exPerDiv={ex} source={source} ageMin={r.confidence.ageMin ?? undefined} />
          </span>
          {r.qty > 1 && (
            <span className="inline-flex items-center gap-1.5 text-sm">
              <span className="text-neutral-400">{`× ${r.qty.toLocaleString("en-US")} =`}</span>
              <PriceChip div={r.totalDiv} exPerDiv={ex} source={source} />
            </span>
          )}
          <Provenance r={r} />
        </div>
        {live && <LiveLine v={live} ex={ex} />}
        {r.kind === "rare" && r.bookError && (
          <p className="text-sm text-amber-300" title={r.bookError}>
            price book unavailable — trade2 stat catalog unreachable
          </p>
        )}
        {r.warnings.map((w) => (
          <p key={w} className="text-xs text-amber-300">
            {w}
          </p>
        ))}
      </div>
    </section>
  );
}
