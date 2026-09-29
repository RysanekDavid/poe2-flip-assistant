"use client";

import { useState } from "react";
import { PackageOpen } from "lucide-react";
import type { SellResponse, SellRow, SellVerdict } from "../../lib/wealthContract";
import { parseSqliteTimestamp } from "../../lib/sqliteTime";
import { Button } from "../ui/Button";
import { DataTable, type Column } from "../ui/DataTable";
import { EmptyState } from "../ui/EmptyState";
import { ItemArt } from "../ui/ItemArt";
import { PriceChip, type PriceSource } from "../ui/PriceChip";
import { fmtAgeMin } from "../ui/StaleBadge";

const VERDICT: Record<SellVerdict, { label: string; className: string }> = {
  "sell-cx": { label: "Sell now", className: "border-good/40 bg-good/10 text-good" },
  list: { label: "List", className: "border-neutral-600 text-neutral-200" },
  reprice: { label: "Reprice", className: "border-amber-400/50 bg-amber-400/10 text-amber-300" },
  hold: { label: "Hold", className: "border-neutral-600 text-neutral-300" },
  unpriced: { label: "Unpriced", className: "border-line text-neutral-400" },
};

const SOURCE: Record<SellRow["valueSource"], PriceSource | undefined> = {
  cx: "cx", ninja: "ninja", scout: "scout", trade: "trade", none: undefined,
};

function VerdictChip({ v }: { v: SellVerdict }) {
  const { label, className } = VERDICT[v];
  return <span className={`rounded border px-1.5 py-0.5 text-xs font-medium ${className}`}>{label}</span>;
}

/** "listed 4d" — how long the listing has sat; the age is the case for a reprice. */
function listedAge(listedAt: string | null): string | null {
  if (listedAt == null) return null;
  const at = parseSqliteTimestamp(listedAt);
  return `listed ${fmtAgeMin((Date.now() - at) / 60_000)}`;
}

function CopyNote({ note }: { note: string | null }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  if (note == null) return null;
  const copy = () => {
    navigator.clipboard
      .writeText(note)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      })
      .catch((e: unknown) => {
        console.warn("[sell] clipboard write failed:", e instanceof Error ? e.message : e);
        setFailed(true);
      });
  };
  return (
    <Button size="sm" variant="secondary" onClick={copy} title={failed ? `copy failed — select it: ${note}` : `copy "${note}" for the stash tab note`}>
      {copied ? "Copied" : failed ? note : "Copy note"}
    </Button>
  );
}

function Why({ row }: { row: SellRow }) {
  const age = row.verdict === "reprice" || row.verdict === "list" ? listedAge(row.listedAt) : null;
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

/** The Sell column: one row per stash item, most actionable first (reprice → sell now → list → hold). */
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
