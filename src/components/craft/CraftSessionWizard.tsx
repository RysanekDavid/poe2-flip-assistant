"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Check, ChevronLeft, AlertTriangle, RotateCcw, ClipboardCheck } from "lucide-react";
import { priceLabel, MatIcon, type MatInfoFn, type RecipeView } from "./MarginBreakdown";
import { PNL_CHANGED_EVENT } from "../CraftPnlPanel";

/**
 * Interactive craft session — the guide as a live companion you follow WHILE crafting, not a
 * text dump. Lives INLINE at the top of the expanded recipe card: shopping checklist (live
 * prices + base trade link) → one big step at a time with "look for" targets, item-state checks
 * and done/failed branching → hit/brick + sale straight into P&L. Progress survives a refresh
 * via localStorage, so alt-tabbing from the game is safe.
 */

const LS_KEY = "craft-session";

type Screen = { kind: "shop" } | { kind: "step"; idx: number; failed: boolean } | { kind: "outcome"; brick: boolean };

interface Saved {
  recipeKey: string;
  domain: string; // owning domain window — only that window auto-reopens the session
  screen: Screen;
  attemptId: number | null;
  bought?: string[]; // shopping-list ticks survive a refresh — buying happens across game sessions
}

export function loadSavedSession(): Saved | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as Saved) : null;
  } catch {
    return null;
  }
}

