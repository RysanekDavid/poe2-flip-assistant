"use client";

import { useState } from "react";
import { ExternalLink, NotebookPen } from "lucide-react";
import { PNL_CHANGED_EVENT } from "../CraftPnlPanel";
import type { LegReport } from "../../core/craftRecipes";
import { CraftSessionInline } from "./CraftSessionWizard";
import { MaterialsTable } from "./MaterialsTable";
import { NearMissLine } from "./NearMissLine";
import { evLabel, priceLabel, type RecipeView } from "./craftView";
import { GateNote } from "./GateNote";
import { basisWord, pct } from "./ProvenanceChips";
import { SourcesList } from "./SourcesList";
import { RETURN_FLAG_MULTIPLE } from "../../core/craftValuation";

/** How a leg's number was derived — a percentile of floor-passing asks or a comparable median,
 *  never "the price". */
function legBasis(leg: LegReport): string {
  const listed = `${leg.total.toLocaleString("en")} listed`;
  if (leg.method === "comparable-median") {
    const band = leg.band ? ` · band ${leg.band.p25.toFixed(2)}–${leg.band.p75.toFixed(2)} Div` : "";
    const dropped = leg.outliersDropped > 0 ? ` · ${leg.outliersDropped} bait dropped` : "";
    // only the cheapest CRAFT_RESULT_TOP_N asks are fetched: in a deep market this median sits at
    // its cheap end, so the label says "cheapest" and gives the listed total beside it
    return `median of ${leg.samples} of the ${leg.sampled ?? leg.samples} cheapest instant-buyout comparables (of ${listed})${band}${dropped}${leg.relaxed ? " · relaxed to defining mods" : ""} · asks, not sales`;
  }
  if (leg.percentile == null || leg.floorDiv == null) {
    return `legacy cheapest-asks value of ${leg.samples} · ${listed} · awaiting rescan`;
  }
  const dropped = leg.outliersDropped > 0 ? ` · ${leg.outliersDropped} under the floor dropped` : "";
  return `p${Math.round(leg.percentile * 100)} of ${leg.samples} asks ≥ ${leg.floorDiv.toFixed(2)} Div (${leg.sampled ?? "?"} sampled) · ${listed}${dropped} · asks, not sales`;
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
          {leg && <span className="text-xs text-neutral-500">{legBasis(leg)}</span>}
          {!leg && <span className="text-xs text-bad">not priced — leg failed its ask floor or was not scanned</span>}
        </div>
        {leg && leg.unresolvedStats.length > 0 && (
          <p className="mt-1 text-xs text-amber-500">⚠ unresolved (search widened): {leg.unresolvedStats.join("; ")}</p>
        )}
        {/* the caveat prose lives in a hover tooltip — the panel stays scannable */}
        <p className="mt-1 cursor-help text-xs text-neutral-500 underline decoration-dotted underline-offset-2" title={note}>
          ⓘ how this is priced
        </p>
      </div>
    </div>
  );
}

/**
 * The market gate for a recipe whose result found no usable comparables: with the base and
 * materials priced, say what a hit would have to sell for instead of showing no number at all.
 */
function UnpricedBreakEven({ r, ex }: { r: RecipeView; ex: number | null }) {
  const rep = r.report;
  const hit = r.provenance.hitRate;
  if (!rep?.base || rep.nearMiss || rep.result || !(hit.effective > 0)) return null;
  const cost = rep.base.priceDiv + rep.materialsDiv;
  return (
    <p className="rounded-md border border-neutral-800 bg-neutral-950/50 px-3 py-2 text-xs text-neutral-400">
      result unpriced — a hit must sell for ≥ <span className="tabular-nums text-neutral-200">{priceLabel(cost / hit.effective, ex)}</span>{" "}
      <span className="text-neutral-500">
        (cost {priceLabel(cost, ex)} ÷ hit {pct(hit.effective)} {basisWord(hit)})
      </span>
    </p>
  );
}

/** POST helper for the card actions: resolves to the JSON body, rejects with the server's error. */
async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok || data.error) throw new Error(data.error ?? `${url} failed (${res.status})`);
  return data;
}

