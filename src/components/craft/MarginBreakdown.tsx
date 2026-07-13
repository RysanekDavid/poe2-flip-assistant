"use client";

import { useState } from "react";
import { ExternalLink, Crosshair, NotebookPen } from "lucide-react";
import { PNL_CHANGED_EVENT } from "../CraftPnlPanel";
// Type-only imports are erased at build → safe to pull the canonical report shapes into a client
// component instead of hand-duplicating them (which drifts from the engine).
import type { CraftDomain, CraftGuide, LegReport, MaterialReportLine, RecipeMarginReport } from "../../core/craftRecipes";
import { CraftSessionInline } from "./CraftSessionWizard";

/** The margins-route response row: static recipe meta + the latest live report + EV history. */
export interface RecipeView {
  key: string;
  label: string;
  domain: CraftDomain;
  heroIcon: string | null;
  source: string;
  guide: CraftGuide;
  hitRate: number;
  baseSpec: { label: string; note: string };
  resultSpec: { label: string; note: string };
  materialSpecs: Array<{ id: string; label: string; group: string; qty: number; note: string | null }>;
  report: RecipeMarginReport | null;
  scannedAt: string | null;
  evHistory: number[];
}

/** Per-material display info (live price label + item art) resolved by the parent panel. */
export interface MatDisplay {
  price: string | null;
  icon: string | null;
}
export type MatInfoFn = (id: string) => MatDisplay;

// Static class map — Tailwind's JIT can't see dynamically-built class names.
const ICON_SIZE = { 4: "h-4 w-4", 5: "h-5 w-5", 6: "h-6 w-6" } as const;

/** Small item-art icon; renders nothing when the art isn't known yet. */
export function MatIcon({ icon, size = 5 }: { icon: string | null; size?: keyof typeof ICON_SIZE }) {
  if (!icon) return null;
  // eslint-disable-next-line @next/next/no-img-element -- poecdn art, fixed tiny size, no optimization needed
  return <img src={icon} alt="" className={`inline-block ${ICON_SIZE[size]} shrink-0 object-contain`} />;
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
    <div className="flex gap-3 rounded-md border border-neutral-800 bg-neutral-950/40 p-3">
      {leg?.icon && (
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-neutral-900">
          {/* eslint-disable-next-line @next/next/no-img-element -- poecdn item art */}
          <img src={leg.icon} alt="" className="max-h-11 max-w-11 object-contain" />
        </div>
      )}
      <div className="min-w-0 flex-1">
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
      {/* the caveat prose lives in a hover tooltip — the panel stays scannable */}
      <p className="mt-1 cursor-help text-xs text-neutral-600 underline decoration-dotted underline-offset-2" title={note}>
        ⓘ how this is priced
      </p>
      </div>
    </div>
  );
}

/** Full EV derivation for one recipe: base leg, itemized materials, result leg, the literal
 *  formula, and the craft steps. Rendered inside the expanded row of the margin panel. */
export function MarginBreakdown({ r, ex, icons }: { r: RecipeView; ex: number | null; icons: Record<string, string> }) {
  const rep = r.report;
  const [huntMsg, setHuntMsg] = useState<string | null>(null);

  const huntBase = (): void => {
    fetch("/api/craft/hunt-preset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipeKey: r.key }),
    })
      .then(async (res) => ({ ok: res.ok, d: (await res.json()) as { cap?: { amount: number; ccy: string }; error?: string } }))
      .then(({ ok, d }) =>
        setHuntMsg(ok && d.cap ? `hunt created — cap ${d.cap.amount} ${d.cap.ccy}, scanning every 30s (Hunt panel)` : `⚠ ${d.error ?? "failed"}`),
      )
      .catch((e: unknown) => setHuntMsg(`⚠ ${e instanceof Error ? e.message : String(e)}`));
  };

  const logAttempt = (): void => {
    fetch("/api/craft/attempts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipeKey: r.key, prefill: true }),
    })
      .then(async (res) => ({ ok: res.ok, d: (await res.json()) as { baseCostDiv?: number; matsCostDiv?: number; error?: string } }))
      .then(({ ok, d }) => {
        if (!ok) {
          setHuntMsg(`⚠ ${d.error ?? "failed"}`);
          return;
        }
        window.dispatchEvent(new Event(PNL_CHANGED_EVENT));
        setHuntMsg(`attempt logged at today's costs — close it as hit/brick in the P&L panel`);
      })
      .catch((e: unknown) => setHuntMsg(`⚠ ${e instanceof Error ? e.message : String(e)}`));
  };
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

  // Usage order: which guide step touches each material first — the table sorts and numbers by it,
  // so the list reads as "use in this order", not as an arbitrary inventory dump.
  const useOrder = new Map<string, number>();
  let stepNo = 0;
  for (const phase of r.guide.phases) {
    for (const step of phase.steps) {
      stepNo += 1;
      for (const m of step.mats ?? []) if (!useOrder.has(m.id)) useOrder.set(m.id, stepNo);
    }
  }
  const matRows = [...(rep?.materials ?? fallbackLines)].sort(
    (a, b) => (useOrder.get(a.id) ?? 99) - (useOrder.get(b.id) ?? 99),
  );

  return (
    <div className="space-y-3 border-t border-neutral-800 bg-neutral-950/30 p-4">
      {rep?.error && <p className="text-sm text-bad">⚠ {rep.error}</p>}

      {/* the interactive guide IS the card content — everything else is supporting detail below */}
      <CraftSessionInline r={r} ex={ex} icons={icons} />

      <div className="flex items-center gap-2 text-xs">
        <button
          onClick={huntBase}
          className="inline-flex items-center gap-1 rounded border border-neutral-700 px-2 py-1 text-neutral-300 hover:bg-neutral-800"
        >
          <Crosshair className="h-3.5 w-3.5" /> hunt this base
        </button>
        <button
          onClick={logAttempt}
          title="log a real craft attempt at the currently scanned base+materials cost"
          className="inline-flex items-center gap-1 rounded border border-neutral-700 px-2 py-1 text-neutral-300 hover:bg-neutral-800"
        >
          <NotebookPen className="h-3.5 w-3.5" /> log attempt
        </button>
        {huntMsg && <span className={huntMsg.startsWith("⚠") ? "text-amber-500" : "text-emerald-400"}>{huntMsg}</span>}
      </div>

      {/* itemized materials in the order the craft uses them */}
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
            {matRows.map((m) => (
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
              <td className="px-3 py-1.5 text-right tabular-nums">{priceLabel(rep?.materialsDiv ?? null, ex)}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>

      {/* the maths + comparable links, compact */}
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

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <LegBlock title={`Base — ${r.baseSpec.label}`} leg={rep?.base ?? null} note={r.baseSpec.note} ex={ex} />
        <LegBlock title={`Result — ${r.resultSpec.label}`} leg={rep?.result ?? null} note={r.resultSpec.note} ex={ex} />
      </div>
    </div>
  );
}
