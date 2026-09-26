"use client";

import { useCallback, useEffect, useState } from "react";
import { NotebookPen, Trash2 } from "lucide-react";
import { priceLabel, evLabel, MatIcon } from "./craft/craftView";
import { ComputedLeague } from "./ui/ComputedLeague";

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
  spent_div: number; // realized attempts only
  sold_div: number;
  pending: number; // open + kept/unsold hits
  pending_cost_div: number;
}

interface Resp {
  attempts: Attempt[];
  byRecipe: RecipePnl[];
  labels: Record<string, string>;
  hitRates: Record<string, number>;
  icons: Record<string, string>;
  computedLeague: string;
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

/** A hit with no sale price is kept/pending — its value is unknown, not zero. */
const isPending = (a: Attempt): boolean => a.outcome === "open" || (a.outcome === "hit" && a.sold_div == null);

async function send(method: "PATCH" | "DELETE", body: unknown): Promise<void> {
  const res = await fetch("/api/craft/attempts", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) {
    const d = (await res.json()) as { error?: string };
    throw new Error(d.error ?? `attempt ${method} failed (${res.status})`);
  }
}

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
        title="leave empty if you kept the hit / haven't sold it yet — it stays pending, not a loss"
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

/** Per-recipe reality check: real hit rate vs model, realized net, pending attempts. */
function RecipeSummary({ r, data }: { r: RecipePnl; data: Resp }) {
  const net = r.sold_div - r.spent_div;
  const realHit = r.closed > 0 ? (r.hits / r.closed) * 100 : null;
  const modelHit = (data.hitRates[r.recipe_key] ?? 0) * 100;
  const ex = data.exaltPerDivine;
  return (
    <div className="rounded-md border border-neutral-800 bg-neutral-950/40 px-2.5 py-1.5 text-xs">
      <div className="flex items-center gap-1.5 font-medium text-neutral-200">
        <MatIcon icon={data.icons[r.recipe_key] ?? null} size={5} />
        {data.labels[r.recipe_key] ?? r.recipe_key}
      </div>
      <div className="text-neutral-500">
        {r.attempts} attempts · hit {realHit != null ? `${realHit.toFixed(0)}%` : "—"}
        <span className="text-neutral-600"> (model {modelHit.toFixed(0)}%)</span> · realized{" "}
        <span className={net >= 0 ? "text-emerald-400" : "text-bad"}>{evLabel(net, ex)}</span>
        {r.pending > 0 && (
          <span className="text-sky-400" title="open attempts and hits you kept / haven't sold — not counted as profit or loss yet">
            {" "}· {r.pending} kept/pending ({priceLabel(r.pending_cost_div, ex)} in)
          </span>
        )}
      </div>
    </div>
  );
}

function OutcomeCell({ a, onClose }: { a: Attempt; onClose: (o: "hit" | "brick", s: number | null) => void }) {
  if (a.outcome === "open") return <CloseControls onClose={onClose} />;
  if (a.outcome === "hit" && a.sold_div == null) {
    // sold later → record the sale on the same attempt (re-close) so it moves into realized P&L
    return (
      <span className="inline-flex items-center gap-1.5 text-sky-400">
        hit · kept/pending <CloseControls onClose={onClose} />
      </span>
    );
  }
  return <span className={a.outcome === "hit" ? "text-emerald-400" : "text-bad"}>{a.outcome}</span>;
}

function AttemptRow({ a, data, onClose, onRemove }: { a: Attempt; data: Resp; onClose: (o: "hit" | "brick", s: number | null) => void; onRemove: () => void }) {
  const ex = data.exaltPerDivine;
  const cost = a.base_cost_div + a.mats_cost_div;
  const net = isPending(a) ? null : (a.sold_div ?? 0) - cost;
  return (
    <tr>
      <td className="px-2 py-1.5" title={a.note ?? undefined}>
        <span className="inline-flex items-center gap-1.5">
          <MatIcon icon={data.icons[a.recipe_key] ?? null} size={5} />
          {data.labels[a.recipe_key] ?? a.recipe_key}
        </span>
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums" title={`base ${priceLabel(a.base_cost_div, ex)} + mats ${priceLabel(a.mats_cost_div, ex)}`}>
        {priceLabel(cost, ex)}
      </td>
      <td className="px-2 py-1.5">
        <OutcomeCell a={a} onClose={onClose} />
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums">{a.sold_div != null ? priceLabel(a.sold_div, ex) : "—"}</td>
      <td className={`px-2 py-1.5 text-right font-medium tabular-nums ${net == null ? "text-neutral-600" : net >= 0 ? "text-emerald-400" : "text-bad"}`}>
        {net == null ? "pending" : evLabel(net, ex)}
      </td>
      <td className="px-2 py-1.5 text-right text-xs text-neutral-500">{ageOf(a.created_at)}</td>
      <td className="px-2 py-1.5 text-right">
        <button onClick={onRemove} title="delete attempt" className="text-neutral-600 hover:text-bad">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </td>
    </tr>
  );
}

function usePnl() {
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
  const act = (method: "PATCH" | "DELETE", body: unknown): void => {
    send(method, body)
      .then(load)
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : String(e)));
  };
  return { data, err, act };
}

const HEADERS = ["recipe", "cost", "outcome", "sold", "net", "when"] as const;

/**
 * Craft P&L — the user's logged attempts per recipe. Real hit rate and realized net close the loop
 * on the model's EV estimates: when they diverge, the recipe's hitRate/qty data needs tuning.
 */
export function CraftPnlPanel() {
  const { data, err, act } = usePnl();
  const attempts = data?.attempts ?? [];
  return (
    <section className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-4">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <NotebookPen className="h-4 w-4 text-neutral-500" />
        <h2 className="text-base font-semibold text-neutral-100">Craft P&L — your attempts</h2>
        <span className="text-xs text-neutral-500">· craft sessions log here automatically · unsold hits stay pending</span>
        <ComputedLeague league={data?.computedLeague} />
      </div>
      {err && <p className="mb-2 text-sm text-bad">⚠ {err}</p>}
      {data && data.byRecipe.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {data.byRecipe.map((r) => (
            <RecipeSummary key={r.recipe_key} r={r} data={data} />
          ))}
        </div>
      )}
      {!data || attempts.length === 0 ? (
        <p className="text-sm text-neutral-600">no attempts logged yet</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-neutral-500">
              <tr>
                {HEADERS.map((h) => (
                  <th key={h} className={`px-2 py-1.5 font-medium ${h === "recipe" || h === "outcome" ? "" : "text-right"}`}>
                    {h}
                  </th>
                ))}
                <th className="px-2 py-1.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/60 text-neutral-300">
              {attempts.map((a) => (
                <AttemptRow
                  key={a.id}
                  a={a}
                  data={data}
                  onClose={(outcome, soldDiv) => act("PATCH", { id: a.id, outcome, soldDiv })}
                  onRemove={() => act("DELETE", { id: a.id })}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
