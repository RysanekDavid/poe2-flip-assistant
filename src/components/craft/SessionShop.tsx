"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { MatIcon, priceLabel, type RecipeView } from "./craftView";

/** Costs the server could not prefill and asked the user for (409 `needs`). */
export type CostField = "baseCostDiv" | "matsCostDiv";
export type ManualCosts = Partial<Record<CostField, number>>;

const FIELD_LABEL: Record<CostField, string> = { baseCostDiv: "base paid (div)", matsCostDiv: "materials cost (div)" };

function GoalAndCheck({ r }: { r: RecipeView }) {
  return (
    <>
      <div className="rounded-md border-l-4 border-emerald-500 bg-emerald-950/20 py-2.5 pl-3 pr-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-400">the goal</p>
        <p className="mt-0.5 text-sm text-emerald-100">{r.guide.goal}</p>
      </div>
      <div className="rounded-md border-l-4 border-amber-500 bg-amber-950/20 py-2.5 pl-3 pr-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-400">market check — before you buy anything</p>
        <p className="mt-0.5 text-sm text-amber-100">{r.guide.marketCheck}</p>
      </div>
    </>
  );
}

function BaseCard({ r, ex }: { r: RecipeView; ex: number | null }) {
  const base = r.report?.base ?? null;
  return (
    <div className="flex gap-3 rounded-md border border-neutral-800 bg-neutral-950/40 p-3">
      {base?.icon && (
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-neutral-900">
          {/* eslint-disable-next-line @next/next/no-img-element -- poecdn item art */}
          <img src={base.icon} alt="" className="max-h-11 max-w-11 object-contain" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-neutral-200">1× base — {r.baseSpec.label}</span>
          {base?.searchUrl && (
            <a href={base.searchUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300">
              buy on trade ~{priceLabel(base.priceDiv, ex)} <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
        <p className="mt-1 text-xs text-neutral-500">{r.guide.shopping}</p>
      </div>
    </div>
  );
}

/** The recipe DEFINITION is the source of truth — the stored report can lag a recipe change by one
 *  scan cycle. Prices join in from the report where the ids still match. */
function shoppingRows(r: RecipeView) {
  return r.materialSpecs.map((m) => {
    const line = r.report?.materials.find((x) => x.id === m.id);
    return { id: m.id, label: m.label, qty: m.qty, unitDiv: line?.unitDiv ?? null };
  });
}

interface ChecklistProps {
  r: RecipeView;
  ex: number | null;
  icons: Record<string, string>;
  bought: ReadonlySet<string>;
  toggle: (id: string) => void;
}

function ShoppingChecklist({ r, ex, icons, bought, toggle }: ChecklistProps) {
  const mats = shoppingRows(r);
  return (
    <>
      <div className="flex items-baseline justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
          shopping list — tick off as you buy ({mats.filter((m) => bought.has(m.id)).length}/{mats.length})
        </p>
        {r.report && <span className="text-xs text-neutral-500">materials ~{priceLabel(r.report.materialsDiv, ex)}</span>}
      </div>
      <ul className="space-y-1">
        {mats.map((m) => (
          <li key={m.id}>
            <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm text-neutral-300 hover:bg-neutral-800/50">
              <input type="checkbox" checked={bought.has(m.id)} onChange={() => toggle(m.id)} />
              <span className={`inline-flex items-center gap-1.5 ${bought.has(m.id) ? "text-neutral-600 line-through" : ""}`}>
                <MatIcon icon={icons[m.id] ?? null} size={6} />
                {m.qty}× {m.label}
              </span>
              {m.unitDiv != null && <span className="ml-auto text-xs text-neutral-500">{priceLabel(m.unitDiv * m.qty, ex)}</span>}
            </label>
          </li>
        ))}
      </ul>
    </>
  );
}

/** Inputs for costs the server refused to guess (junk-floor base, unpriced material). */
function ManualCostInputs({ needs, values, set }: { needs: CostField[]; values: Record<CostField, string>; set: (f: CostField, v: string) => void }) {
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-md border border-amber-900/60 bg-amber-950/20 p-3">
      {needs.map((f) => (
        <label key={f} className="flex flex-col gap-1 text-xs text-amber-300">
          {FIELD_LABEL[f]}
          <input
            value={values[f]}
            onChange={(e) => set(f, e.target.value)}
            inputMode="decimal"
            placeholder="0.0"
            className="w-32 rounded border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-right text-sm tabular-nums text-neutral-200"
          />
        </label>
      ))}
    </div>
  );
}

interface ShopProps extends ChecklistProps {
  needs: CostField[];
  msg: string | null;
  onStart: (manual: ManualCosts) => void;
}

/** Shopping screen: goal, market check, base, checklist, and the start button. When the server
 *  refused to prefill a cost, the needed inputs appear and the start button sends them. */
export function ShopScreen({ needs, msg, onStart, ...list }: ShopProps) {
  const [values, setValues] = useState<Record<CostField, string>>({ baseCostDiv: "", matsCostDiv: "" });
  const total = list.r.materialSpecs.length;
  const boughtCount = list.r.materialSpecs.filter((m) => list.bought.has(m.id)).length;
  const allBought = boughtCount === total;
  const manual: ManualCosts = {};
  for (const f of needs) if (values[f].trim() !== "") manual[f] = Number(values[f]);
  const manualInvalid = needs.some((f) => !(Number.isFinite(manual[f]) && (manual[f] ?? -1) >= 0));
  return (
    <div className="space-y-4 p-4">
      <GoalAndCheck r={list.r} />
      <BaseCard r={list.r} ex={list.ex} />
      <ShoppingChecklist {...list} />
      {needs.length > 0 && <ManualCostInputs needs={needs} values={values} set={(f, v) => setValues((s) => ({ ...s, [f]: v }))} />}
      {msg && <p className="text-sm text-amber-400">⚠ {msg}</p>}
      {/* Always clickable once costs are known — an expert with everything in the stash shouldn't
          be forced to tick boxes. */}
      <button
        onClick={() => onStart(manual)}
        disabled={needs.length > 0 && manualInvalid}
        className={`w-full rounded-md px-3 py-2.5 text-sm font-semibold text-white transition disabled:opacity-40 ${
          allBought ? "animate-pulse bg-emerald-600 hover:animate-none hover:bg-emerald-500" : "bg-emerald-800/80 hover:bg-emerald-700"
        }`}
      >
        {allBought
          ? "everything bought — start crafting →"
          : `start crafting → (${boughtCount}/${total} bought — logs the attempt at today's costs)`}
      </button>
    </div>
  );
}
