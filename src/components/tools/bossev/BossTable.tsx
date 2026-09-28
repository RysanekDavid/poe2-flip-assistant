"use client";

import { Skull } from "lucide-react";
import type { Rate } from "../../../core/tools/bossEv/schema";
import type { BossView, TierResult } from "../../../lib/tools/bossEvContract";
import { SCROLL_BOX, THEAD_STICKY } from "../../../lib/tableStyle";
import { fmtDiv, fmtRate, oneIn } from "./LootRow";

export interface Headline {
  text: string;
  tone: string;
  title: string;
}

function rateBounds(rate: Rate): { lo: number; hi: number } | null {
  if (rate.kind === "point") return { lo: rate.p, hi: rate.p };
  if (rate.kind === "range") return { lo: rate.lo, hi: rate.hi };
  return null;
}

/** Green when even the low estimate clears the break-even, red when the high one misses it. */
function verdictTone(rate: Rate, pStarNet: number): string {
  const bounds = rateBounds(rate);
  if (!bounds) return "text-neutral-200";
  if (bounds.lo >= pStarNet) return "text-good";
  if (bounds.hi < pStarNet) return "text-bad";
  return "text-warn";
}

/** The number to look at first: how often the chase must drop for a kill to repay its entry. */
export function breakEvenHeadline(tier: TierResult, exPerDiv: number): Headline {
  if (!tier.entryComplete) {
    return { text: "entry partly unpriced", tone: "text-neutral-500", title: "at least one entry item has no market price" };
  }
  const chase = tier.breakEven[0];
  const sure = `guaranteed loot ${fmtDiv(tier.guaranteedDiv, exPerDiv)} vs entry ${fmtDiv(tier.entryDiv, exPerDiv)}`;
  if (!chase) {
    return tier.guaranteedDiv >= tier.entryDiv
      ? { text: "guaranteed loot covers entry", tone: "text-good", title: sure }
      : { text: "no priced chase drop", tone: "text-neutral-500", title: sure };
  }
  if (chase.pStarNet === 0) {
    return { text: "guaranteed loot covers entry", tone: "text-good", title: `${sure}; ${chase.name} is pure upside` };
  }
  if (chase.pStarNet > 1) {
    return {
      text: "no single drop repays the entry",
      tone: "text-neutral-500",
      title: `${sure}; the priciest drop, ${chase.name} (${fmtDiv(chase.priceDiv, exPerDiv)}), is worth less than what it must cover`,
    };
  }
  const estimate = chase.rate.kind === "unknown" ? "no published rate" : `estimate ${fmtRate(chase.rate)} (${chase.confidence})`;
  // Several mid-value drops can repay the entry even when the single chase item's rate cannot.
  const coveredByEv = tier.evLowDiv >= tier.entryDiv;
  return {
    text: `pays if ${chase.name} drops more than ${oneIn(chase.pStarNet)}`,
    tone: coveredByEv ? "text-good" : verdictTone(chase.rate, chase.pStarNet),
    title: [
      ...(coveredByEv ? [`priced EV (low ${fmtDiv(tier.evLowDiv, exPerDiv)}) already covers the entry on average`] : []),
      `${chase.name} ≈ ${fmtDiv(chase.priceDiv, exPerDiv)}`,
      `alone it must drop ${oneIn(chase.pStar)}; after guaranteed loot ${oneIn(chase.pStarNet)}`,
      sure,
      estimate,
    ].join("\n"),
  };
}

function Badges({ tier }: { tier: TierResult }) {
  return (
    <span className="flex flex-wrap gap-1">
      {tier.unpriced.length > 0 && (
        <span title={`no price: ${tier.unpriced.join(", ")}`} className="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-400">
          {tier.unpriced.length} unpriced
        </span>
      )}
      {tier.unknownRate.length > 0 && (
        <span title={`no known rate: ${tier.unknownRate.join(", ")}`} className="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-400">
          {tier.unknownRate.length} rate ?
        </span>
      )}
    </span>
  );
}

