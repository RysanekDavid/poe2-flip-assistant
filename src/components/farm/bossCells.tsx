"use client";

import { Droplet } from "lucide-react";
import { fmtDiv } from "../../core/tools/bossEv/headline";
import { entryBreakdown, entrySummaryLabel, evConfidenceText, floorFallback, floorTitle, unmodelledShort } from "../../core/tools/bossEv/rowText";
import { compact } from "../../lib/format";
import type { BossRow, EntryChip } from "../../lib/farmContract";
import { ItemArt } from "../ui/ItemArt";
import { PriceChip } from "../ui/PriceChip";
import { artSrc } from "./farmArt";
import { TONE_CLASS } from "./farmView";

/*
 * Board cells that carry the most wording (boss, entry, net). Provenance rides on native titles,
 * like PriceChip: a table of rows must not gain a tab stop per cell.
 */

// Below this poe.ninja volume the entry is hard to buy in quantity; the old Liquidity column's
// numbers above it never changed a decision, so only the thin case earns a mark.
const THIN_ENTRY_VOLUME = 20;

/** The row's own keyboard target: the row itself stays a plain row because it holds an input. */
export function BossNameCell({ r, expanded, onToggle }: { r: BossRow; expanded: boolean; onToggle: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onToggle(r.id)}
      aria-expanded={expanded}
      title={`${r.name} — ${expanded ? "hide" : "show"} entry and drops`}
      className="flex items-center gap-2.5 rounded text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
    >
      <ItemArt src={artSrc(r.icon)} size={8} />
      <span className="grid">
        <span className="text-sm font-medium text-neutral-100">{r.name}</span>
        <span className="text-xs text-neutral-500">{r.mechanic}</span>
      </span>
    </button>
  );
}

/** Up to three entry items' art, overlapped, so a multi-item entry reads as one stack. */
function ArtStack({ chips }: { chips: readonly EntryChip[] }) {
  return (
    <span className="flex shrink-0 items-center">
      {chips.slice(0, 3).map((c, i) => (
        <span key={c.name} className={`inline-flex rounded bg-neutral-950 ring-1 ring-neutral-950 ${i > 0 ? "-ml-2" : ""}`}>
          <ItemArt src={artSrc(c.icon)} size={6} />
        </span>
      ))}
    </span>
  );
}

function ThinMarket({ volume }: { volume: number }) {
  return (
    <span title={`thin market — hard to buy in; poe.ninja volume ${compact(volume)}`} className="inline-flex">
      <Droplet aria-label="thin market" className="h-3.5 w-3.5 text-warn" />
    </span>
  );
}

/** Line 1: art + "An Audience with the King" / "3 Crisis Fragments"; line 2: the total cost. */
export function EntryCell({ r, exPerDiv }: { r: BossRow; exPerDiv: number | null }) {
  const lowerBound = !r.entryComplete || r.unmodelledEntry != null;
  const breakdown = entryBreakdown(r.entry, r.entryDiv, !lowerBound, exPerDiv ?? 0);
  const title = r.unmodelledEntry ? `${breakdown}\nnot modelled: ${r.unmodelledEntry.label} — ${r.unmodelledEntry.note}` : breakdown;
  const first = r.entry[0];
  if (!first) throw new Error(`boss ${r.id}: entry has no items`);
  const unpriced = r.entry.every((c) => c.costDiv == null);
  return (
    <span className="grid gap-0.5" title={title}>
      <span className="flex items-center gap-2">
        {r.entry.length === 1 ? <ItemArt src={artSrc(first.icon)} size={6} /> : <ArtStack chips={r.entry} />}
        <span className={`text-sm ${unpriced ? "text-neutral-400" : "text-neutral-200"}`}>{entrySummaryLabel(r.entry)}</span>
        {r.entryVolume != null && r.entryVolume < THIN_ENTRY_VOLUME && <ThinMarket volume={r.entryVolume} />}
      </span>
      <span className="flex items-center gap-2 pl-8">
        {lowerBound ? (
          <span className="text-sm text-neutral-400">{r.entryDiv > 0 ? `≥ ${fmtDiv(r.entryDiv, exPerDiv ?? 0)}` : "unpriced"}</span>
        ) : (
          <PriceChip div={r.entryDiv} exPerDiv={exPerDiv} />
        )}
        {r.unmodelledEntry && <span className="text-xs text-neutral-400">+ {unmodelledShort(r.unmodelledEntry.label)}</span>}
      </span>
    </span>
  );
}

export const BOUND_PREFIX: Record<BossRow["netBound"], string> = { exact: "", lower: "≥ ", upper: "≤ ", unknown: "" };

/** Net per kill; the tooltip carries the verdict and how complete the EV behind it is. */
function NetValue({ r, exPerDiv }: { r: BossRow; exPerDiv: number | null }) {
  const data = evConfidenceText(r);
  if (r.netBound === "unknown") {
    return (
      <span className="text-base font-semibold text-neutral-400" title={`entry partly unpriced and some drops have no rate — net unknown\n${data}`}>
        ?
      </span>
    );
  }
  // a negative LOWER bound is not a loss: drops without a sourced rate or price may cover it
  const unsure = r.netBound === "lower" && r.netDiv < 0;
  const verdict = unsure ? "not a sure loss — drops left out of EV may cover it" : `${r.headline.text}\n${r.headline.title}`;
  return (
    <span className={`text-base font-semibold tabular-nums ${unsure ? "text-neutral-300" : TONE_CLASS[r.headline.tone]}`} title={`${verdict}\n${data}`}>
      {BOUND_PREFIX[r.netBound]}
      {fmtDiv(r.netDiv, exPerDiv ?? 0, true)}
    </span>
  );
}

/** "floor 3.3 div · chase 1.5 div" under the net: where the per-kill value comes from. */
function NetParts({ r, exPerDiv }: { r: BossRow; exPerDiv: number | null }) {
  const ex = exPerDiv ?? 0;
  const fallback = floorFallback(r);
  return (
    <span className="text-xs text-neutral-500">
      {fallback ? (
        <span title={fallback.title}>no sure drop</span>
      ) : (
        <span title={floorTitle(r.floorDrops, ex)}>floor {fmtDiv(r.floorDiv, ex)}</span>
      )}
      {" · "}
      {r.chaseDiv > 0 ? (
        <span title="priced EV of drops rarer than 1 in 10 — the lottery part of a kill">chase {fmtDiv(r.chaseDiv, ex)}</span>
      ) : (
        <span title="no priced rare drop with a sourced rate">no chase</span>
      )}
    </span>
  );
}

export function NetCell({ r, exPerDiv }: { r: BossRow; exPerDiv: number | null }) {
  return (
    <span className="grid justify-items-end gap-0.5">
      <NetValue r={r} exPerDiv={exPerDiv} />
      <NetParts r={r} exPerDiv={exPerDiv} />
    </span>
  );
}
