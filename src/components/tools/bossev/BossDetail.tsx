"use client";

import { ExternalLink, Info } from "lucide-react";
import type { BossView, EntryLineView, TierResult } from "../../../lib/tools/bossEvContract";
import { breakEvenHeadline, fmtDiv, oneIn } from "../../../core/tools/bossEv/headline";
import { BossArt, TONE_CLASS, evPerDivText, evText, netCell } from "./BossTable";
import { LootRow, PriceCell } from "./LootRow";

function RouteCost({ label, div, chosen, title, exPerDiv }: { label: string; div: number | null; chosen: boolean; title: string; exPerDiv: number }) {
  return (
    <span
      title={title}
      className={`rounded border px-1.5 py-0.5 tabular-nums ${chosen ? "border-good/50 text-good" : "border-neutral-800 text-neutral-500"}`}
    >
      {label} {div == null ? "—" : fmtDiv(div, exPerDiv)}
    </span>
  );
}

/** One entry item: buy vs craft side by side, the cheaper route highlighted. */
function EntryRow({ line, exPerDiv }: { line: EntryLineView; exPerDiv: number }) {
  const recipe = line.craftParts.map((p) => `${p.qty}× ${p.name}${p.price ? "" : " (unpriced)"}`).join(" + ");
  return (
    <li className="flex flex-wrap items-center gap-2 text-sm">
      <BossArt icon={line.icon} size="sm" />
      <span className="text-neutral-200">
        {line.qty.toLocaleString("en-US")}× {line.name}
      </span>
      <span className="text-xs text-neutral-500">
        unit <PriceCell price={line.unitPrice} exPerDiv={exPerDiv} />
      </span>
      <span className="ml-auto flex gap-1.5 text-xs">
        <RouteCost label="buy" div={line.buyDiv} chosen={line.route === "buy"} title="buy every unit on the exchange" exPerDiv={exPerDiv} />
        {line.craftParts.length > 0 && (
          <RouteCost label="craft" div={line.craftDiv} chosen={line.route === "craft"} title={`assemble from ${recipe}`} exPerDiv={exPerDiv} />
        )}
      </span>
    </li>
  );
}

function TierChips({ boss, tier, onTier }: { boss: BossView; tier: TierResult; onTier: (id: string) => void }) {
  if (boss.tiers.length < 2) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {boss.tiers.map((t) => (
        <button
          key={t.tierId}
          onClick={() => onTier(t.tierId)}
          className={`rounded border px-2 py-1 text-xs ${t.tierId === tier.tierId ? "border-neutral-600 bg-neutral-800 text-neutral-100" : "border-neutral-800 text-neutral-500 hover:text-neutral-300"}`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function Headline({ tier, exPerDiv }: { tier: TierResult; exPerDiv: number }) {
  const head = breakEvenHeadline(tier, exPerDiv);
  const net = netCell(tier, exPerDiv, head.tone);
  const jackpot = tier.jackpot;
  const jackpotTitle =
    jackpot.items.length === 0
      ? "no priced drop is worth the entry"
      : `drops worth ≥ entry: ${jackpot.items.join(", ")}\nchance per kill ${(jackpot.p * 100).toFixed(1)}–${(jackpot.pHigh * 100).toFixed(1)}%` +
        "\nassumes independent rolls — drops sharing one exclusive pool make this optimistic" +
        (jackpot.unknownRateCount > 0 ? `\n${jackpot.unknownRateCount} of them have no known rate (not counted)` : "");
  return (
    <div className="grid gap-1">
      <p className={`text-base font-semibold ${TONE_CLASS[head.tone]}`} title={head.title}>
        {head.text}
      </p>
      <p className="flex flex-wrap gap-x-3 text-xs text-neutral-500">
        <span title="priced drops with a stated rate, range rates at their low end; (up to) is the high end">EV {evText(tier, exPerDiv)}</span>
        <span className={net.className} title={net.title}>
          net {net.text}
        </span>
        <span>EV/Div {evPerDivText(tier)}</span>
        <span title={jackpotTitle}>
          jackpot {jackpot.killsToFirst == null ? "—" : oneIn(jackpot.p)}
        </span>
      </p>
      <p className="flex items-start gap-1.5 text-xs text-neutral-400">
        <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
        {tier.varianceNote}
      </p>
    </div>
  );
}

interface Props {
  boss: BossView;
  tier: TierResult;
  onTier: (tierId: string) => void;
  exPerDiv: number;
}

/** Selected boss: entry breakdown, loot rows with price source/age, rate, confidence and citation. */
export function BossDetail({ boss, tier, onTier, exPerDiv }: Props) {
  return (
    <section className="grid gap-3 rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
      <header className="flex flex-wrap items-center gap-3">
        <BossArt icon={boss.icon} size="lg" />
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-neutral-100">{boss.name}</h3>
          <p className="text-xs text-neutral-500" title={boss.accessChain}>
            {boss.mechanic} · <span className="underline decoration-dotted">how to get in</span>
          </p>
        </div>
        <div className="ml-auto">
          <TierChips boss={boss} tier={tier} onTier={onTier} />
        </div>
      </header>
      <Headline tier={tier} exPerDiv={exPerDiv} />
      <div>
        <h4 className="mb-1 text-[11px] uppercase tracking-wider text-neutral-500">Entry per attempt</h4>
        <ul className="grid gap-1.5">
          {tier.entryLines.map((line) => (
            <EntryRow key={line.itemId} line={line} exPerDiv={exPerDiv} />
          ))}
        </ul>
      </div>
      <div className="overflow-x-auto rounded-md border border-neutral-800">
        <table className="w-full text-sm">
          <thead className="bg-neutral-900 text-left text-xs text-neutral-400">
            <tr>
              <th className="px-2 py-1.5 font-medium">Drop</th>
              <th className="px-2 py-1.5 font-medium">Price</th>
              <th className="px-2 py-1.5 font-medium" title="per-kill drop rate as sourced">Rate</th>
              <th className="px-2 py-1.5 font-medium" title="price × rate per kill">EV</th>
              <th className="px-2 py-1.5 font-medium">Confidence</th>
              <th className="px-2 py-1.5 font-medium">Source</th>
            </tr>
          </thead>
          <tbody>
            {tier.loot.map((line) => (
              <LootRow key={line.name} line={line} exPerDiv={exPerDiv} />
            ))}
          </tbody>
        </table>
      </div>
      <footer className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-neutral-500">
        {boss.sources.map((s) => (
          <a key={s.url} href={s.url} target="_blank" rel="noreferrer" title={`accessed ${s.accessed}`} className="inline-flex items-center gap-1 hover:text-neutral-200">
            <ExternalLink className="h-3 w-3" />
            {s.title}
          </a>
        ))}
      </footer>
    </section>
  );
}
