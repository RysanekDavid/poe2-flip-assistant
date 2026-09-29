"use client";

import type { KeyboardEvent } from "react";
import { ChevronDown, ChevronRight, Hammer, type LucideIcon } from "lucide-react";
import { Button } from "../ui/Button";
import { Sparkline } from "../ui/Sparkline";
import { evLabel, type RecipeView } from "./craftView";
import { GateNote } from "./GateNote";
import { MarginBreakdown } from "./MarginBreakdown";
import { HitRateChip, recipeHitRate, StatusChip } from "./ProvenanceChips";

export interface DomainMeta {
  title: string;
  icon: LucideIcon;
}

/** Only a gate-passing, non-negative EV earns the amber Craft button; everything else is "Review". */
export function isCraftable(r: RecipeView): boolean {
  const rep = r.report;
  return rep?.status === "ok" && rep.evDiv >= 0 && r.gate.ok;
}

function EvCell({ r, ex }: { r: RecipeView; ex: number | null }) {
  const rep = r.report;
  const ok = rep?.status === "ok";
  // a losing or unconfirmed EV stays readable but muted: it is a number to review, not an offer
  const tone = !ok ? "text-neutral-400" : isCraftable(r) ? "text-good" : rep.evDiv < 0 ? "text-red-300/70" : "text-neutral-300";
  return (
    <div className="w-28 text-right" title="expected profit per attempt at current prices: hit% × result price − base − materials">
      <div className="text-xs text-neutral-400">EV / attempt</div>
      <div className={`text-lg font-semibold tabular-nums ${tone}`}>{ok ? evLabel(rep.evDiv, ex) : "—"}</div>
      <div className="text-xs tabular-nums text-neutral-400">{ok ? `${rep.marginPct.toFixed(0)}% margin` : ""}</div>
    </div>
  );
}

function scanLabel(r: RecipeView): string {
  const rep = r.report;
  if (!rep) return "not scanned yet";
  return rep.status === "ok" ? "" : rep.status.replace("-", " ");
}

interface Props {
  r: RecipeView;
  ex: number | null;
  open: boolean;
  onToggle: () => void;
  onOpen: () => void;
  icons: Record<string, string>;
  meta: DomainMeta;
  intervalMin: number;
}

/** One recipe: art, name, hit rate, gate note, EV trend + EV, and Craft (or Review). Expands inline. */
export function RecipeRow({ r, ex, open, onToggle, onOpen, icons, meta, intervalMin }: Props) {
  const DomainIcon = meta.icon;
  const rep = r.report;
  const heroIcon = r.heroIcon ?? rep?.result?.icon ?? rep?.base?.icon ?? null;
  const craftable = isCraftable(r);
  const onKey = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.target !== e.currentTarget || (e.key !== "Enter" && e.key !== " ")) return;
    e.preventDefault();
    onToggle();
  };
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-neutral-950/40">
      <div role="button" tabIndex={0} aria-expanded={open} onClick={onToggle} onKeyDown={onKey} className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-neutral-800/30">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-neutral-900">
          {heroIcon ? <img src={heroIcon} alt="" className="max-h-11 max-w-11 object-contain" /> : <DomainIcon aria-hidden className="h-6 w-6 text-neutral-500" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium text-neutral-100">{r.label}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-neutral-400">
            <span>{meta.title}</span>
            <HitRateChip h={recipeHitRate(r)} />
            <StatusChip p={r.provenance} />
            {scanLabel(r) && <span className="text-amber-300">· {scanLabel(r)}</span>}
            {rep?.status === "ok" && <GateNote r={r} intervalMin={intervalMin} />}
          </div>
        </div>
        {r.evHistory.length >= 2 && (
          <span title="EV trend across the last scans">
            <Sparkline data={r.evHistory} />
          </span>
        )}
        <EvCell r={r} ex={ex} />
        <Button
          variant={craftable ? "primary" : "secondary"}
          onClick={(e) => {
            e.stopPropagation();
            onOpen(); // the session lives at the top of the card
          }}
          title={craftable ? "open the interactive craft guide — shopping list, step by step, result into P&L" : "EV is negative or not confirmed yet — open the numbers before you spend"}
        >
          {craftable ? <Hammer aria-hidden className="h-4 w-4" /> : null}
          {craftable ? "Craft" : "Review"}
        </Button>
        {open ? <ChevronDown aria-hidden className="h-4 w-4 shrink-0 text-neutral-400" /> : <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-neutral-400" />}
      </div>
      {open && <MarginBreakdown r={r} ex={ex} icons={icons} intervalMin={intervalMin} />}
    </div>
  );
}
