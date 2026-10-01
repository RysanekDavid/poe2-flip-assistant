"use client";

import { ArrowRight } from "lucide-react";
import waystoneArt from "../../../assets/items/waystone.png";
import type { ConversionEvView, ConversionView, PricedRef, TradeLegView } from "../../../lib/strategiesContract";
import { fmtDivOrEx } from "../../../lib/format";
import { ClaimBadge } from "../../ui/ClaimBadge";
import { ItemArt } from "../../ui/ItemArt";
import { PriceChip } from "../../ui/PriceChip";
import { Tooltip } from "../../ui/Tooltip";
import { conversionLabel, evText, evTone, type EvTone, type ProfitHeadline } from "./kindHelpers";
import { evidenceTip, showsBadge } from "./strategiesView";
import { isTabletBase } from "./tabletArt";
import { tabletArtSrc } from "./tabletArtImages";

/** Art for a rolled base: its tablet art, the waystone for a waystone tier, else none. */
export function rollBaseArt(base: string): string | null {
  if (isTabletBase(base)) return tabletArtSrc({ type: base, unique: null });
  return base.startsWith("Waystone") ? waystoneArt.src : null;
}

/** A catalog item as a chip: art, name and today's exchange price; off the exchange it shows no price, never 0. */
export function RefChip({ item, exPerDiv, qty }: { item: PricedRef; exPerDiv: number | null; qty?: number }) {
  const title = item.price ? `${item.name} · poe.ninja exchange price` : `${item.name} · no exchange price`;
  return (
    <span title={title} className="inline-flex h-7 min-w-0 items-center gap-1.5 rounded-md border border-line bg-neutral-900/80 pl-1 pr-2 text-xs text-neutral-200">
      <ItemArt src={item.icon_url} size={5} />
      {qty !== undefined && qty > 1 && <span className="tabular-nums text-neutral-400">{qty}×</span>}
      <span className="truncate">{item.name}</span>
      {item.price && <span className="shrink-0 font-semibold tabular-nums text-neutral-100">{fmtDivOrEx(item.price.div, exPerDiv ?? 0)}</span>}
    </span>
  );
}

const EV_CLASS: Record<EvTone, string> = {
  up: "border-good/40 bg-good/10 text-good",
  // a losing step stays visible but muted: red would read as an alarm, it is just not worth doing today
  down: "border-line bg-neutral-900/80 text-neutral-400",
  flat: "border-line bg-neutral-900/80 text-neutral-300",
  unpriced: "border-line bg-neutral-900/80 text-neutral-400",
};

/** The live EV of one conversion as a pill; unpriced reads "—" and names the missing legs on hover. */
export function EvPill({ ev, exPerDiv, prefix }: { ev: ConversionEvView; exPerDiv: number | null; prefix?: string }) {
  const { text, tip } = evText(ev, exPerDiv);
  return (
    <Tooltip tip={tip} align="end">
      <span tabIndex={0} className={`inline-flex h-7 cursor-help items-center gap-1 whitespace-nowrap rounded-full border px-2.5 text-sm font-semibold tabular-nums ${EV_CLASS[evTone(ev)]}`}>
        {prefix && <span className="text-xs font-normal">{prefix}</span>}
        {text}
        {ev.status === "unpriced" && <span className="sr-only"> ({tip})</span>}
      </span>
    </Tooltip>
  );
}

const PROFIT_CLASS: Record<ProfitHeadline["tone"], string> = {
  profit: "border-good/40 bg-good/10 text-sm font-semibold text-good",
  loss: "border-line bg-neutral-900/80 text-xs text-neutral-400",
  unpriced: "border-line bg-neutral-900/80 text-sm text-neutral-400",
};

/** A card's profit headline from live prices only: green when it pays, muted when it does not, "—" when unpriced. */
export function ProfitPill({ headline }: { headline: ProfitHeadline }) {
  return (
    <Tooltip tip={headline.tip} align="end">
      <span tabIndex={0} className={`inline-flex min-h-7 cursor-help items-center rounded-full border px-2.5 py-0.5 text-right leading-tight tabular-nums ${PROFIT_CLASS[headline.tone]}`}>
        {headline.text}
        <span className="sr-only"> ({headline.tip})</span>
      </span>
    </Tooltip>
  );
}

/** One conversion: input art ×qty → output art, its label and its live EV. */
export function ConversionRow({ conversion, exPerDiv }: { conversion: ConversionView; exPerDiv: number | null }) {
  const label = conversionLabel(conversion);
  return (
    <li className="flex items-center gap-2 py-1">
      <span className="flex shrink-0 items-center gap-0.5" aria-hidden>
        {conversion.inputs.map((leg) => (
          <ItemArt key={leg.ref.id} src={leg.ref.icon_url} size={5} />
        ))}
        <ArrowRight className="h-3.5 w-3.5 text-neutral-500" />
        {conversion.outputs.map((leg) => (
          <ItemArt key={leg.ref.id} src={leg.ref.icon_url} size={5} />
        ))}
      </span>
      <span className="min-w-0 flex-1 break-words text-sm text-neutral-300" title={label}>
        {label}
      </span>
      <EvPill ev={conversion.ev} exPerDiv={exPerDiv} />
    </li>
  );
}

export function ConversionList({ conversions, exPerDiv }: { conversions: readonly ConversionView[]; exPerDiv: number | null }) {
  return (
    <ul aria-label="Conversions and their live EV" className="divide-y divide-line/60">
      {conversions.map((c) => (
        <ConversionRow key={conversionLabel(c)} conversion={c} exPerDiv={exPerDiv} />
      ))}
    </ul>
  );
}

/** A trade leg: art and price when it is a catalog item, else just its words; the grade shows off-primary. */
export function LegRow({ leg, exPerDiv }: { leg: TradeLegView; exPerDiv: number | null }) {
  return (
    <li className="flex flex-wrap items-center gap-2 py-1">
      {leg.ref && <ItemArt src={leg.ref.icon_url} size={6} />}
      <span className="min-w-0 flex-1 text-sm text-neutral-200" title={evidenceTip(leg.claim)}>
        {leg.text}
      </span>
      {showsBadge(leg.claim) && <ClaimBadge claim={leg.claim} />}
      {leg.ref && <PriceChip div={leg.ref.price?.div ?? null} exPerDiv={exPerDiv} source={leg.ref.price ? "ninja" : undefined} ageMin={leg.ref.price?.ageMin} />}
    </li>
  );
}

export function LegList({ legs, exPerDiv, label }: { legs: readonly TradeLegView[]; exPerDiv: number | null; label: string }) {
  return (
    <ul aria-label={label} className="divide-y divide-line/60">
      {legs.map((leg) => (
        <LegRow key={leg.text} leg={leg} exPerDiv={exPerDiv} />
      ))}
    </ul>
  );
}
