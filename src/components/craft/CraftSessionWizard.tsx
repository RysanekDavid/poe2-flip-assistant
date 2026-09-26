"use client";

import { useEffect, useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";
import { priceLabel, type MatInfoFn, type RecipeView } from "./craftView";
import { PNL_CHANGED_EVENT } from "../CraftPnlPanel";
import { ShopScreen, type CostField, type ManualCosts } from "./SessionShop";
import { StepScreen, type Screen } from "./SessionStep";
import type { CraftGuide } from "../../core/craftRecipes";

/**
 * Interactive craft session — the guide as a live companion you follow WHILE crafting, not a
 * text dump. Lives INLINE at the top of the expanded recipe card: shopping checklist (live
 * prices + base trade link) → one big step at a time with "look for" targets, item-state checks
 * and done/failed branching → hit/brick + sale straight into P&L. Progress survives a refresh
 * via localStorage, so alt-tabbing from the game is safe.
 */

const LS_KEY = "craft-session";

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
  } catch (error: unknown) {
    console.error("[craft-session] saved session is invalid", error);
    return null;
  }
}

/** Session state + the two server calls (log attempt at start, record outcome at the end). */
function useCraftSession(r: RecipeView) {
  const restored = useMemo(() => {
    const saved = typeof window !== "undefined" ? loadSavedSession() : null;
    return saved?.recipeKey === r.key ? saved : null;
  }, [r.key]);
  const [screen, setScreen] = useState<Screen>(restored?.screen ?? { kind: "shop" });
  const [attemptId, setAttemptId] = useState<number | null>(restored?.attemptId ?? null);
  const [bought, setBought] = useState<Set<string>>(new Set(restored?.bought ?? []));
  const [needs, setNeeds] = useState<CostField[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    // Several cards can be expanded at once and each mounts a session. Only a session with real
    // progress may claim the storage slot — an idle shopping screen writing on mount would
    // silently overwrite another card's in-flight craft. (Two truly active sessions: last edit wins.)
    if (screen.kind === "shop" && attemptId == null && bought.size === 0) return;
    localStorage.setItem(LS_KEY, JSON.stringify({ recipeKey: r.key, domain: r.domain, screen, attemptId, bought: [...bought] } satisfies Saved));
  }, [r.key, r.domain, screen, attemptId, bought]);

  const reset = (logged: boolean): void => {
    localStorage.removeItem(LS_KEY);
    if (logged) window.dispatchEvent(new Event(PNL_CHANGED_EVENT));
    setAttemptId(null);
    setBought(new Set());
    setNeeds([]);
    setMsg(null);
    setScreen({ kind: "shop" }); // inline: a finished/abandoned session resets to the shopping list
  };

  const start = async (manual: ManualCosts): Promise<void> => {
    // Log the attempt at today's costs. The server refuses (409 + needs) to prefill a base that
    // failed its ask floor — the user then types what they actually paid.
    setMsg(null);
    const response = await fetch("/api/craft/attempts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipeKey: r.key, prefill: true, ...manual }),
    });
    const result = (await response.json()) as { id?: number; error?: string; needs?: CostField[] };
    if (!response.ok || result.id == null) {
      setNeeds(result.needs ?? []);
      setMsg(result.error ?? `attempt log failed (${response.status})`);
      return;
    }
    setNeeds([]);
    setAttemptId(result.id);
    setScreen({ kind: "step", idx: 0, failed: false });
  };

  const toggleBought = (id: string): void =>
    setBought((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return { screen, setScreen, attemptId, bought, toggleBought, needs, msg, setMsg, start, reset };
}

/** Phase stepper — shopping first, guide phases with ✓ once passed, result last. */
function SessionStepper({ guide, screen, curPhase, onReset }: { guide: CraftGuide; screen: Screen; curPhase: string | null; onReset: (() => void) | null }) {
  const curIdx = screen.kind === "outcome" ? guide.phases.length : curPhase ? guide.phases.findIndex((p) => p.title === curPhase) : -1;
  const pill = "rounded-full px-2 py-0.5 text-[11px]";
  return (
    <div className="flex flex-wrap items-center gap-1 rounded-t-md border-b border-neutral-800/70 bg-neutral-950/40 px-3 py-2">
      <span className={`${pill} ${screen.kind === "shop" ? "bg-sky-900/60 font-medium text-sky-200" : "bg-neutral-800/60 text-emerald-500"}`}>
        {screen.kind === "shop" ? "shopping" : "✓ shopping"}
      </span>
      {guide.phases.map((p, i) => (
        <span key={p.title} className="flex items-center gap-1">
          <span className="text-neutral-700">›</span>
          <span
            className={`${pill} ${
              curPhase === p.title ? "bg-emerald-900/60 font-medium text-emerald-200" : i < curIdx ? "bg-neutral-800/60 text-emerald-500" : "bg-neutral-800/60 text-neutral-500"
            }`}
          >
            {i < curIdx ? `✓ ${p.title}` : p.title}
          </span>
        </span>
      ))}
      <span className="flex items-center gap-1">
        <span className="text-neutral-700">›</span>
        <span className={`${pill} ${screen.kind === "outcome" ? "bg-fuchsia-900/60 font-medium text-fuchsia-200" : "bg-neutral-800/60 text-neutral-500"}`}>result</span>
      </span>
      {onReset && (
        <button onClick={onReset} title="reset the session (nothing is logged)" className="ml-auto inline-flex items-center gap-1 text-[11px] text-neutral-600 hover:text-neutral-400">
          <RotateCcw className="h-3 w-3" /> reset
        </button>
      )}
    </div>
  );
}

/** Hit/brick + optional sale price. An empty sale = kept/pending, not a loss (P&L treats it so). */
function OutcomeScreen(props: { brick: boolean; brickText: string; msg: string | null; onSave: (brick: boolean, soldDiv: number | null) => void; onSkip: () => void }) {
  const [sold, setSold] = useState("");
  const soldDiv = sold.trim() === "" ? null : Number(sold);
  return (
    <div className="space-y-4 p-4">
      <p className="text-lg font-medium text-neutral-100">{props.brick ? "Attempt bricked — log it honestly." : "Done — how did it end?"}</p>
      <p className="text-sm text-neutral-500">{props.brickText}</p>
      <div className="flex items-center gap-2">
        <input
          value={sold}
          onChange={(e) => setSold(e.target.value)}
          placeholder="sold for (div) — empty = kept/pending"
          className="w-56 rounded border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm text-neutral-200 placeholder:text-neutral-600"
        />
        <button onClick={() => props.onSave(false, soldDiv)} className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-600">
          hit ✓
        </button>
        <button onClick={() => props.onSave(true, soldDiv)} className="rounded-md border border-red-900/60 px-3 py-1.5 text-sm text-red-300 hover:bg-red-950/40">
          brick ✗
        </button>
      </div>
      {props.msg && <p className="text-sm text-amber-400">{props.msg}</p>}
      <button onClick={props.onSkip} className="text-xs text-neutral-600 underline hover:text-neutral-400">
        close without logging
      </button>
    </div>
  );
}

/** PATCH the attempt's outcome; rejects with the server's message. */
async function saveOutcome(attemptId: number, brick: boolean, soldDiv: number | null): Promise<void> {
  const response = await fetch("/api/craft/attempts", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: attemptId, outcome: brick ? "brick" : "hit", soldDiv }),
  });
  if (!response.ok) {
    const result = (await response.json()) as { error?: string };
    throw new Error(result.error ?? `outcome save failed (${response.status})`);
  }
}

