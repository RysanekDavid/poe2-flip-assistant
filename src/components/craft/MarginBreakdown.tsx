"use client";

import { ExternalLink } from "lucide-react";
// Type-only imports are erased at build → safe to pull the canonical report shapes into a client
// component instead of hand-duplicating them (which drifts from the engine).
import type { LegReport, MaterialReportLine, RecipeMarginReport } from "../../core/craftRecipes";

/** The margins-route response row: static recipe meta + the latest live report + EV history. */
export interface RecipeView {
  key: string;
  label: string;
  source: string;
  steps: string[];
  hitRate: number;
  baseSpec: { label: string; note: string };
  resultSpec: { label: string; note: string };
  materialSpecs: Array<{ id: string; label: string; group: string; qty: number; note: string | null }>;
  report: RecipeMarginReport | null;
  scannedAt: string | null;
  evHistory: number[];
}

/** "12.3 div" primary, exalt fallback under 1 Div, "—" when absent. */
export function priceLabel(div: number | null | undefined, exPerDiv: number | null): string {
  if (div == null || div <= 0) return "—";
  if (div >= 1) return `${div.toLocaleString("en", { maximumFractionDigits: 2 })} div`;
  if (exPerDiv && exPerDiv > 0) {
    const e = div * exPerDiv;
    return `${e.toLocaleString("en", { maximumFractionDigits: e >= 10 ? 0 : 1 })} ex`;
  }
  return `${div.toPrecision(2)} div`;
}

/** Signed variant for EV — negative EV is a real number the user must see, not missing data. */
export function evLabel(div: number | null | undefined, exPerDiv: number | null): string {
  if (div == null || !Number.isFinite(div)) return "—";
  if (div === 0) return "0 div";
  const sign = div < 0 ? "−" : "+";
  return `${sign}${priceLabel(Math.abs(div), exPerDiv)}`;
}

function ageLabel(min: number | null): string {
  if (min == null) return "manual";
  if (min < 1) return "just now";
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  return h < 48 ? `${h}h` : `${Math.floor(h / 24)}d`;
}

function LegBlock({ title, leg, note, ex }: { title: string; leg: LegReport | null; note: string; ex: number | null }) {
  return (
    <div className="rounded-md border border-neutral-800 bg-neutral-950/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs uppercase tracking-wide text-neutral-500">{title}</span>
        {leg?.searchUrl && (
          <a
            href={leg.searchUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="open the comparable search on the trade site"
            className="inline-flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300"
          >
            trade <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-lg font-semibold tabular-nums text-neutral-100">{priceLabel(leg?.priceDiv ?? null, ex)}</span>
        {leg && (
          <span className="text-xs text-neutral-500">
            median of {leg.samples} · {leg.total.toLocaleString("en")} listed
            {leg.outliersDropped > 0 ? ` · ${leg.outliersDropped} bait dropped` : ""}
          </span>
        )}
      </div>
      {leg && leg.unresolvedStats.length > 0 && (
        <p className="mt-1 text-xs text-amber-500">⚠ unresolved (search widened): {leg.unresolvedStats.join("; ")}</p>
      )}
      <p className="mt-1 text-xs text-neutral-600">{note}</p>
    </div>
  );
}

/** Full EV derivation for one recipe: base leg, itemized materials, result leg, the literal
 *  formula, and the craft steps. Rendered inside the expanded row of the margin panel. */
export function MarginBreakdown({ r, ex }: { r: RecipeView; ex: number | null }) {
  const rep = r.report;
  const noteFor = (id: string): string | null => r.materialSpecs.find((m) => m.id === id)?.note ?? null;
  const fallbackLines: MaterialReportLine[] = r.materialSpecs.map((m) => ({
    id: m.id,
    label: m.label,
    qty: m.qty,
    unitDiv: null,
    totalDiv: null,
    source: "ninja",
    ageMin: null,
  }));

  return (
    <div className="space-y-3 border-t border-neutral-800 bg-neutral-950/30 p-4">
      {rep?.error && <p className="text-sm text-bad">⚠ {rep.error}</p>}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <LegBlock title={`Base — ${r.baseSpec.label}`} leg={rep?.base ?? null} note={r.baseSpec.note} ex={ex} />
        <LegBlock title={`Result — ${r.resultSpec.label}`} leg={rep?.result ?? null} note={r.resultSpec.note} ex={ex} />
      </div>

      {/* itemized materials */}
      <div className="overflow-hidden rounded-md border border-neutral-800">
        <table className="w-full text-sm">
          <thead className="bg-neutral-950/60 text-neutral-500">
            <tr className="text-left">
              <th className="px-3 py-1.5 font-medium">material</th>
              <th className="px-3 py-1.5 text-right font-medium">qty</th>
              <th className="px-3 py-1.5 text-right font-medium">unit</th>
              <th className="px-3 py-1.5 text-right font-medium">total</th>
              <th className="px-3 py-1.5 text-right font-medium">source</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800/60 text-neutral-300">
            {(rep?.materials ?? fallbackLines).map((m) => (
              <tr key={m.id} title={noteFor(m.id) ?? undefined}>
                <td className="px-3 py-1.5">{m.label}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-neutral-400">{m.qty}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{priceLabel(m.unitDiv, ex)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{priceLabel(m.totalDiv, ex)}</td>
                <td className={`px-3 py-1.5 text-right text-xs ${m.source === "manual" ? "text-amber-500" : "text-neutral-500"}`}>
                  {m.source} · {ageLabel(m.ageMin)}
                </td>
              </tr>
            ))}
            <tr className="bg-neutral-950/40 font-medium text-neutral-200">
              <td className="px-3 py-1.5" colSpan={3}>
                materials total
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums">{priceLabel(rep?.materialsDiv ?? null, ex)}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>

      {/* literal EV formula */}
      {rep?.status === "ok" && rep.base && rep.result && (
        <p className="rounded-md bg-neutral-950/50 px-3 py-2 text-xs text-neutral-400">
          <span className="text-neutral-500">EV = </span>
          hit {(rep.hitRate * 100).toFixed(0)}% × {priceLabel(rep.result.priceDiv, ex)}
          <span className="text-neutral-500"> − </span>base {priceLabel(rep.base.priceDiv, ex)}
          <span className="text-neutral-500"> − </span>mats {priceLabel(rep.materialsDiv, ex)}
          <span className="text-neutral-500"> = </span>
          <span className={`font-semibold ${rep.evDiv >= 0 ? "text-emerald-400" : "text-bad"}`}>{evLabel(rep.evDiv, ex)}</span>
          <span className="text-neutral-500"> / attempt</span>
        </p>
      )}

      {/* craft steps */}
      <div>
        <p className="mb-1 text-xs uppercase tracking-wide text-neutral-600">steps · {r.source}</p>
        <ol className="list-decimal space-y-0.5 pl-5 text-sm text-neutral-400">
          {r.steps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      </div>
    </div>
  );
}
