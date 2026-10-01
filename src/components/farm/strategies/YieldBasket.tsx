"use client";

import type { YieldView } from "../../../lib/strategiesContract";
import { ClaimBadge } from "../../ui/ClaimBadge";
import { ItemArt } from "../../ui/ItemArt";
import { PriceChip } from "../../ui/PriceChip";
import { InfoTip } from "../../ui/Tooltip";
import { evidenceTip, showsBadge } from "./strategiesView";
import { changeTone, fmtChange, TONE_TEXT } from "./strategyCards";

// "main"/"side" rather than the data's primary/secondary: "primary" is already an evidence-grade label.
const ROLE: Record<YieldView["role"], { label: string; className: string }> = {
  primary: { label: "main drop", className: "border-neutral-500 text-neutral-200" },
  secondary: { label: "side drop", className: "border-line text-neutral-400" },
  lottery: { label: "lottery", className: "border-line text-neutral-400" },
};

function YieldRow({ item, exPerDiv }: { item: YieldView; exPerDiv: number | null }) {
  return (
    <li className="flex flex-wrap items-center gap-2 py-1">
      <ItemArt src={item.icon_url} size={6} />
      <span className="text-sm text-neutral-100">{item.ref.name}</span>
      <span className={`rounded border px-1.5 text-xs ${ROLE[item.role].className}`} title="what this item is to the strategy">
        {ROLE[item.role].label}
      </span>
      <InfoTip tip={`${item.why} ${evidenceTip(item.claim)}`.trim()} label={`Why ${item.ref.name}`} />
      {showsBadge(item.claim) && <ClaimBadge claim={item.claim} />}
      <span className="ml-auto inline-flex items-center gap-2">
        {item.price?.change7d != null && (
          <span className={`text-xs tabular-nums ${TONE_TEXT[changeTone(item.price.change7d)]}`} title="7-day price change on poe.ninja">
            {fmtChange(item.price.change7d)}
          </span>
        )}
        {/* Unpriced shows a dash, never 0: an unknown price is not a worthless item. */}
        <PriceChip div={item.price?.div ?? null} exPerDiv={exPerDiv} source={item.price ? "ninja" : undefined} ageMin={item.price?.ageMin} />
      </span>
    </li>
  );
}

/** What the strategy drops, each with art, role, live exchange price and its evidence grade. */
export function YieldBasket({ yields, exPerDiv }: { yields: readonly YieldView[]; exPerDiv: number | null }) {
  return (
    <ul aria-label="Yield basket" className="divide-y divide-line/60">
      {yields.map((item) => (
        <YieldRow key={item.ref.id} item={item} exPerDiv={exPerDiv} />
      ))}
    </ul>
  );
}