export function CraftSessionInline({ r, ex, icons }: { r: RecipeView; ex: number | null; icons: Record<string, string> }) {
  const steps = useMemo(() => r.guide.phases.flatMap((p) => p.steps.map((step) => ({ phase: p.title, step }))), [r.guide]);
  const s = useCraftSession(r);
  const matInfo: MatInfoFn = (id) => {
    const line = r.report?.materials.find((m) => m.id === id);
    return { price: line?.unitDiv != null ? priceLabel(line.unitDiv, ex) : null, icon: icons[id] ?? null };
  };
  const onSave = (brick: boolean, soldDiv: number | null): void => {
    if (s.attemptId == null) return s.reset(false);
    saveOutcome(s.attemptId, brick, soldDiv)
      .then(() => s.reset(true))
      .catch((e: unknown) => s.setMsg(`⚠ ${e instanceof Error ? e.message : String(e)}`));
  };
  const screen = s.screen;
  const cur = screen.kind === "step" ? steps[screen.idx] : undefined;
  const inProgress = screen.kind !== "shop" || s.attemptId != null;

  return (
    <div className="rounded-md border border-neutral-800 bg-neutral-900">
      <SessionStepper guide={r.guide} screen={screen} curPhase={cur?.phase ?? null} onReset={inProgress ? () => s.reset(false) : null} />
      {screen.kind === "shop" && (
        <ShopScreen
          r={r}
          ex={ex}
          icons={icons}
          bought={s.bought}
          toggle={s.toggleBought}
          needs={s.needs}
          msg={s.msg}
          onStart={(manual) => void s.start(manual).catch((e: unknown) => s.setMsg(e instanceof Error ? e.message : String(e)))}
        />
      )}
      {screen.kind === "step" && cur && (
        <StepScreen step={cur.step} idx={screen.idx} total={steps.length} failed={screen.failed} matInfo={matInfo} go={s.setScreen} />
      )}
      {screen.kind === "outcome" && (
        <OutcomeScreen brick={screen.brick} brickText={r.guide.brick} msg={s.msg} onSave={onSave} onSkip={() => s.reset(false)} />
      )}
    </div>
  );
}
