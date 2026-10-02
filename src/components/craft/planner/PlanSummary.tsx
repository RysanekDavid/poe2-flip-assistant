"use client";

import { useState } from "react";
import { ChevronDown, Play } from "lucide-react";
import { useIsPhone } from "../../../lib/useIsPhone";
import type { BandView, PlanMaterialView, PlanResponse } from "../../../lib/tools/craftPlannerContract";
import { fmtDivOrEx, fmtDivOrExRange } from "../../../lib/format";
import { Button } from "../../ui/Button";
import { ItemArt } from "../../ui/ItemArt";
import { Tooltip } from "../../ui/Tooltip";
import { qtyText } from "./StepCard";

/**
 * The sticky summary: expected total (point + band, with its basis), the materials bill with art
 * and live prices, and the one action — run the plan step by step. Catalyst counts are an
 * assumption (~1% quality per catalyst), so they are editable and the total follows.
 */

export type QtyOverrides = Readonly<Record<string, number>>;

/** The total with every overridden line's contribution replaced by override × unit price. */
export function adjustedTotal(plan: PlanResponse, over: QtyOverrides): BandView | null {
  const t = plan.totals.div;
  if (!t) return null;
  let { point, low, high } = t;
  for (const line of plan.bill) {
    const o = over[line.id];
    if (o == null || line.unitDiv == null || line.totalDiv == null) continue;
    point += o * line.unitDiv - line.totalDiv.point;
    low += o * line.unitDiv - line.totalDiv.low;
    high += o * line.unitDiv - line.totalDiv.high;
  }
  return { point: Math.max(0, point), low: Math.max(0, low), high: Math.max(0, high) };
}

const BASIS_WORD = { exact: "exact", estimate: "estimate", unknown: "bounds only" } as const;

function Total({ plan, total }: { plan: PlanResponse; total: BandView | null }) {
  const ex = plan.exaltPerDivine ?? 0;
  if (!total) {
    return (
      <p className="text-sm text-amber-200" role="status">
        Not priced yet: {plan.unpriced.join(", ")} — the total waits for their exchange prices.
      </p>
    );
  }
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-neutral-400">expected cost, without the base</p>
      <p className="text-2xl font-semibold tabular-nums text-amber-300">≈ {fmtDivOrEx(total.point, ex)}</p>
      <p className="flex flex-wrap items-center gap-1.5 text-sm tabular-nums text-neutral-300">
        {fmtDivOrExRange(total.low, total.high, ex)}
        <Tooltip tip="The band follows each step's odds band. Steps that add a random mod are estimates (no public mod weights), so the total is too." align="end">
          <button type="button" className={`rounded border px-1.5 text-xs ${plan.totals.basis === "exact" ? "border-neutral-700 text-neutral-300" : "border-amber-400/40 text-amber-200"}`}>
            {BASIS_WORD[plan.totals.basis]}
          </button>
        </Tooltip>
      </p>
      {plan.exaltPerDivine == null && <p className="mt-1 text-xs text-neutral-400">Exchange rate not loaded yet — amounts show in Divine only.</p>}
    </div>
  );
}

function QtyCell({ line, over, onQty }: { line: PlanMaterialView; over: QtyOverrides; onQty: (id: string, n: number | null) => void }) {
  if (line.group !== "catalyst") return <span className="tabular-nums text-neutral-300">{qtyText(line.qty)}</span>;
  const value = over[line.id] ?? Math.round(line.qty.point);
  return (
    <label className="inline-flex items-center gap-1" title="assumption: about 1% quality per catalyst — type what yours take">
      <span className="text-xs text-amber-200">assumed</span>
      <input
        type="number"
        min={0}
        inputMode="numeric"
        value={value}
        aria-label={`${line.label} quantity (assumption)`}
        onChange={(e) => {
          const n = Number(e.target.value);
          onQty(line.id, e.target.value === "" || !Number.isFinite(n) || n < 0 ? null : n);
        }}
        className="h-6 w-14 rounded border border-amber-400/40 bg-neutral-950 text-right text-sm tabular-nums text-neutral-100 focus:border-amber-400 focus:outline-none"
      />
    </label>
  );
}

function Bill({ plan, over, onQty }: { plan: PlanResponse; over: QtyOverrides; onQty: (id: string, n: number | null) => void }) {
  const ex = plan.exaltPerDivine ?? 0;
  return (
    <ul aria-label="materials bill" className="divide-y divide-neutral-800/70">
      {plan.bill.map((line) => {
        const total = line.unitDiv != null ? (over[line.id] ?? line.qty.point) * line.unitDiv : null;
        return (
          <li key={line.id} className="flex items-center gap-2 py-1.5 text-sm">
            <ItemArt src={plan.icons[line.id] ?? null} size={6} alt={line.label} />
            <span className="min-w-0 flex-1 truncate text-neutral-200" title={line.unitDiv != null ? `${line.label} · ${fmtDivOrEx(line.unitDiv, ex)} each` : `${line.label} · unpriced`}>
              {line.label}
            </span>
            <QtyCell line={line} over={over} onQty={onQty} />
            <span className="w-16 shrink-0 text-right tabular-nums text-neutral-400">{total != null ? fmtDivOrEx(total, ex) : "—"}</span>
          </li>
        );
      })}
    </ul>
  );
}

interface Props {
  plan: PlanResponse;
  over: QtyOverrides;
  onQty: (id: string, n: number | null) => void;
  onRun: () => void;
  /** "Resume (step 3)" when a saved session of this plan exists. */
  runLabel: string;
}

export function PlanSummary({ plan, over, onQty, onRun, runLabel }: Props) {
  // on a phone the summary sits above the bench, so the long bill folds away until asked for
  const phone = useIsPhone();
  const [billOpen, setBillOpen] = useState(false);
  return (
    <aside aria-label="plan summary" className="space-y-3 rounded-lg border border-amber-900/50 bg-gradient-to-b from-amber-950/20 to-surface/80 p-4">
      <Total plan={plan} total={adjustedTotal(plan, over)} />
      <Button variant="primary" className="w-full" onClick={onRun}>
        <Play aria-hidden className="h-4 w-4" /> {runLabel}
      </Button>
      {phone && (
        <button type="button" aria-expanded={billOpen} onClick={() => setBillOpen((v) => !v)} className="flex w-full items-center justify-between text-sm text-neutral-300">
          materials ({plan.bill.length})
          <ChevronDown aria-hidden className={`h-4 w-4 text-neutral-400 transition-transform ${billOpen ? "rotate-180" : ""}`} />
        </button>
      )}
      {(!phone || billOpen) && <Bill plan={plan} over={over} onQty={onQty} />}
      <p className="text-xs text-neutral-400">
        {plan.league} · live exchange prices · rules {plan.patch.rules} · data {plan.patch.data}
      </p>
      {plan.rulesStale && (
        <p role="status" className="rounded border border-amber-400/40 bg-amber-950/30 p-2 text-xs text-amber-200">
          The craft rules were last verified for {plan.patch.rules}; re-check after {plan.patch.reverifyAfter} — a newer patch may have changed them.
        </p>
      )}
    </aside>
  );
}
