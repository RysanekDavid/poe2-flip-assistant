"use client";

import { fmtDiv } from "../../core/tools/bossEv/headline";
import { entryBreakdown, entryLabel, evConfidenceText, floorFallback } from "../../core/tools/bossEv/rowText";
import type { BossRow, EntryChip } from "../../lib/farmContract";
import { ItemArt } from "../ui/ItemArt";
import { PriceChip } from "../ui/PriceChip";
import { TONE_CLASS } from "./farmView";

/*
 * Board cells that carry the most wording (entry, floor, net). Provenance rides on native titles,
 * like PriceChip: a table of rows must not gain a tab stop per cell.
 */

function EntryItem({ chip }: { chip: EntryChip }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <ItemArt src={chip.icon} size={5} />
      <span className={chip.costDiv == null ? "text-neutral-400" : "text-neutral-200"}>{entryLabel(chip)}</span>
    </span>
  );
}

/** Art + "1× Breachlord Sac" + cost; several items stack as chips, the tooltip itemises the cost. */
export function EntryCell({ r, exPerDiv }: { r: BossRow; exPerDiv: number | null }) {
  const total = r.entryComplete ? (
    <PriceChip div={r.entryDiv} exPerDiv={exPerDiv} />
  ) : (
    <span className="text-sm text-neutral-400">{r.entryDiv > 0 ? `≥ ${fmtDiv(r.entryDiv, exPerDiv ?? 0)}` : "unpriced"}</span>
  );
  return (
    <span className="flex items-center justify-end gap-2" title={entryBreakdown(r.entry, r.entryDiv, r.entryComplete, exPerDiv ?? 0)}>
      <span className="grid justify-items-start gap-0.5 text-sm">
        {r.entry.map((chip) => (
          <EntryItem key={chip.name} chip={chip} />
        ))}
      </span>
      {total}
    </span>
  );
}

/** Priced loot on most kills; "≥ 0 · no guaranteed priced drop" instead of an empty dash. */
export function FloorCell({ r, exPerDiv }: { r: BossRow; exPerDiv: number | null }) {
  const fallback = floorFallback(r);
  if (!fallback) return <PriceChip div={r.floorDiv} exPerDiv={exPerDiv} />;
  return (
    <span className="text-sm text-neutral-400" title={fallback.title}>
      {fallback.text}
    </span>
  );
}

export const BOUND_PREFIX: Record<BossRow["netBound"], string> = { exact: "", lower: "≥ ", upper: "≤ ", unknown: "" };

/** Net per kill; the tooltip carries the verdict and how complete the EV behind it is. */
export function NetCell({ r, exPerDiv }: { r: BossRow; exPerDiv: number | null }) {
  const data = evConfidenceText(r);
  if (r.netBound === "unknown") {
    return (
      <span className="text-neutral-400" title={`entry partly unpriced and some drops have no rate — net unknown\n${data}`}>
        ?
      </span>
    );
  }
  // a negative LOWER bound is not a loss: drops without a sourced rate or price may cover it
  const unsure = r.netBound === "lower" && r.netDiv < 0;
  const verdict = unsure ? "not a sure loss — drops left out of EV may cover it" : `${r.headline.text}\n${r.headline.title}`;
  return (
    <span className={`tabular-nums ${unsure ? "text-neutral-300" : TONE_CLASS[r.headline.tone]}`} title={`${verdict}\n${data}`}>
      {BOUND_PREFIX[r.netBound]}
      {fmtDiv(r.netDiv, exPerDiv ?? 0, true)}
    </span>
  );
}
