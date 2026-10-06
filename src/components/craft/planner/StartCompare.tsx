"use client";

import { useCallback, useState } from "react";
import type { BandView, PlanResponse, PlanRequest } from "../../../lib/tools/craftPlannerContract";
import { fmtDivOrEx, fmtDivOrExRange } from "../../../lib/format";
import { BuyLink } from "./BuyLink";
import { usePlan, type PlanState } from "./plannerClient";
import { totalWithBase } from "./plannerStartModel";
import { AskField } from "./StartChooser";

/**
 * "Let the planner compare": the clean-base plan and the bought-base plan side by side with what
 * each costs, the bought one with the player's base price added (or a prompt for it — never a
 * guessed price). Picking a card shows that plan's bench below.
 */

export type PlanView = "primary" | "bought";

/** Two plan requests at once: the primary (clean or chosen start) and, when comparing, the bought base. */
export function useComparePlans() {
  const primary = usePlan();
  const bought = usePlan();
  const [view, setView] = useState<PlanView>("primary");
  const run = useCallback(
    (reqs: { primary: PlanRequest; bought: PlanRequest | null }) => {
      primary.run(reqs.primary);
      if (reqs.bought) bought.run(reqs.bought);
      else bought.clear();
      setView("primary");
    },
    [primary, bought],
  );
  const shown: PlanState = view === "bought" && bought.state.kind !== "idle" ? bought.state : primary.state;
  return { primary: primary.state, bought: bought.state, view, setView, run, shown };
}

/** The total with the base for a bought plan; the materials total otherwise. */
export function startTotal(plan: PlanResponse, askDiv: number | null): BandView | null {
  return plan.start.kind === "bought" ? totalWithBase(plan, askDiv) : plan.totals.div;
}

function Status({ state }: { state: PlanState }) {
  if (state.kind === "loading") return <p className="text-sm text-neutral-400">planning…</p>;
  if (state.kind === "rejected") return <p className="text-sm text-red-200">No plan: {state.data.error}</p>;
  if (state.kind === "error") return <p className="text-sm text-red-200">Failed: {state.error}</p>;
  return null;
}

interface CardProps {
  title: string;
  state: PlanState;
  active: boolean;
  cheaper: boolean;
  askDiv: number | null;
  onAsk: (v: number | null) => void;
  onPick: () => void;
}

function BoughtLines({ plan, askDiv, onAsk }: { plan: PlanResponse; askDiv: number | null; onAsk: (v: number | null) => void }) {
  if (plan.start.kind !== "bought") return null;
  const ex = plan.exaltPerDivine ?? 0;
  const buys = plan.start.buys.point;
  return (
    <div className="space-y-1 text-xs text-neutral-300">
      <p>
        buys a {plan.start.rarity.toLowerCase()} base with {plan.start.carried.map((c) => `${c.fractured ? "FRACTURED " : ""}${c.text}`).join(" and ")}
      </p>
      <p className="flex flex-wrap items-center gap-1.5">
        materials {plan.totals.div ? `≈ ${fmtDivOrEx(plan.totals.div.point, ex)}` : "not priced yet"} + base
        <AskField value={askDiv} onChange={onAsk} label="your price for the bought base" />
        {buys > 1.0001 && <span className="text-neutral-400">× {buys.toFixed(1)} bases</span>}
      </p>
      <BuyLink plan={plan} />
    </div>
  );
}

function CompareCard({ title, state, active, cheaper, askDiv, onAsk, onPick }: CardProps) {
  const plan = state.kind === "plan" ? state.data : null;
  const total = plan ? startTotal(plan, askDiv) : null;
  const ex = plan?.exaltPerDivine ?? 0;
  const missingAsk = plan?.start.kind === "bought" && askDiv == null;
  return (
    <div className={`space-y-1.5 rounded-lg border p-3 ${active ? "border-amber-400/70 bg-amber-950/20" : "border-line bg-surface/60"}`}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-neutral-100">{title}</h3>
        {cheaper && <span className="rounded border border-emerald-500/50 px-1.5 text-xs text-emerald-300">cheaper</span>}
      </div>
      <Status state={state} />
      {plan && (
        <>
          {total ? (
            <p className="tabular-nums">
              <span className="text-xl font-semibold text-amber-300">≈ {fmtDivOrEx(total.point, ex)}</span> <span className="text-xs text-neutral-400">{fmtDivOrExRange(total.low, total.high, ex)}</span>
            </p>
          ) : (
            <p className="text-sm text-amber-200">{missingAsk ? "enter the base price — the total is incomplete without it" : `not priced yet: ${plan.unpriced.join(", ")}`}</p>
          )}
          <BoughtLines plan={plan} askDiv={askDiv} onAsk={onAsk} />
          <button type="button" aria-pressed={active} onClick={onPick} className="text-xs text-sky-300 hover:underline">
            {active ? "shown below" : "show this plan"}
          </button>
        </>
      )}
    </div>
  );
}

interface Props {
  primary: PlanState;
  bought: PlanState;
  view: PlanView;
  onView: (v: PlanView) => void;
  askDiv: number | null;
  onAsk: (v: number | null) => void;
}

export function StartCompare({ primary, bought, view, onView, askDiv, onAsk }: Props) {
  if (bought.kind === "idle") return null;
  const tp = primary.kind === "plan" ? startTotal(primary.data, askDiv)?.point ?? null : null;
  const tb = bought.kind === "plan" ? startTotal(bought.data, askDiv)?.point ?? null : null;
  return (
    <section aria-label="clean base or bought base" className="grid gap-3 sm:grid-cols-2">
      <CompareCard title="From a clean base" state={primary} active={view === "primary"} cheaper={tp != null && tb != null && tp < tb} askDiv={askDiv} onAsk={onAsk} onPick={() => onView("primary")} />
      <CompareCard title="From a bought base" state={bought} active={view === "bought"} cheaper={tp != null && tb != null && tb < tp} askDiv={askDiv} onAsk={onAsk} onPick={() => onView("bought")} />
    </section>
  );
}

export { BoughtLines };