export function CraftSessionInline({ r, ex, icons }: { r: RecipeView; ex: number | null; icons: Record<string, string> }) {
  const guide = r.guide;
  const steps = useMemo(
    () => guide.phases.flatMap((p) => p.steps.map((step) => ({ phase: p.title, step }))),
    [guide],
  );
  const saved = typeof window !== "undefined" ? loadSavedSession() : null;
  const restored = saved?.recipeKey === r.key ? saved : null;
  const [screen, setScreen] = useState<Screen>(restored?.screen ?? { kind: "shop" });
  const [attemptId, setAttemptId] = useState<number | null>(restored?.attemptId ?? null);
  const [bought, setBought] = useState<Set<string>>(new Set(restored?.bought ?? []));
  const [sold, setSold] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    // Several cards can be expanded at once and each mounts a session. Only a session with real
    // progress may claim the storage slot — an idle shopping screen writing on mount would
    // silently overwrite another card's in-flight craft. (Two truly active sessions: last edit wins.)
    const active = screen.kind !== "shop" || attemptId != null || bought.size > 0;
    if (!active) return;
    localStorage.setItem(
      LS_KEY,
      JSON.stringify({ recipeKey: r.key, domain: r.domain, screen, attemptId, bought: [...bought] } satisfies Saved),
    );
  }, [r.key, r.domain, screen, attemptId, bought]);

  const matInfo: MatInfoFn = (id) => {
    const line = r.report?.materials.find((m) => m.id === id);
    return {
      price: line?.unitDiv != null ? priceLabel(line.unitDiv, ex) : null,
      icon: icons[id] ?? null,
    };
  };

  const finish = (kind: "close" | "skip"): void => {
    localStorage.removeItem(LS_KEY);
    if (kind === "close") window.dispatchEvent(new Event(PNL_CHANGED_EVENT));
    setAttemptId(null);
    setSold("");
    setBought(new Set());
    setScreen({ kind: "shop" }); // inline: a finished/abandoned session resets to the shopping list
  };

  const start = (): void => {
    // Log the attempt at today's scanned costs so P&L reflects what this run actually cost.
    fetch("/api/craft/attempts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipeKey: r.key, prefill: true }),
    })
      .then((res) => res.json() as Promise<{ id?: number }>)
      .then((d) => setAttemptId(d.id ?? null))
      .catch(() => setAttemptId(null));
    setScreen({ kind: "step", idx: 0, failed: false });
  };

  const saveOutcome = (brick: boolean): void => {
    const soldDiv = sold.trim() === "" ? null : Number(sold);
    if (attemptId == null) {
      finish("skip");
      return;
    }
    fetch("/api/craft/attempts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: attemptId, outcome: brick ? "brick" : "hit", soldDiv }),
    })
      .then(() => finish("close"))
      .catch((e: unknown) => setMsg(`⚠ ${e instanceof Error ? e.message : String(e)}`));
  };

  // phase progress: everything before the current step's phase is done (✓)
  const curPhase = screen.kind === "step" ? steps[screen.idx]?.phase : null;
  const curPhaseIdx =
    screen.kind === "outcome" ? guide.phases.length : curPhase ? guide.phases.findIndex((p) => p.title === curPhase) : -1;
  const inProgress = screen.kind !== "shop" || attemptId != null;

  return (
    <div className="rounded-md border border-neutral-800 bg-neutral-900">
      {/* phase stepper — shopping first, guide phases with ✓ once passed, result last */}
      <div className="flex flex-wrap items-center gap-1 rounded-t-md border-b border-neutral-800/70 bg-neutral-950/40 px-3 py-2">
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] ${screen.kind === "shop" ? "bg-sky-900/60 font-medium text-sky-200" : "bg-neutral-800/60 text-emerald-500"}`}
        >
          {screen.kind === "shop" ? "shopping" : "✓ shopping"}
        </span>
        {guide.phases.map((p, i) => (
          <span key={p.title} className="flex items-center gap-1">
            <span className="text-neutral-700">›</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] ${
                curPhase === p.title
                  ? "bg-emerald-900/60 font-medium text-emerald-200"
                  : i < curPhaseIdx
                    ? "bg-neutral-800/60 text-emerald-500"
                    : "bg-neutral-800/60 text-neutral-500"
              }`}
            >
              {i < curPhaseIdx ? `✓ ${p.title}` : p.title}
            </span>
          </span>
        ))}
        <span className="flex items-center gap-1">
          <span className="text-neutral-700">›</span>
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] ${screen.kind === "outcome" ? "bg-fuchsia-900/60 font-medium text-fuchsia-200" : "bg-neutral-800/60 text-neutral-500"}`}
          >
            result
          </span>
        </span>
        {inProgress && (
          <button
            onClick={() => finish("skip")}
            title="reset the session (nothing is logged)"
            className="ml-auto inline-flex items-center gap-1 text-[11px] text-neutral-600 hover:text-neutral-400"
          >
            <RotateCcw className="h-3 w-3" /> reset
          </button>
        )}
      </div>

        {screen.kind === "shop" && (
          <div className="space-y-4 p-4">
            <div className="rounded-md border-l-4 border-emerald-500 bg-emerald-950/20 py-2.5 pl-3 pr-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-400">the goal</p>
              <p className="mt-0.5 text-sm text-emerald-100">{guide.goal}</p>
            </div>
            <div className="rounded-md border-l-4 border-amber-500 bg-amber-950/20 py-2.5 pl-3 pr-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-400">market check — before you buy anything</p>
              <p className="mt-0.5 text-sm text-amber-100">{guide.marketCheck}</p>
            </div>
            <div className="flex gap-3 rounded-md border border-neutral-800 bg-neutral-950/40 p-3">
              {r.report?.base?.icon && (
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-neutral-900">
                  {/* eslint-disable-next-line @next/next/no-img-element -- poecdn item art */}
                  <img src={r.report.base.icon} alt="" className="max-h-11 max-w-11 object-contain" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-neutral-200">1× base — {r.baseSpec.label}</span>
                  {r.report?.base?.searchUrl && (
                    <a href={r.report.base.searchUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300">
                      buy on trade ~{priceLabel(r.report.base.priceDiv, ex)} <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
                <p className="mt-1 text-xs text-neutral-500">{guide.shopping}</p>
              </div>
            </div>
            {(() => {
              // The recipe DEFINITION is the source of truth here — the stored report can lag a
              // recipe change by one scan cycle and would show outdated materials. Prices join in
              // from the report where the ids still match.
              const mats = r.materialSpecs.map((m) => {
                const line = r.report?.materials.find((x) => x.id === m.id);
                return { id: m.id, label: m.label, qty: m.qty, unitDiv: line?.unitDiv ?? null };
              });
              const boughtCount = mats.filter((m) => bought.has(m.id)).length;
              const allBought = boughtCount === mats.length;
              return (
                <>
                  <div className="flex items-baseline justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                      shopping list — tick off as you buy ({boughtCount}/{mats.length})
                    </p>
                    {r.report && (
                      <span className="text-xs text-neutral-500">
                        materials ~{priceLabel(r.report.materialsDiv, ex)}
                      </span>
                    )}
                  </div>
                  <ul className="space-y-1">
                    {mats.map((m) => (
                      <li key={m.id}>
                        <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm text-neutral-300 hover:bg-neutral-800/50">
                          <input
                            type="checkbox"
                            checked={bought.has(m.id)}
                            onChange={() => setBought((s) => { const n = new Set(s); if (n.has(m.id)) n.delete(m.id); else n.add(m.id); return n; })}
                          />
                          <span className={`inline-flex items-center gap-1.5 ${bought.has(m.id) ? "text-neutral-600 line-through" : ""}`}>
                            <MatIcon icon={icons[m.id] ?? null} size={6} />
                            {m.qty}× {m.label}
                          </span>
                          {"unitDiv" in m && m.unitDiv != null && <span className="ml-auto text-xs text-neutral-500">{priceLabel(m.unitDiv * m.qty, ex)}</span>}
                        </label>
                      </li>
                    ))}
                  </ul>
                  {/* the button tells you where you are: gathering → ready. Always clickable — an
                      expert who has everything in the stash shouldn't be forced to tick boxes. */}
                  <button
                    onClick={start}
                    className={`w-full rounded-md px-3 py-2.5 text-sm font-semibold text-white transition ${
                      allBought
                        ? "animate-pulse bg-emerald-600 hover:animate-none hover:bg-emerald-500"
                        : "bg-emerald-800/80 hover:bg-emerald-700"
                    }`}
                  >
                    {allBought
                      ? "everything bought — start crafting →"
                      : `start crafting → (${boughtCount}/${mats.length} bought — logs the attempt at today's costs)`}
                  </button>
                </>
              );
            })()}
          </div>
        )}

        {screen.kind === "step" && (() => {
          const { idx, failed } = screen;
          const cur = steps[idx]!;
          const last = idx === steps.length - 1;
          return (
            <div className="space-y-4 p-4">
              <div className="text-center text-xs uppercase tracking-wide text-neutral-500">
                step {idx + 1} / {steps.length}
              </div>

              {/* the things you slam NOW, front and center */}
              {cur.step.mats && cur.step.mats.length > 0 && (
                <div className="flex flex-wrap items-start justify-center gap-4">
                  {cur.step.mats.map((m) => {
                    const { price, icon } = matInfo(m.id);
                    return (
                      <div key={m.id} className="flex w-24 flex-col items-center gap-1 text-center">
                        <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-neutral-700 bg-neutral-950">
                          {icon ? (
                            // eslint-disable-next-line @next/next/no-img-element -- poecdn item art
                            <img src={icon} alt="" className="max-h-14 max-w-14 object-contain" />
                          ) : (
                            <span className="text-2xl text-neutral-700">?</span>
                          )}
                        </div>
                        <span className="text-xs leading-tight text-neutral-300">{m.label}</span>
                        {price && <span className="text-[11px] text-neutral-500">{price}</span>}
                      </div>
                    );
                  })}
                </div>
              )}

              <p className="text-center text-lg font-medium text-neutral-100">{cur.step.do}</p>
              {cur.step.why && <p className="text-center text-sm text-neutral-500">{cur.step.why}</p>}

              {cur.step.pick && (
                <div className="rounded-md border border-emerald-900/50 bg-emerald-950/20 p-3">
                  <p className="mb-2 text-center text-xs font-semibold uppercase tracking-wide text-emerald-400">look for (best first)</p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {cur.step.pick.map((p, i) => (
                      <span key={p} className="rounded-md border border-emerald-800/60 bg-emerald-950/40 px-2.5 py-1.5 text-sm text-emerald-200">
                        <span className="mr-1.5 font-semibold text-emerald-500">{i + 1}.</span>
                        {p}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {cur.step.warning && (
                <p className="flex items-start gap-2 rounded-md border border-red-900/60 bg-red-950/30 p-3 text-sm text-red-300">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {cur.step.warning}
                </p>
              )}
              {cur.step.check && (
                <p className="flex items-start justify-center gap-2 rounded-md border border-sky-900/50 bg-sky-950/20 p-2.5 text-sm text-sky-300">
                  <ClipboardCheck className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    <span className="font-medium">the item should now show: </span>
                    {cur.step.check}
                  </span>
                </p>
              )}
              {failed && cur.step.onFail && (
                <div className="rounded-md border border-amber-900/60 bg-amber-950/30 p-3 text-sm text-amber-300">
                  <p className="mb-2 font-medium">it failed — now what:</p>
                  <p>{cur.step.onFail}</p>
                  <div className="mt-3 flex gap-2">
                    <button onClick={() => setScreen(last ? { kind: "outcome", brick: false } : { kind: "step", idx: idx + 1, failed: false })} className="rounded border border-neutral-600 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-800">
                      continue anyway →
                    </button>
                    <button onClick={() => setScreen({ kind: "outcome", brick: true })} className="rounded border border-red-900/60 px-2 py-1 text-xs text-red-300 hover:bg-red-950/40">
                      abort attempt (brick)
                    </button>
                  </div>
                </div>
              )}
              {!failed && (
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => setScreen(idx === 0 ? { kind: "shop" } : { kind: "step", idx: idx - 1, failed: false })}
                    className="inline-flex items-center gap-1 rounded border border-neutral-700 px-2.5 py-1.5 text-sm text-neutral-400 hover:bg-neutral-800"
                  >
                    <ChevronLeft className="h-4 w-4" /> back
                  </button>
                  <button
                    onClick={() => setScreen(last ? { kind: "outcome", brick: false } : { kind: "step", idx: idx + 1, failed: false })}
                    className="ml-auto inline-flex items-center gap-1 rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-600"
                  >
                    <Check className="h-4 w-4" /> {last ? "done — finish" : "done → next"}
                  </button>
                  {cur.step.onFail && (
                    <button onClick={() => setScreen({ kind: "step", idx, failed: true })} className="rounded-md border border-amber-800/60 px-3 py-1.5 text-sm text-amber-400 hover:bg-amber-950/30">
                      ✗ it failed
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })()}

        {screen.kind === "outcome" && (
          <div className="space-y-4 p-4">
            <p className="text-lg font-medium text-neutral-100">{screen.brick ? "Attempt bricked — log it honestly." : "Done — how did it end?"}</p>
            <p className="text-sm text-neutral-500">{guide.brick}</p>
            <div className="flex items-center gap-2">
              <input
                value={sold}
                onChange={(e) => setSold(e.target.value)}
                placeholder="sold for (div) — empty if kept/unsold"
                className="w-56 rounded border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm text-neutral-200 placeholder:text-neutral-600"
              />
              <button onClick={() => saveOutcome(false)} className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-600">
                hit ✓
              </button>
              <button onClick={() => saveOutcome(true)} className="rounded-md border border-red-900/60 px-3 py-1.5 text-sm text-red-300 hover:bg-red-950/40">
                brick ✗
              </button>
            </div>
            {msg && <p className="text-sm text-amber-400">{msg}</p>}
            <button onClick={() => finish("skip")} className="text-xs text-neutral-600 underline hover:text-neutral-400">
              close without logging
            </button>
          </div>
        )}
    </div>
  );
}
