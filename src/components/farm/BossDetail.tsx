"use client";

import type { ReactNode } from "react";
import { ExternalLink } from "lucide-react";
import { breakEvenHeadline, fmtDiv, oneIn } from "../../core/tools/bossEv/headline";
import { compact } from "../../lib/format";
import type { BossView, EntryLineView, TierResult } from "../../lib/tools/bossEvContract";
import { ItemArt } from "../ui/ItemArt";
import { Panel } from "../ui/Panel";
import { PriceChip } from "../ui/PriceChip";
import { InfoTip } from "../ui/Tooltip";
import { TONE_CLASS } from "./farmView";
import { artSrc } from "./farmArt";
import { LootTable } from "./LootTable";

function RouteCost({ label, div, chosen, title, exPerDiv }: { label: string; div: number | null; chosen: boolean; title: string; exPerDiv: number }) {
  return (
    <span title={title} className={`rounded border px-1.5 tabular-nums ${chosen ? "border-amber-400/50 text-amber-200" : "border-line text-neutral-400"}`}>
      {label} {div == null ? "—" : fmtDiv(div, exPerDiv)}
    </span>
  );
}

/** One entry item: buy vs craft side by side, the cheaper route highlighted. */
function EntryRow({ line, exPerDiv }: { line: EntryLineView; exPerDiv: number }) {
  const recipe = line.craftParts.map((p) => `${p.qty}× ${p.name}${p.price ? "" : " (unpriced)"}`).join(" + ");
  return (
    <li className="flex flex-wrap items-center gap-2 text-sm">
      <ItemArt src={artSrc(line.icon)} size={6} />
      <span className="text-neutral-100">
        {line.qty.toLocaleString("en-US")}× {line.name}
      </span>
      {line.unitPrice ? (
        <PriceChip div={line.unitPrice.div} exPerDiv={exPerDiv} source={line.unitPrice.source} ageMin={line.unitPrice.ageHours == null ? undefined : line.unitPrice.ageHours * 60} />
      ) : (
        <span className="text-neutral-400" title="not listed on the currency exchange">unpriced</span>
      )}
      {line.volume != null && (
        <span className="text-xs tabular-nums text-neutral-500" title="poe.ninja traded volume — how easily you can buy in">
          vol {compact(line.volume)}
        </span>
      )}
      <span className="ml-auto flex gap-1.5 text-xs">
        <RouteCost label="buy" div={line.buyDiv} chosen={line.route === "buy"} title="buy every unit on the exchange" exPerDiv={exPerDiv} />
        {line.craftParts.length > 0 && <RouteCost label="craft" div={line.craftDiv} chosen={line.route === "craft"} title={`assemble from ${recipe}`} exPerDiv={exPerDiv} />}
      </span>
    </li>
  );
}

function Stat({ label, title, children }: { label: string; title?: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5 rounded-md border border-line bg-neutral-900/60 px-3 py-2" title={title}>
      <span className="text-xs text-neutral-500">{label}</span>
      <span className="text-base tabular-nums text-neutral-100">{children}</span>
    </div>
  );
}