/** "log attempt" — refuses loudly when the base price isn't trustworthy. */
function CardActions({ recipeKey }: { recipeKey: string }) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fail = (e: unknown) => setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });

  const logAttempt = (): void => {
    postJson<{ id: number }>("/api/craft/attempts", { recipeKey, prefill: true })
      .then(() => {
        window.dispatchEvent(new Event(PNL_CHANGED_EVENT));
        setMsg({ ok: true, text: "attempt logged at today's costs — close it as hit/brick in the P&L panel" });
      })
      .catch(fail);
  };

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <button
        onClick={logAttempt}
        title="log a real craft attempt at the floor-validated base price + today's material prices"
        className="inline-flex items-center gap-1 rounded border border-neutral-700 px-2 py-1 text-neutral-300 hover:bg-neutral-800"
      >
        <NotebookPen className="h-3.5 w-3.5" /> log attempt
      </button>
      {msg && <span className={msg.ok ? "text-emerald-400" : "text-amber-500"}>{msg.ok ? msg.text : `⚠ ${msg.text}`}</span>}
    </div>
  );
}

/** Full EV derivation for one recipe: session, actions, itemized materials, the literal formula
 *  and both legs. Rendered inside the expanded row of the margin panel. */
export function MarginBreakdown({ r, ex, icons, intervalMin }: { r: RecipeView; ex: number | null; icons: Record<string, string>; intervalMin: number }) {
  const rep = r.report;
  return (
    <div className="space-y-3 border-t border-neutral-800 bg-neutral-950/30 p-4">
      {rep?.error && <p className="text-sm text-bad">⚠ {rep.error}</p>}
      {r.lastError && (
        <p className="text-xs text-amber-500" title={r.lastError}>
          ⚠ latest rescan failed ({r.lastErrorAt ?? "recently"}, transient) — showing the last good scan; it retries next tick: {r.lastError}
        </p>
      )}
      {rep && !r.gate.ok && rep.status === "ok" && (
        <p className="flex flex-wrap items-center gap-2 text-sm text-neutral-300">
          Not ranked or alerted yet <GateNote r={r} intervalMin={intervalMin} />
        </p>
      )}

      {/* the interactive guide IS the card content — everything else is supporting detail below */}
      <CraftSessionInline r={r} ex={ex} icons={icons} />
      <CardActions recipeKey={r.key} />
      <MaterialsTable r={r} ex={ex} icons={icons} />

      {rep?.status === "ok" && rep.base && rep.result && (
        <p className="rounded-md bg-neutral-950/50 px-3 py-2 text-xs text-neutral-400">
          <span className="text-neutral-500">EV = </span>
          hit {(rep.hitRate * 100).toFixed(0)}% × {priceLabel(rep.result.priceDiv, ex)}
          {rep.returnFlagged && (
            <span className="text-amber-500" title={`hit × result is over ${RETURN_FLAG_MULTIPLE}× the attempt cost — plausible for cheap bases, but open the result search and check the asks are real`}>
              {" "}(&gt;{RETURN_FLAG_MULTIPLE}× cost — verify)
            </span>
          )}
          <span className="text-neutral-500"> − </span>base {priceLabel(rep.base.priceDiv, ex)}
          <span className="text-neutral-500"> − </span>mats {priceLabel(rep.materialsDiv, ex)}
          <span className="text-neutral-500"> = </span>
          <span className={`font-semibold ${rep.evDiv >= 0 ? "text-emerald-400" : "text-bad"}`}>{evLabel(rep.evDiv, ex)}</span>
          <span className="text-neutral-500"> / attempt</span>
        </p>
      )}
      {rep?.nearMiss && rep.result && <NearMissLine nm={rep.nearMiss} result={rep.result} gate={r.gate} ex={ex} basis={basisWord(r.provenance.hitRate)} />}
      <UnpricedBreakEven r={r} ex={ex} />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <LegBlock title={`Base — ${r.baseSpec.label}`} leg={rep?.base ?? null} note={r.baseSpec.note} ex={ex} />
        <LegBlock title={`Result — ${r.resultSpec.label}`} leg={rep?.result ?? null} note={r.resultSpec.note} ex={ex} />
      </div>
      <SourcesList p={r.provenance} />
    </div>
  );
}
