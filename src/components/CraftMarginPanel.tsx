"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { Hammer, Loader2, Play, ChevronDown, ChevronRight } from "lucide-react";
import { Sparkline } from "./ui/Sparkline";
import { MarginBreakdown, evLabel, type RecipeView } from "./craft/MarginBreakdown";

interface MarginsResp {
  enabled: boolean;
  intervalMin: number;
  canRefresh: boolean;
  exaltPerDivine: number | null;
  recipes: RecipeView[];
  error?: string;
}

/** "3m ago" from a sqlite UTC timestamp ("YYYY-MM-DD HH:MM:SS") — normalize to UTC first. */
function scanAge(ts: string | null): string {
  if (!ts) return "never";
  const ms = Date.now() - new Date(ts.replace(" ", "T") + "Z").getTime();
  if (!Number.isFinite(ms) || ms < 0) return "just now";
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
}

/** EV rank: priced recipes by EV descending, unscanned ones last. */
function byEv(a: RecipeView, b: RecipeView): number {
  const av = a.report?.evDiv ?? -Infinity;
  const bv = b.report?.evDiv ?? -Infinity;
  return bv - av;
}

const statusTone: Record<string, string> = {
  "missing-materials": "text-amber-500",
  "leg-failed": "text-bad",
};

/**
 * Craft-margin board. Ranks curated recipes by live EV per attempt (hitRate × result median −
 * base − materials). Each row expands to the full itemized derivation. Read-only: it ranks and
 * links the trade searches; the human crafts. Owner can force a full refresh now.
 */
export function CraftMarginPanel() {
  const [data, setData] = useState<MarginsResp | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    () =>
      fetch("/api/craft/margins")
        .then((r) => r.json())
        .then((d: MarginsResp) => (d.error ? setErr(d.error) : (setData(d), setErr(null))))
        .catch((e) => setErr(String(e))),
    [],
  );

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  const refreshNow = async () => {
    if (refreshing) return;
    setRefreshing(true);
    setErr(null);
    setNotice(null);
    try {
      const res = await fetch("/api/craft/margins", { method: "POST" });
      const d = (await res.json().catch(() => ({}))) as { queued?: boolean; error?: string };
      if (!res.ok || d.error) setErr(d.error ?? `refresh failed (${res.status})`);
      else setNotice("refresh queued — poller picks it up within ~20s");
    } catch (e) {
      setErr(String(e));
    } finally {
      setRefreshing(false);
    }
  };

  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const ex = data?.exaltPerDivine ?? null;
  const recipes = [...(data?.recipes ?? [])].sort(byEv);

  return (
    <section className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
      <header className="mb-3 flex flex-wrap items-center gap-2.5">
        <Hammer className="h-5 w-5 text-amber-400" />
        <h2 className="text-lg font-semibold">Craft Margins</h2>
        {data && (
          <span className="flex items-center gap-1.5 text-xs">
            <span className={data.enabled ? "text-good" : "text-neutral-500"}>
              {data.enabled ? `auto · stalest every ${data.intervalMin}m` : "manual"}
            </span>
            <span className="text-neutral-700">·</span>
            <span className="text-neutral-500">{recipes.length} recipes</span>
          </span>
        )}
        {data?.canRefresh && (
          <button
            onClick={refreshNow}
            disabled={refreshing}
            title="queue a full re-price on the poller (owner)"
            className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white transition active:scale-[0.98] disabled:opacity-40"
          >
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} queue refresh
          </button>
        )}
      </header>

      {notice && <p className="mb-3 text-sm text-sky-400">{notice}</p>}

      <p className="mb-3 text-xs text-neutral-600">
        EV per attempt = <span className="text-neutral-400">hit rate × result median − base − materials</span>. Result and
        base legs are live trade2 comparables; materials are priced free from poe.ninja. Read-only — you craft manually.
      </p>

      {err && <p className="text-sm text-bad">error: {err}</p>}

      <div className="overflow-hidden rounded-md border border-neutral-800">
        <table className="w-full text-sm">
          <thead className="bg-neutral-950/60 text-left text-neutral-500">
            <tr>
              <th className="px-3 py-2 font-medium">recipe</th>
              <th className="px-3 py-2 text-right font-medium">EV / attempt</th>
              <th className="px-3 py-2 text-right font-medium">margin</th>
              <th className="px-3 py-2 text-right font-medium">hit</th>
              <th className="px-3 py-2 text-right font-medium">trend</th>
              <th className="px-3 py-2 text-right font-medium">scanned</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800/60">
            {recipes.map((r) => {
              const rep = r.report;
              const isOpen = open.has(r.key);
              const evTone = rep && rep.evDiv >= 0 ? "text-emerald-400" : "text-bad";
              return (
                <Fragment key={r.key}>
                  <tr
                    onClick={() => toggle(r.key)}
                    className="cursor-pointer align-top hover:bg-neutral-800/30"
                  >
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5 font-medium text-neutral-200">
                        {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-neutral-500" /> : <ChevronRight className="h-3.5 w-3.5 text-neutral-500" />}
                        {r.label}
                      </div>
                      {rep && rep.status !== "ok" && (
                        <div className={`ml-5 text-xs ${statusTone[rep.status] ?? "text-bad"}`}>{rep.status.replace("-", " ")}</div>
                      )}
                      {!rep && <div className="ml-5 text-xs text-neutral-600">not scanned yet</div>}
                    </td>
                    <td className={`px-3 py-2 text-right font-semibold tabular-nums ${evTone}`}>
                      {rep?.status === "ok" ? evLabel(rep.evDiv, ex) : "—"}
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${rep && rep.marginPct >= 0 ? "text-neutral-300" : "text-neutral-500"}`}>
                      {rep?.status === "ok" ? `${rep.marginPct.toFixed(0)}%` : "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-neutral-500">{(r.hitRate * 100).toFixed(0)}%</td>
                    <td className="px-3 py-2 text-right">
                      {r.evHistory.length >= 2 ? <Sparkline data={r.evHistory} /> : <span className="text-neutral-700">—</span>}
                    </td>
                    <td className="px-3 py-2 text-right text-xs text-neutral-500">{scanAge(r.scannedAt)}</td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={6} className="p-0">
                        <MarginBreakdown r={r} ex={ex} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {recipes.length === 0 && !err && (
              <tr>
                <td colSpan={6} className="py-3 text-center text-neutral-500">
                  no recipes scanned yet — the poller refreshes one each tick, or refresh all now
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
