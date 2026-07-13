"use client";

import { useCallback, useEffect, useState } from "react";
import { NotebookPen, Trash2 } from "lucide-react";
import { priceLabel, evLabel, MatIcon } from "./craft/MarginBreakdown";

/** Other components dispatch this after logging an attempt so the panel refreshes instantly. */
export const PNL_CHANGED_EVENT = "craft-pnl-changed";

interface Attempt {
  id: number;
  recipe_key: string;
  base_cost_div: number;
  mats_cost_div: number;
  outcome: "open" | "hit" | "brick";
  sold_div: number | null;
  note: string | null;
  created_at: string;
  closed_at: string | null;
}

interface RecipePnl {
  recipe_key: string;
  attempts: number;
  closed: number;
  hits: number;
  spent_div: number;
  sold_div: number;
}

interface Resp {
  attempts: Attempt[];
  byRecipe: RecipePnl[];
  labels: Record<string, string>;
  hitRates: Record<string, number>;
  icons: Record<string, string>;
  exaltPerDivine: number | null;
  error?: string;
}

function ageOf(ts: string): string {
  const ms = Date.now() - new Date(ts.replace(" ", "T") + "Z").getTime();
  if (!Number.isFinite(ms) || ms < 60_000) return "now";
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h}h` : `${Math.floor(h / 24)}d`;
}

const OUTCOME_TONE: Record<Attempt["outcome"], string> = {
  open: "text-sky-400",
  hit: "text-emerald-400",
  brick: "text-bad",
};

/** One open attempt's inline closing controls: sold price + hit/brick commit. */
function CloseControls({ onClose }: { onClose: (outcome: "hit" | "brick", soldDiv: number | null) => void }) {
  const [sold, setSold] = useState("");
  const val = sold.trim() === "" ? null : Number(sold);
  return (
    <span className="inline-flex items-center gap-1">
      <input
        value={sold}
        onChange={(e) => setSold(e.target.value)}
        placeholder="sold (div)"
        className="w-20 rounded border border-neutral-700 bg-neutral-900 px-1.5 py-0.5 text-xs text-neutral-200 placeholder:text-neutral-600"
      />
      <button onClick={() => onClose("hit", val)} className="rounded border border-emerald-700/60 px-1.5 py-0.5 text-xs text-emerald-400 hover:bg-emerald-900/30">
        hit
      </button>
      <button onClick={() => onClose("brick", val)} className="rounded border border-red-900/60 px-1.5 py-0.5 text-xs text-bad hover:bg-red-950/40">
        brick
      </button>
    </span>
  );
}

/**
 * Craft P&L — the user's logged attempts per recipe. Real hit rate and net Div close the loop on
 * the model's EV estimates: when they diverge, the recipe's hitRate/qty data needs tuning.
 */
export function CraftPnlPanel() {
  const [data, setData] = useState<Resp | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/craft/attempts")
      .then((r) => r.json() as Promise<Resp>)
      .then((d) => (d.error ? setErr(d.error) : (setData(d), setErr(null))))
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    window.addEventListener(PNL_CHANGED_EVENT, load);
    return () => {
      clearInterval(t);
      window.removeEventListener(PNL_CHANGED_EVENT, load);
    };
  }, [load]);

  const close = (id: number, outcome: "hit" | "brick", soldDiv: number | null): void => {
    fetch("/api/craft/attempts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, outcome, soldDiv }),
    }).then(load).catch(() => {});
  };
  const remove = (id: number): void => {
    fetch("/api/craft/attempts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }).then(load).catch(() => {});
  };

  const ex = data?.exaltPerDivine ?? null;
  const attempts = data?.attempts ?? [];

  return (
    <section className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-4">
      <div className="mb-1 flex items-center gap-2">
        <NotebookPen className="h-4 w-4 text-neutral-500" />
        <h2 className="text-base font-semibold text-neutral-100">Craft P&L — your attempts</h2>
        <span className="text-xs text-neutral-500">· craft sessions log here automatically</span>
      </div>
      {err && <p className="mb-2 text-sm text-bad">⚠ {err}</p>}

      {/* per-recipe reality check */}
      {data && data.byRecipe.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {data.byRecipe.map((r) => {
            const net = r.sold_div - r.spent_div;
            const realHit = r.closed > 0 ? (r.hits / r.closed) * 100 : null;
            const modelHit = (data.hitRates[r.recipe_key] ?? 0) * 100;
            return (
              <div key={r.recipe_key} className="rounded-md border border-neutral-800 bg-neutral-950/40 px-2.5 py-1.5 text-xs">
                <div className="flex items-center gap-1.5 font-medium text-neutral-200">
                  <MatIcon icon={data.icons[r.recipe_key] ?? null} size={5} />
                  {data.labels[r.recipe_key] ?? r.recipe_key}
                </div>
                <div className="text-neutral-500">
                  {r.attempts} attempts · hit {realHit != null ? `${realHit.toFixed(0)}%` : "—"}
                  <span className="text-neutral-600"> (model {modelHit.toFixed(0)}%)</span> · net{" "}
                  <span className={net >= 0 ? "text-emerald-400" : "text-bad"}>{evLabel(net, ex)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {attempts.length === 0 ? (
        <p className="text-sm text-neutral-600">no attempts logged yet</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-neutral-500">
              <tr>
                <th className="px-2 py-1.5 font-medium">recipe</th>
                <th className="px-2 py-1.5 text-right font-medium">cost</th>
                <th className="px-2 py-1.5 font-medium">outcome</th>
                <th className="px-2 py-1.5 text-right font-medium">sold</th>
                <th className="px-2 py-1.5 text-right font-medium">net</th>
                <th className="px-2 py-1.5 text-right font-medium">when</th>
                <th className="px-2 py-1.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/60 text-neutral-300">
              {attempts.map((a) => {
                const cost = a.base_cost_div + a.mats_cost_div;
                const net = a.outcome === "open" ? null : (a.sold_div ?? 0) - cost;
                return (
                  <tr key={a.id}>
                    <td className="px-2 py-1.5" title={a.note ?? undefined}>
                      <span className="inline-flex items-center gap-1.5">
                        <MatIcon icon={data?.icons[a.recipe_key] ?? null} size={5} />
                        {data?.labels[a.recipe_key] ?? a.recipe_key}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums" title={`base ${priceLabel(a.base_cost_div, ex)} + mats ${priceLabel(a.mats_cost_div, ex)}`}>
                      {priceLabel(cost, ex)}
                    </td>
                    <td className={`px-2 py-1.5 ${OUTCOME_TONE[a.outcome]}`}>
                      {a.outcome === "open" ? <CloseControls onClose={(o, s) => close(a.id, o, s)} /> : a.outcome}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{a.sold_div != null ? priceLabel(a.sold_div, ex) : "—"}</td>
                    <td className={`px-2 py-1.5 text-right font-medium tabular-nums ${net == null ? "text-neutral-600" : net >= 0 ? "text-emerald-400" : "text-bad"}`}>
                      {net == null ? "—" : evLabel(net, ex)}
                    </td>
                    <td className="px-2 py-1.5 text-right text-xs text-neutral-500">{ageOf(a.created_at)}</td>
                    <td className="px-2 py-1.5 text-right">
                      <button onClick={() => remove(a.id)} title="delete attempt" className="text-neutral-600 hover:text-bad">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