function Metrics({ tier, exPerDiv }: { tier: TierResult; exPerDiv: number }) {
  const head = breakEvenHeadline(tier, exPerDiv);
  const j = tier.jackpot;
  const evLower = tier.loot.some((l) => l.evDiv == null);
  // entry partly unpriced → net overstated; drops left out of EV → net understated; both → unknown
  const entryFull = tier.entryComplete && tier.unmodelledEntry == null;
  const netPrefix = !entryFull ? (evLower ? "? " : "≤ ") : evLower ? "≥ " : "";
  return (
    <div className="grid gap-2">
      <p className={`text-base font-semibold ${TONE_CLASS[head.tone]}`} title={head.title}>
        {head.text}
      </p>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat label="Expected loot" title="priced drops with a sourced rate, range rates at their low end">
          {evLower ? "≥ " : ""}
          {fmtDiv(tier.evDiv, exPerDiv)}
        </Stat>
        <Stat label="Entry">
          {entryFull ? "" : "≥ "}
          {fmtDiv(tier.entryDiv, exPerDiv)}
        </Stat>
        <Stat label="Net per kill" title="≥ lower bound (drops without a rate or price are left out) · ≤ upper bound (entry partly unpriced)">
          {netPrefix}
          {fmtDiv(tier.netDiv, exPerDiv, true)}
        </Stat>
        <Stat label="Jackpot" title={j.items.length === 0 ? "no priced drop is worth the entry" : `drops worth ≥ entry: ${j.items.join(", ")}`}>
          {j.killsToFirst == null ? "—" : oneIn(j.p)}
        </Stat>
      </div>
      <p className="text-sm text-neutral-400">{tier.varianceNote}</p>
    </div>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return <h4 className="text-xs font-medium uppercase tracking-wide text-neutral-400">{children}</h4>;
}

function TierChips({ boss, tier, onTier }: { boss: BossView; tier: TierResult; onTier: (id: string) => void }) {
  if (boss.tiers.length < 2) return null;
  return (
    <div role="group" aria-label="Difficulty" className="flex flex-wrap gap-1">
      {boss.tiers.map((t) => (
        <button
          key={t.tierId}
          type="button"
          aria-pressed={t.tierId === tier.tierId}
          onClick={() => onTier(t.tierId)}
          className={`rounded-md border px-2 py-1 text-xs ${t.tierId === tier.tierId ? "border-amber-400/50 text-amber-100" : "border-line text-neutral-400 hover:text-neutral-100"}`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

interface Props {
  boss: BossView;
  tier: TierResult;
  onTier: (tierId: string) => void;
  exPerDiv: number;
}

/** Selected boss: how to get in, entry buy-vs-craft, every drop with price, rate and citation. */
export function BossDetail({ boss, tier, onTier, exPerDiv }: Props) {
  return (
    <Panel>
      <div className="grid gap-3">
        <header className="flex flex-wrap items-center gap-3">
          <ItemArt src={artSrc(boss.icon)} size={8} />
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-neutral-100">{boss.name}</h3>
            <p className="flex items-center gap-1.5 text-sm text-neutral-400">
              {boss.mechanic} · how to get in <InfoTip tip={boss.accessChain} label={`How to reach ${boss.name}`} />
            </p>
          </div>
          <div className="ml-auto">
            <TierChips boss={boss} tier={tier} onTier={onTier} />
          </div>
        </header>
        <Metrics tier={tier} exPerDiv={exPerDiv} />
        <SectionLabel>Entry per attempt</SectionLabel>
        <ul className="-mt-1.5 grid gap-1.5" aria-label="Entry per attempt">
          {tier.entryLines.map((line) => (
            <EntryRow key={line.itemId} line={line} exPerDiv={exPerDiv} />
          ))}
          {tier.unmodelledEntry && (
            <li className="flex flex-wrap items-center gap-2 text-sm text-neutral-400" title={tier.unmodelledEntry.note}>
              <ItemArt src={artSrc(tier.unmodelledEntry.icon ?? null)} size={6} />+ {tier.unmodelledEntry.label} — not modelled, so net is an upper bound
            </li>
          )}
        </ul>
        <SectionLabel>Drops</SectionLabel>
        <div className="-mt-1.5">
          <LootTable loot={tier.loot} exPerDiv={exPerDiv > 0 ? exPerDiv : null} />
        </div>
        <footer className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-neutral-400">
          {boss.sources.map((s) => (
            <a key={s.url} href={s.url} target="_blank" rel="noreferrer" title={`checked ${s.accessed}`} className="inline-flex items-center gap-1 hover:text-neutral-100">
              <ExternalLink aria-hidden className="h-3 w-3" />
              {s.title}
            </a>
          ))}
        </footer>
      </div>
    </Panel>
  );
}
