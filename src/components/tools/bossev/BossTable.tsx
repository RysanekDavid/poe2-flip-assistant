
"use client";

import { Skull } from "lucide-react";
import { breakEvenHeadline, fmtDiv, type Tone } from "../../../core/tools/bossEv/headline";
import type { BossView, TierResult } from "../../../lib/tools/bossEvContract";
import { SCROLL_BOX, THEAD_STICKY } from "../../../lib/tableStyle";

export const TONE_CLASS: Record<Tone, string> = {
  good: "text-good",
  warn: "text-warn",
  bad: "text-bad",
  neutral: "text-neutral-300",
  muted: "text-neutral-500",
};

/** Net against a partly unpriced entry is only an upper bound, so it is never shown as a gain. */
export function netCell(tier: TierResult, exPerDiv: number): { text: string; className: string; title: string } {
  if (!tier.entryComplete) {
    return { text: `≤ ${fmtDiv(tier.netDiv, exPerDiv, true)}`, className: "text-neutral-500", title: "upper bound — part of the entry has no price" };
  }
  return { text: fmtDiv(tier.netDiv, exPerDiv, true), className: tier.netDiv >= 0 ? "text-good" : "text-neutral-400", title: "priced EV − entry" };
}

export function evPerDivText(tier: TierResult): string {
  if (tier.evPerDivSpent == null) return "—";
  return `${tier.entryComplete ? "" : "≤ "}${tier.evPerDivSpent.toFixed(2)}×`;
}

/** Conservative EV first; the optimistic end of range-rated drops only as a visible "up to". */
export function evText(tier: TierResult, exPerDiv: number): string {
  const point = fmtDiv(tier.evDiv, exPerDiv);
  return tier.evHighDiv - tier.evDiv > 1e-9 ? `${point} (up to ${fmtDiv(tier.evHighDiv, exPerDiv)})` : point;
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
            <th className="px-2 py-2 font-medium" title="priced drops with a stated rate, range rates at their low end; (up to) is the high end">Priced EV</th>
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
  const net = netCell(tier, exPerDiv);
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
      <td className={`px-2 py-1.5 ${TONE_CLASS[head.tone]}`} title={head.title}>
        {head.text}
      </td>
      <td className="px-2 py-1.5 tabular-nums text-neutral-300">{evText(tier, exPerDiv)}</td>
      <td className={`px-2 py-1.5 tabular-nums ${net.className}`} title={net.title}>
        {net.text}
      </td>
      <td className={`px-2 py-1.5 tabular-nums ${tier.entryComplete ? "text-neutral-300" : "text-neutral-500"}`}>{evPerDivText(tier)}</td>
      <td className="px-2 py-1.5">
        <Badges tier={tier} />
      </td>
    </tr>
  );
}
