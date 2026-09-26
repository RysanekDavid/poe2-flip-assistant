"use client";

import { MatIcon, priceLabel, type RecipeView } from "./craftView";
import type { MaterialReportLine } from "../../core/craftRecipes";

function ageLabel(min: number | null): string {
  if (min == null) return "manual";
  if (min < 1) return "just now";
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  return h < 48 ? `${h}h` : `${Math.floor(h / 24)}d`;
}

/** Which guide step touches each material first — the table sorts and numbers by it, so the
 *  list reads as "use in this order", not as an arbitrary inventory dump. */
function usageOrder(r: RecipeView): Map<string, number> {
  const useOrder = new Map<string, number>();
  let stepNo = 0;
  for (const phase of r.guide.phases) {
    for (const step of phase.steps) {
      stepNo += 1;
      for (const m of step.mats ?? []) if (!useOrder.has(m.id)) useOrder.set(m.id, stepNo);
    }
  }
  return useOrder;
}

/** Report lines when scanned, else the recipe definition with unknown prices. */
function materialRows(r: RecipeView): MaterialReportLine[] {
  if (r.report) return r.report.materials;
  return r.materialSpecs.map((m) => ({
    id: m.id,
    label: m.label,
    qty: m.qty,
    unitDiv: null,
    totalDiv: null,
    source: "ninja" as const,
    ageMin: null,
  }));
}

/** Itemized materials in the order the craft uses them, with live unit/total prices. */
export function MaterialsTable({ r, ex, icons }: { r: RecipeView; ex: number | null; icons: Record<string, string> }) {
  const useOrder = usageOrder(r);
  const noteFor = (id: string): string | null => r.materialSpecs.find((m) => m.id === id)?.note ?? null;
  const rows = [...materialRows(r)].sort((a, b) => (useOrder.get(a.id) ?? 99) - (useOrder.get(b.id) ?? 99));
  return (
    <div className="overflow-hidden rounded-md border border-neutral-800">
      <table className="w-full text-sm">
        <thead className="bg-neutral-950/60 text-neutral-500">
          <tr className="text-left">
            <th className="px-3 py-1.5 font-medium" title="which step of the craft uses it first">#</th>
            <th className="px-3 py-1.5 font-medium">material</th>
            <th className="px-3 py-1.5 text-right font-medium">qty</th>
            <th className="px-3 py-1.5 text-right font-medium">unit</th>
            <th className="px-3 py-1.5 text-right font-medium">total</th>
            <th className="px-3 py-1.5 text-right font-medium">source</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-800/60 text-neutral-300">
          {rows.map((m) => (
            <tr key={m.id} title={noteFor(m.id) ?? undefined}>
              <td className="px-3 py-1.5 tabular-nums text-neutral-500">{useOrder.get(m.id) ?? "—"}</td>
              <td className="px-3 py-1.5">
                <span className="inline-flex items-center gap-1.5">
                  <MatIcon icon={icons[m.id] ?? null} size={5} />
                  {m.label}
                </span>
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums text-neutral-400">{m.qty}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{priceLabel(m.unitDiv, ex)}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{priceLabel(m.totalDiv, ex)}</td>
              <td className={`px-3 py-1.5 text-right text-xs ${m.source === "manual" ? "text-amber-500" : "text-neutral-500"}`}>
                {m.source} · {ageLabel(m.ageMin)}
              </td>
            </tr>
          ))}
          <tr className="bg-neutral-950/40 font-medium text-neutral-200">
            <td className="px-3 py-1.5" colSpan={4}>
              materials total
            </td>
            <td className="px-3 py-1.5 text-right tabular-nums">{priceLabel(r.report?.materialsDiv ?? null, ex)}</td>
            <td />
          </tr>
        </tbody>
      </table>
    </div>
  );
}
