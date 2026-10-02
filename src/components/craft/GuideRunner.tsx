"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import type { CraftGuide } from "../../core/craftRecipes";
import { flattenGuide, resolveRetry, type RetryTarget } from "../../core/craftRetry";
import type { StepLegality } from "../../core/craftProvenance/schema";
import type { MatInfoFn } from "./craftView";
import { parseStoredScreen, serializeScreen } from "./guideSession";
import { StepScreen, type Screen } from "./SessionStep";

/**
 * The guide runner shared by recipe sessions and generated plans: a phase stepper, one big step at
 * a time with done / failed / retry branching, and slots for the caller's shopping and result
 * screens. The caller owns the screen state (and where it is stored), so a recipe session that
 * logs attempts and a plan session that logs nothing reuse the same runner.
 */

const PILL = "rounded-full px-2 py-0.5 text-xs";

/** Phase stepper — shopping first, guide phases with ✓ once passed, result last. */
function SessionStepper({ guide, screen, curPhase, onReset }: { guide: CraftGuide; screen: Screen; curPhase: string | null; onReset: (() => void) | null }) {
  const curIdx = screen.kind === "outcome" ? guide.phases.length : curPhase ? guide.phases.findIndex((p) => p.title === curPhase) : -1;
  return (
    <div className="flex flex-wrap items-center gap-1 rounded-t-md border-b border-neutral-800/70 bg-neutral-950/40 px-3 py-2">
      <span className={`${PILL} ${screen.kind === "shop" ? "bg-sky-900/60 font-medium text-sky-200" : "bg-neutral-800/60 text-emerald-500"}`}>
        {screen.kind === "shop" ? "shopping" : "✓ shopping"}
      </span>
      {guide.phases.map((p, i) => (
        <span key={p.title} className="flex items-center gap-1">
          <span aria-hidden className="text-neutral-500">›</span>
          <span
            title={p.title}
            className={`${PILL} max-w-[14rem] truncate ${
              curPhase === p.title ? "bg-emerald-900/60 font-medium text-emerald-200" : i < curIdx ? "bg-neutral-800/60 text-emerald-500" : "bg-neutral-800/60 text-neutral-400"
            }`}
          >
            {i < curIdx ? `✓ ${p.title}` : p.title}
          </span>
        </span>
      ))}
      <span className="flex items-center gap-1">
        <span aria-hidden className="text-neutral-500">›</span>
        <span className={`${PILL} ${screen.kind === "outcome" ? "bg-fuchsia-900/60 font-medium text-fuchsia-200" : "bg-neutral-800/60 text-neutral-400"}`}>result</span>
      </span>
      {onReset && (
        <button type="button" onClick={onReset} title="reset the session (nothing is logged)" className="ml-auto inline-flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-300">
          <RotateCcw aria-hidden className="h-3 w-3" /> reset
        </button>
      )}
    </div>
  );
}

/** Broken retryFrom refs already stop the server at RECIPES import and the planner at generation
 *  (testCraftRetry / assertGuideRetryRefs), so one can't reach a guide served here; if it somehow
 *  does, log it and keep the craft usable without the button rather than crash mid-craft. */
function retryTargetFor(guide: CraftGuide, idx: number): RetryTarget | null {
  const resolved = resolveRetry(guide, idx);
  if (!resolved) return null;
  if (resolved.ok) return resolved.target;
  console.error(`[craft-session] ${resolved.reason}`);
  return null;
}

export interface GuideRunnerProps {
  guide: CraftGuide;
  screen: Screen;
  go: (s: Screen) => void;
  matInfo: MatInfoFn;
  /** Audit verdict for a step's materials; null for none. */
  legality: (idx: number) => StepLegality | null;
  /** Shown while a session is in progress; null hides the reset control. */
  onReset: (() => void) | null;
  /** The shopping screen (it starts the session by moving to step 0). */
  shop: ReactNode;
  /** The result screen. */
  outcome: (brick: boolean) => ReactNode;
}

export function GuideRunner({ guide, screen, go, matInfo, legality, onReset, shop, outcome }: GuideRunnerProps) {
  const steps = useMemo(() => flattenGuide(guide), [guide]);
  const cur = screen.kind === "step" ? steps[screen.idx] : undefined;
  return (
    <div className="rounded-md border border-neutral-800 bg-neutral-900">
      <SessionStepper guide={guide} screen={screen} curPhase={cur?.phase ?? null} onReset={onReset} />
      {screen.kind === "shop" && shop}
      {screen.kind === "step" && cur && (
        <StepScreen
          step={cur.step}
          idx={screen.idx}
          total={steps.length}
          failed={screen.failed}
          matInfo={matInfo}
          go={go}
          legality={legality(screen.idx)}
          retry={retryTargetFor(guide, screen.idx)}
        />
      )}
      {screen.kind === "outcome" && outcome(screen.brick)}
    </div>
  );
}

/** The saved screen of `sessionKey` in `storageKey`; null when none fits (an unusable one is logged). */
export function readStored(storageKey: string, sessionKey: string, stepCount: number): Screen | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(storageKey);
  } catch (e: unknown) {
    console.error(`[guide-runner] could not read ${storageKey}`, e);
    return null;
  }
  const stored = parseStoredScreen(raw, sessionKey, stepCount);
  if (stored.ok) return stored.screen;
  console.error(`[guide-runner] ${storageKey}: ${stored.reason} — starting at the shopping list`);
  return null;
}

/** A failed write (storage full, private mode) costs only the resume — said loudly, never thrown mid-craft. */
function writeStored(storageKey: string, value: string | null): void {
  try {
    if (value == null) localStorage.removeItem(storageKey);
    else localStorage.setItem(storageKey, value);
  } catch (e: unknown) {
    console.error(`[guide-runner] could not save ${storageKey} — a refresh will not resume this step`, e);
  }
}

/**
 * Screen state for a guide with no attempt logging, kept in `storageKey` under `sessionKey` so an
 * alt-tab to the game or a refresh resumes the same step. A different session key starts fresh; an
 * idle shopping screen never writes, so opening a guide can't overwrite another one's progress.
 */
export function useGuideScreen(storageKey: string, sessionKey: string, guide: CraftGuide): { screen: Screen; go: (s: Screen) => void; reset: () => void } {
  const stepCount = useMemo(() => flattenGuide(guide).length, [guide]);
  const [state, setState] = useState<{ key: string; screen: Screen }>({ key: sessionKey, screen: { kind: "shop" } });
  useEffect(() => {
    setState({ key: sessionKey, screen: readStored(storageKey, sessionKey, stepCount) ?? { kind: "shop" } });
  }, [storageKey, sessionKey, stepCount]);
  const screen = state.key === sessionKey ? state.screen : { kind: "shop" as const };
  const go = (next: Screen): void => {
    setState({ key: sessionKey, screen: next });
    writeStored(storageKey, serializeScreen(sessionKey, next));
  };
  const reset = (): void => {
    writeStored(storageKey, null);
    setState({ key: sessionKey, screen: { kind: "shop" } });
  };
  return { screen, go, reset };
}