export function BossArt({ icon, size }: { icon: string | null; size: "sm" | "lg" }) {
  const box = size === "sm" ? "h-8 w-8" : "h-12 w-12";
  if (!icon) return <Skull className={`${box} shrink-0 p-1 text-neutral-600`} aria-hidden />;
  return <img src={icon} alt="" className={`${box} shrink-0 object-contain`} loading="lazy" />;
}

function evText(tier: TierResult, exPerDiv: number): string {
  const point = fmtDiv(tier.evDiv, exPerDiv);
  if (Math.abs(tier.evHighDiv - tier.evLowDiv) < 1e-9 && Math.abs(tier.evLowDiv - tier.evDiv) < 1e-9) return point;
  return `${point} (${fmtDiv(tier.evLowDiv, exPerDiv)}–${fmtDiv(tier.evHighDiv, exPerDiv)})`;
}

interface Props {
  bosses: readonly BossView[];
  tierOf: (boss: BossView) => TierResult;
  selectedId: string | null;
  onSelect: (id: string) => void;
  exPerDiv: number;
}

/** One row per boss (its selected tier): entry, break-even headline, priced EV, net, EV per Div. */
export function BossTable({ bosses, tierOf, selectedId, onSelect, exPerDiv }: Props) {
  return (
    <div className={SCROLL_BOX}>
      <table className="w-full text-sm">
        <thead className={THEAD_STICKY}>
          <tr>
            <th className="px-2 py-2 font-medium">Boss</th>
            <th className="px-2 py-2 font-medium" title="cheapest of buy vs craft, per attempt">Entry</th>
            <th className="px-2 py-2 font-medium" title="drop rate at which the chase item repays the entry">Break-even</th>
            <th className="px-2 py-2 font-medium" title="priced drops with a stated rate; (range) adds range-rated drops at their low–high rate">Priced EV</th>
            <th className="px-2 py-2 font-medium" title="priced EV − entry">Net</th>
            <th className="px-2 py-2 font-medium" title="priced EV per Div of entry">EV/Div</th>
            <th className="px-2 py-2 font-medium" />
          </tr>
        </thead>
        <tbody>
          {bosses.map((boss) => (
            <BossRow key={boss.id} boss={boss} tier={tierOf(boss)} active={boss.id === selectedId} onSelect={onSelect} exPerDiv={exPerDiv} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface RowProps {
  boss: BossView;
  tier: TierResult;
  active: boolean;
  onSelect: (id: string) => void;
  exPerDiv: number;
}

function BossRow({ boss, tier, active, onSelect, exPerDiv }: RowProps) {
  const head = breakEvenHeadline(tier, exPerDiv);
  return (
    <tr
      onClick={() => onSelect(boss.id)}
      aria-selected={active}
      className={`cursor-pointer border-t border-neutral-800/70 ${active ? "bg-neutral-800/60" : "hover:bg-neutral-900/70"}`}
    >
      <td className="px-2 py-1.5">
        <span className="flex items-center gap-2" title={boss.accessChain}>
          <BossArt icon={boss.icon} size="sm" />
          <span className="min-w-0">
            <span className="block truncate font-medium text-neutral-100">{boss.name}</span>
            <span className="block text-[11px] text-neutral-500">
              {boss.mechanic}
              {boss.tiers.length > 1 ? ` · ${tier.label}` : ""}
            </span>
          </span>
        </span>
      </td>
      <td className="px-2 py-1.5 tabular-nums text-neutral-200">
        {tier.entryComplete ? "" : "≥ "}
        {fmtDiv(tier.entryDiv, exPerDiv)}
      </td>
      <td className={`px-2 py-1.5 ${head.tone}`} title={head.title}>
        {head.text}
      </td>
      <td className="px-2 py-1.5 tabular-nums text-neutral-300">{evText(tier, exPerDiv)}</td>
      <td className={`px-2 py-1.5 tabular-nums ${tier.netDiv >= 0 ? "text-good" : "text-neutral-400"}`}>{fmtDiv(tier.netDiv, exPerDiv, true)}</td>
      <td className="px-2 py-1.5 tabular-nums text-neutral-300">{tier.evPerDivSpent == null ? "—" : `${tier.evPerDivSpent.toFixed(2)}×`}</td>
      <td className="px-2 py-1.5">
        <Badges tier={tier} />
      </td>
    </tr>
  );
}
