"use client";

import { useMemo, useState } from "react";
import type { AlternativeView, FeasibilityIssueView, PlannerCatalog, PlannerPool } from "../../../lib/tools/craftPlannerContract";
import { withAlternative } from "./alternativesModel";
import { baseArt } from "./BaseChooser";
import { usePool, type PlanState } from "./plannerClient";
import { liveCheck, poolReady, targetIndex, type PlannerInput, type Side } from "./plannerModel";
import { poolProblems, poolSlot0, requestsFor } from "./plannerStartModel";
import { useComparePlans } from "./StartCompare";
import { usePlannerInput, usePrunePicks } from "./usePlannerInput";

/** The planner page's state: the input item, its base pool, both plans (clean / bought) and the slot reasons. */

/** What the mod picker is open for: a slot, or a side's pool. */
export type Picking = { side: Side; slot: number } | { side: Side; pool: true };

/** Server reasons for the CURRENT input only: a stale answer must not mark today's slots. */
function useIssues(state: PlanState, input: PlannerInput, current: string) {
  return useMemo(() => {
    const fresh = state.kind !== "idle" && state.kind !== "loading" && JSON.stringify(state.req) === current;
    const all: FeasibilityIssueView[] = !fresh ? [] : state.kind === "rejected" ? state.data.feasibility : state.kind === "plan" ? state.data.feasibility : [];
    const forSlot = (side: Side, slot: number) => {
      const idx = targetIndex(input.slots, side, slot);
      return idx == null ? [] : all.filter((i) => i.target === idx);
    };
    const forPool = (side: Side) => {
      const p = input.pools[side];
      if (!poolReady(p)) return [];
      const at = poolSlot0(input.slots, input.pools, side);
      return all.filter((i) => i.target != null && i.target >= at && i.target < at + p.need);
    };
    return { general: all.filter((i) => i.target == null), forSlot, forPool };
  }, [state, input.slots, input.pools, current]);
}

export function useBuilder(catalog: PlannerCatalog) {
  const io = usePlannerInput(catalog);
  const { input } = io;
  const poolLoad = usePool(input.itemClass, input.base);
  const pool: PlannerPool | null = poolLoad?.kind === "done" ? poolLoad.data : null;
  usePrunePicks(input, pool, io.setSlot, io.setPool);
  const plans = useComparePlans();
  const [picking, setPicking] = useState<Picking | null>(null);
  const reqs = useMemo(() => requestsFor(input), [input]);
  const current = JSON.stringify(reqs.primary);
  const issues = useIssues(plans.primary, input, current);
  const base = catalog.classes.find((c) => c.itemClass === input.itemClass)?.bases.find((b) => b.name === input.base);
  if (!base) throw new Error(`planner: ${input.base} vanished from the catalog`);
  const want = plans.view === "bought" ? JSON.stringify(reqs.bought) : current;
  const shown = plans.shown;
  const stale = shown.kind !== "idle" && shown.kind !== "loading" && JSON.stringify(shown.req) !== want;
  const catalystLabel = input.quality ? (catalog.catalysts.find((c) => c.id === input.quality?.catalyst)?.label ?? input.quality.catalyst) : null;
  return {
    ...io,
    poolLoad,
    pool,
    plans,
    picking,
    setPicking,
    issues,
    base,
    stale,
    problems: poolProblems(input.pools),
    art: baseArt(input.base),
    check: liveCheck(input.slots, base.caps, input.ilvl, pool, input.pools),
    qualityLine: input.quality ? `Quality: +${input.quality.pct}% (${catalystLabel})` : null,
    run: () => plans.run(reqs),
    applyAlternative: (alt: AlternativeView) => {
      const next = withAlternative(input, alt);
      io.setSlots(next.slots);
      plans.run(requestsFor(next));
    },
  };
}

export type BuilderState = ReturnType<typeof useBuilder>;
