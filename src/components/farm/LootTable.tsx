"use client";

import { ExternalLink } from "lucide-react";
import { fmtDiv, fmtRate } from "../../core/tools/bossEv/headline";
import type { LootLineView } from "../../lib/tools/bossEvContract";
import { DataTable, type Column } from "../ui/DataTable";
import { DivChip } from "./DivChip";
import { ConfidenceChip } from "./farmView";

function PriceCell({ line, exPerDiv }: { line: LootLineView; exPerDiv: number | null }) {
  if (!line.price) {
    const why = line.unpricedReason ?? "no market price found";
    return (
      <span className="text-neutral-400" title={`${why} — left out of EV, never counted as 0`}>
        {line.lineage ? "unpriced · lineage gem" : "unpriced"}
      </span>
    );
  }
  return <DivChip div={line.price.div} exPerDiv={exPerDiv} source={line.price.source} ageMin={line.price.ageHours == null ? undefined : line.price.ageHours * 60} />;
}

function evText(line: LootLineView, exPerDiv: number): { text: string; title: string } {
  if (line.rate.kind === "range" && line.evDiv != null && line.evHighDiv != null) {
    return { text: `${fmtDiv(line.evDiv, exPerDiv)} – ${fmtDiv(line.evHighDiv, exPerDiv)}`, title: "range rate: the low end counts toward EV, the high end is the upside" };
  }
  if (line.evDiv != null) return { text: fmtDiv(line.evDiv, exPerDiv), title: "price × rate, per kill" };
  return { text: "—", title: line.price == null ? "no price — excluded from EV" : "no known rate — excluded from EV" };
}

function columns(exPerDiv: number | null): Column<LootLineView>[] {
  return [
    { key: "name", header: "Drop", cell: (l) => <span className="text-neutral-100">{l.name}</span> },
    { key: "price", header: "Price", align: "right", tip: "poe.ninja for exchange items, poe2scout (cheapest listing, any roll) for uniques", cell: (l) => <PriceCell line={l} exPerDiv={exPerDiv} /> },
    {
      key: "rate",
      header: "Rate",
      align: "right",
      tip: "per-kill drop rate as the cited source states it",
      cell: (l) => <span className={`tabular-nums ${l.rate.kind === "unknown" ? "text-neutral-500" : "text-neutral-200"}`}>{fmtRate(l.rate)}</span>,
    },
    {
      key: "ev",
      header: "EV / kill",
      align: "right",
      cell: (l) => {
        const ev = evText(l, exPerDiv ?? 0);
        return (
          <span className="tabular-nums" title={ev.title}>
            {ev.text}
          </span>
        );
      },
    },
    { key: "conf", header: "Confidence", cell: (l) => <ConfidenceChip confidence={l.confidence} /> },
    {
      key: "src",
      header: "Source",
      cell: (l) => (
        <a href={l.source.url} target="_blank" rel="noreferrer" title={l.source.title} className="inline-flex items-center gap-1 text-xs text-sky-400 hover:underline">
          <ExternalLink aria-hidden className="h-3 w-3" />
          checked {l.source.accessed}
        </a>
      ),
    },
  ];
}

/** Every drop of one tier: price with source + age, sourced rate, EV share, confidence, citation. */
export function LootTable({ loot, exPerDiv }: { loot: LootLineView[]; exPerDiv: number | null }) {
  return <DataTable columns={columns(exPerDiv)} rows={loot} rowKey={(l) => l.name} emptyState={<p className="text-sm text-neutral-400">No drops listed.</p>} />;
}
