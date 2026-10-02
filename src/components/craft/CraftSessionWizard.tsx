"use client";

import { useEffect, useMemo, useState } from "react";
import { priceLabel, pricedMaterials, type MatInfoFn, type RecipeView } from "./craftView";
import { PNL_CHANGED_EVENT } from "../CraftPnlPanel";
import { GuideRunner } from "./GuideRunner";
import { ShopScreen, type CostField, type ManualCosts } from "./SessionShop";
import type { Screen } from "./SessionStep";

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
  const s = useCraftSession(r);
  const matInfo: MatInfoFn = (id) => {
    const line = pricedMaterials(r)?.find((m) => m.id === id);
    return { price: line?.unitDiv != null ? priceLabel(line.unitDiv, ex) : null, icon: icons[id] ?? null };
  };
  const onSave = (brick: boolean, soldDiv: number | null): void => {
    if (s.attemptId == null) return s.reset(false);
    saveOutcome(s.attemptId, brick, soldDiv)
      .then(() => s.reset(true))
      .catch((e: unknown) => s.setMsg(`⚠ ${e instanceof Error ? e.message : String(e)}`));
  };
  const inProgress = s.screen.kind !== "shop" || s.attemptId != null;

  return (
    <GuideRunner
      guide={r.guide}
      screen={s.screen}
      go={s.setScreen}
      matInfo={matInfo}
      legality={(idx) => r.provenance.steps.find((l) => l.idx === idx) ?? null}
      onReset={inProgress ? () => s.reset(false) : null}
      shop={
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
      }
      outcome={(brick) => <OutcomeScreen brick={brick} brickText={r.guide.brick} msg={s.msg} onSave={onSave} onSkip={() => s.reset(false)} />}
    />
  );
}
