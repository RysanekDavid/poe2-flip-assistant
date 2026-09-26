"use client";

import { useState } from "react";
import { ExternalLink, Crosshair, NotebookPen } from "lucide-react";
import { PNL_CHANGED_EVENT } from "../CraftPnlPanel";
import type { LegReport } from "../../core/craftRecipes";
import { CraftSessionInline } from "./CraftSessionWizard";
import { MaterialsTable } from "./MaterialsTable";
import { evLabel, priceLabel, type RecipeView } from "./craftView";
import { RETURN_CAP_MULTIPLE } from "../../core/craftValuation";

/** How a leg's number was derived — a percentile of floor-passing asks, never "the price". */
function legBasis(leg: LegReport): string {
  const listed = `${leg.total.toLocaleString("en")} listed`;
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
        <p className="mt-1 cursor-help text-xs text-neutral-600 underline decoration-dotted underline-offset-2" title={note}>
          ⓘ how this is priced
        </p>
      </div>
    </div>
  );
}

/** POST helper for the card actions: resolves to the JSON body, rejects with the server's error. */
async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok || data.error) throw new Error(data.error ?? `${url} failed (${res.status})`);
  return data;
}

/** "hunt this base" + "log attempt" — both refuse loudly when the base price isn't trustworthy. */
function CardActions({ recipeKey }: { recipeKey: string }) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fail = (e: unknown) => setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });

  const huntBase = (): void => {
    postJson<{ cap: { amount: number; ccy: string }; created: boolean }>("/api/craft/hunt-preset", { recipeKey })
      .then((d) =>
        setMsg({
          ok: true,
          text: `hunt ${d.created ? "created" : "updated"} — cap ${d.cap.amount} ${d.cap.ccy}, scanning every 30s (Hunt panel)`,
        }),
      )
      .catch(fail);
  };
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
        onClick={huntBase}
        className="inline-flex items-center gap-1 rounded border border-neutral-700 px-2 py-1 text-neutral-300 hover:bg-neutral-800"
      >
        <Crosshair className="h-3.5 w-3.5" /> hunt this base
      </button>
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
export function MarginBreakdown({ r, ex, icons }: { r: RecipeView; ex: number | null; icons: Record<string, string> }) {
  const rep = r.report;
  return (
    <div className="space-y-3 border-t border-neutral-800 bg-neutral-950/30 p-4">
      {rep?.error && <p className="text-sm text-bad">⚠ {rep.error}</p>}
      {rep && !r.gate.ok && rep.status === "ok" && (
        <p className="text-xs text-amber-500" title={r.gate.reasons.join("\n")}>
          ⚠ low confidence — not ranked or alerted: {r.gate.reasons.join(" · ")}
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
          {rep.returnCapped && <span className="text-amber-500" title={`hit × result exceeded ${RETURN_CAP_MULTIPLE}× the attempt cost — capped`}> (capped at {RETURN_CAP_MULTIPLE}× cost)</span>}
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
