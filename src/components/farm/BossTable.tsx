"use client";

import { fmtDiv } from "../../core/tools/bossEv/headline";
import { compact } from "../../lib/format";
import type { BossRow } from "../../lib/farmContract";
import { DataTable, type Column } from "../ui/DataTable";
import { EmptyState } from "../ui/EmptyState";
import { ItemArt } from "../ui/ItemArt";
import { PriceChip } from "../ui/PriceChip";
import { ConfidenceChip, fmtOneIn, fmtPct, TONE_CLASS, UnpricedChip } from "./farmView";

/** A computed Divine sum where 0 means "nothing priced lands here", not a free item. */
function SumCell({ div, exPerDiv, none }: { div: number; exPerDiv: number | null; none: string }) {
  if (div > 0) return <PriceChip div={div} exPerDiv={exPerDiv} />;
  return (
    <span className="text-neutral-500" title={none}>
      —
    </span>
  );
}

function EntryCell({ r, exPerDiv }: { r: BossRow; exPerDiv: number | null }) {
  if (r.entryComplete) return <PriceChip div={r.entryDiv} exPerDiv={exPerDiv} source="ninja" />;
  return (
    <span className="text-neutral-400" title="part of the entry is not on the exchange — the cost shown is a lower bound">
      {r.entryDiv > 0 ? `≥ ${fmtDiv(r.entryDiv, exPerDiv ?? 0)}` : "unpriced"}
    </span>
  );
}

function NetCell({ r, exPerDiv }: { r: BossRow; exPerDiv: number | null }) {
  const bound = r.entryComplete ? "" : "≤ ";
  return (
    <span className={`tabular-nums ${TONE_CLASS[r.headline.tone]}`} title={`${r.headline.text}\n${r.headline.title}`}>
      {bound}
      {fmtDiv(r.netDiv, exPerDiv ?? 0, true)}
    </span>
  );
}

function LoseCell({ r }: { r: BossRow }) {
  if (r.pLosingRun == null) return <span className="text-neutral-500" title="entry partly unpriced — cannot tell what a kill must cover">—</span>;
  const caveat = r.losingRunUnknownRates > 0 ? ` — ${r.losingRunUnknownRates} covering drop(s) have no known rate and count as never dropping` : "";
  return (
    <span className="tabular-nums text-neutral-200" title={`chance a kill drops nothing worth the uncovered entry (independent rolls)${caveat}`}>
      {fmtPct(r.pLosingRun)}
      {caveat && <span className="text-neutral-400">*</span>}
    </span>
  );
}

function columns(exPerDiv: number | null): Column<BossRow>[] {
  return [
    {
      key: "boss",
      header: "Boss",
      cell: (r) => (
        <span className="flex items-center gap-2" title={r.mechanic}>
          <ItemArt src={r.icon} size={6} />
          <span className="font-medium text-neutral-100">{r.name}</span>
        </span>
      ),
    },
    { key: "entry", header: "Entry", align: "right", tip: "cheapest of buying the key or crafting it, at today's exchange prices", cell: (r) => <EntryCell r={r} exPerDiv={exPerDiv} /> },
    { key: "floor", header: "Floor", align: "right", tip: "priced loot that lands on most kills: guaranteed drops plus drops at 1 in 10 or better", cell: (r) => <SumCell div={r.floorDiv} exPerDiv={exPerDiv} none="no priced drop lands on most kills" /> },
    { key: "chase", header: "Chase", align: "right", tip: "priced EV of drops rarer than 1 in 10 — the lottery part of a kill", cell: (r) => <SumCell div={r.chaseDiv} exPerDiv={exPerDiv} none="no priced rare drop with a sourced rate" /> },
    { key: "net", header: "Net", align: "right", tip: "expected loot − entry per kill, range rates at their low end; ≤ marks an upper bound (entry partly unpriced)", cell: (r) => <NetCell r={r} exPerDiv={exPerDiv} /> },
    { key: "oneIn", header: "Chase odds", align: "right", tip: "kills per rare (< 1 in 10) drop of any kind, from the sourced rates", cell: (r) => (r.chaseOneIn == null ? <span className="text-neutral-500">—</span> : <span className="tabular-nums">{fmtOneIn(r.chaseOneIn)}</span>) },
    { key: "lose", header: "P(lose)", align: "right", tip: "chance one kill does not pay for its entry; * = some covering drops have no known rate", cell: (r) => <LoseCell r={r} /> },
    { key: "liq", header: "Liquidity", align: "right", tip: "poe.ninja traded volume of the priciest entry item — how easily you can buy in", cell: (r) => (r.entryVolume == null ? <span className="text-neutral-500">—</span> : <span className="tabular-nums">{compact(r.entryVolume)}</span>) },
    {
      key: "chips",
      header: "Data",
      cell: (r) => (
        <span className="flex items-center gap-1.5">
          <ConfidenceChip confidence={r.confidence} />
          <UnpricedChip names={r.unpriced} lineage={r.unpricedLineage} />
        </span>
      ),
    },
  ];
}

interface Props {
  bosses: BossRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  exPerDiv: number | null;
}

/** Pinnacle bosses by net per kill; a row opens its loot table below. */
export function BossTable({ bosses, selectedId, onSelect, exPerDiv }: Props) {
  return (
    <DataTable
      columns={columns(exPerDiv)}
      rows={bosses}
      rowKey={(r) => r.id}
      onRowClick={(r) => onSelect(r.id)}
      selectedKey={selectedId ?? undefined}
      emptyState={<EmptyState icon={null} sentence="No boss data — the curated loot tables did not load." />}
    />
  );
}
