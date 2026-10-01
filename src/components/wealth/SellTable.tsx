"use client";

import { PackageOpen } from "lucide-react";
import type { SellResponse, SellRow } from "../../lib/wealthContract";
import { DataTable, type Column } from "../ui/DataTable";
import { EmptyState } from "../ui/EmptyState";
import { ItemArt } from "../ui/ItemArt";
import { PriceChip, type PriceSource } from "../ui/PriceChip";
import { CopyNote, SOURCE, VerdictChip, verdictAge } from "./sellVerdict";

function Why({ row }: { row: SellRow }) {
  const age = verdictAge(row);
  return (
    <span className="block max-w-[26rem] truncate text-neutral-300" title={`${row.reason} · ${row.routeReason}`}>
      {row.reason}
      {age && <span className="text-neutral-500"> · {age}</span>}
    </span>
  );
}

function columns(exPerDiv: number): Column<SellRow>[] {
  const chip = (div: number | null, source?: PriceSource) => <PriceChip div={div} exPerDiv={exPerDiv} source={source} />;
  return [
    {
      key: "item",
      header: "Item",
      cell: (r) => (
        <span className="flex min-w-0 items-center gap-2" title={r.tabs.length > 0 ? `tabs: ${r.tabs.join(", ")}` : undefined}>
          <ItemArt src={r.icon} size={6} />
          <span className="max-w-[16rem] truncate">{r.name}</span>
        </span>
      ),
    },
    { key: "qty", header: "Qty", align: "right", cell: (r) => <span className="tabular-nums">{r.qty.toLocaleString("en-US")}</span> },
    { key: "value", header: "Value", tip: "Market value per unit and where it came from (hover the price).", align: "right", cell: (r) => chip(r.unitDiv, SOURCE[r.valueSource]) },
    { key: "ask", header: "Your ask", tip: "Your stash-note price per unit, from the last read.", align: "right", cell: (r) => chip(r.askDiv, "manual") },
    { key: "verdict", header: "Verdict", tip: "Sell now on the exchange, list at fair, reprice an ask >15% over fair, or hold a rising item.", cell: (r) => <VerdictChip v={r.verdict} /> },
    { key: "why", header: "Why", cell: (r) => <Why row={r} /> },
    {
      key: "get",
      header: "Get now / patient",
      tip: "Whole stack, net of the exchange gold fee: a quick sale vs a patient one.",
      align: "right",
      cell: (r) => (
        <span className="inline-flex items-center gap-1.5">
          {chip(r.fastTotalDiv)}
          <span aria-hidden className="text-neutral-500">/</span>
          {chip(r.patientTotalDiv)}
        </span>
      ),
    },
    { key: "note", header: "Note", tip: "Stash-tab price note at the target price, per unit.", cell: (r) => <CopyNote note={r.note} /> },
  ];
}

/** Stash › Sell table view: one row per stash item, most actionable first (reprice → sell now → list → hold). */
export function SellTable({ data }: { data: SellResponse }) {
  return (
    <DataTable
      columns={columns(data.provenance.rates.exaltPerDivine)}
      rows={data.rows}
      rowKey={(r) => r.name}
      emptyState={<EmptyState icon={<PackageOpen className="h-5 w-5" />} sentence={data.reason ?? "Nothing to sell in your last read."} />}
    />
  );
}
