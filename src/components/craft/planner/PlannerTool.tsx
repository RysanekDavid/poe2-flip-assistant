"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Hammer } from "lucide-react";
import type { FeasibilityIssueView, PlannerCatalog, PlannerPool } from "../../../lib/tools/craftPlannerContract";
import { useIsPhone } from "../../../lib/useIsPhone";
import { TAB_ICONS } from "../../shell/tabIcons";
import { Button } from "../../ui/Button";
import { PageHeader } from "../../ui/PageHeader";
import { BaseChooser, baseArt } from "./BaseChooser";
import { FeasibilityLine } from "./FeasibilityLine";
import { ItemTooltip } from "./ItemTooltip";
import { ModPicker } from "./ModPicker";
import { usePlan, usePool, useCatalog, type PlanState } from "./plannerClient";
import { familyKey, liveCheck, picks, targetIndex, toRequest, type CatalogBase, type PlannerInput, type Side } from "./plannerModel";
import { PlannerOptions } from "./PlannerOptions";
import { PlanResult } from "./PlanResult";
import { TooltipSkeleton } from "./PlanTimeline";
import { PLANNER_EXAMPLES, usePlannerInput, usePrunePicks } from "./usePlannerInput";

/**
 * Craft › Planner: build the item you want as an in-game tooltip (base, item level, a mod per
 * slot), press Plan it, get the bench — every step with its odds and cost — and run it.
 */

const LEGEND =
  "Odds that depend on which mod a random add rolls are estimates (PoE2 publishes no mod weights): amber, with a band and the formula. " +
  "Removals, side omens and essence writes are counted exactly. Costs use live exchange prices; the base is not included. Spends no trade searches.";

const GRID = "grid gap-4 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]";

type Slot = { side: Side; slot: number };

function Header({ examples }: { examples?: Parameters<typeof PageHeader>[0]["examples"] }) {
  return (
    <PageHeader
      title="Craft"
      purpose="Build the item you want — the planner lays out every step, its odds and what it costs."
      legend={LEGEND}
      art={TAB_ICONS.craft.src}
      examples={examples}
    />
  );
}

/** Server reasons for the CURRENT input only: a stale answer must not mark today's slots. */
function useIssues(state: PlanState, input: PlannerInput, current: string) {
  return useMemo(() => {
    const fresh = state.kind !== "idle" && state.kind !== "loading" && JSON.stringify(state.req) === current;
    const all: FeasibilityIssueView[] = !fresh ? [] : state.kind === "rejected" ? state.data.feasibility : state.kind === "plan" ? state.data.feasibility : [];
    const forSlot = (side: Side, slot: number) => {
      const idx = targetIndex(input.slots, side, slot);
      return idx == null ? [] : all.filter((i) => i.target === idx);
    };
    return { general: all.filter((i) => i.target == null), forSlot };
  }, [state, input.slots, current]);
}

/** The input item's state plus everything derived from it (pool, live check, plan, slot reasons). */
function useBuilder(catalog: PlannerCatalog) {
  const io = usePlannerInput(catalog);
  const { input } = io;
  const poolLoad = usePool(input.itemClass, input.base);
  const pool: PlannerPool | null = poolLoad?.kind === "done" ? poolLoad.data : null;
  usePrunePicks(input, pool, io.setSlot);
  const plan = usePlan();
  const [picking, setPicking] = useState<Slot | null>(null);
  const request = useMemo(() => toRequest(input), [input]);
  const current = JSON.stringify(request);
  const issues = useIssues(plan.state, input, current);
  const base = catalog.classes.find((c) => c.itemClass === input.itemClass)?.bases.find((b) => b.name === input.base);
  if (!base) throw new Error(`planner: ${input.base} vanished from the catalog`);
  const stale = plan.state.kind !== "idle" && plan.state.kind !== "loading" && JSON.stringify(plan.state.req) !== current;
  const catalystLabel = input.quality ? (catalog.catalysts.find((c) => c.id === input.quality?.catalyst)?.label ?? input.quality.catalyst) : null;
  return {
    ...io,
    poolLoad,
    pool,
    plan,
    picking,
    setPicking,
    issues,
    base,
    stale,
    art: baseArt(input.itemClass, input.base),
    check: liveCheck(input.slots, base.caps, input.ilvl, pool),
    qualityLine: input.quality ? `Quality: +${input.quality.pct}% (${catalystLabel})` : null,
    run: () => plan.run(request),
  };
}

type BuilderState = ReturnType<typeof useBuilder>;

interface ChooserProps {
  catalog: PlannerCatalog;
  input: PlannerInput;
  base: CatalogBase;
  onPick: (c: PlannerInput["itemClass"], b: string) => void;
  onOptions: Parameters<typeof PlannerOptions>[0]["onChange"];
}

/** Base grid + options. On a phone the grid folds behind the chosen base until "change base". */
function ChooserPanel({ catalog, input, base, onPick, onOptions }: ChooserProps) {
  const phone = useIsPhone();
  const [open, setOpen] = useState(false);
  const art = baseArt(input.itemClass, input.base);
  return (
    <section aria-label="choose a base" className="space-y-3 rounded-lg border border-line bg-surface/60 p-3 md:p-4">
      {phone && (
        <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 text-left text-sm text-neutral-200">
          {art && <img src={art} alt="" className="h-8 w-8 object-contain" />}
          <span className="flex-1">
            {input.base} <span className="text-neutral-400">· {input.itemClass}</span>
          </span>
          <span className="text-xs text-neutral-400">change base</span>
          <ChevronDown aria-hidden className={`h-4 w-4 text-neutral-400 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      )}
      {(!phone || open) && (
        <BaseChooser
          catalog={catalog}
          itemClass={input.itemClass}
          base={input.base}
          onPick={(c, b) => {
            onPick(c, b);
            setOpen(false);
          }}
        />
      )}
      <PlannerOptions catalog={catalog} base={base} input={input} onChange={onOptions} />
    </section>
  );
}

function YourItem({ b }: { b: BuilderState }) {
  const empty = b.check.p.used + b.check.s.used === 0;
  const loading = b.plan.state.kind === "loading";
  return (
    <section aria-label="your item" className="space-y-3 lg:order-1">
      {b.poolLoad?.kind === "error" && <p role="alert" className="text-sm text-red-300">This base&apos;s mods failed to load: {b.poolLoad.error}</p>}
      <ItemTooltip
        base={b.base}
        art={b.art}
        ilvl={b.input.ilvl}
        onIlvl={b.setIlvl}
        slots={b.input.slots}
        pool={b.pool}
        qualityLine={b.qualityLine}
        issuesFor={b.issues.forSlot}
        onOpen={(side, slot) => b.setPicking({ side, slot })}
        onClear={(side, slot) => b.setSlot(side, slot, null)}
      />
      <FeasibilityLine check={b.check} issues={b.issues.general} onIlvl={b.setIlvl} />
      <Button variant="primary" className="w-full" disabled={empty || loading} title={empty ? "choose at least one mod" : undefined} onClick={b.run}>
        <Hammer aria-hidden className="h-4 w-4" /> {loading ? "Planning…" : "Plan it"}
      </Button>
    </section>
  );
}

function Picker({ b }: { b: BuilderState }) {
  const { picking, pool, input } = b;
  if (!picking || !pool) return null;
  const here = input.slots[picking.side][picking.slot] ?? null;
  const taken = new Set(picks(input.slots).filter((p) => p !== here).map(familyKey));
  return (
    <ModPicker
      side={picking.side}
      pool={pool}
      ilvl={input.ilvl}
      current={here}
      taken={taken}
      onPick={(p) => {
        b.setSlot(picking.side, picking.slot, p);
        b.setPicking(null);
      }}
      onClose={() => b.setPicking(null)}
    />
  );
}

function Builder({ catalog }: { catalog: PlannerCatalog }) {
  const b = useBuilder(catalog);
  return (
    <>
      <Header examples={PLANNER_EXAMPLES.map((ex) => ({ label: ex.label, title: ex.title, onClick: () => b.applyExample(ex) }))} />
      <div className={GRID}>
        <div className="space-y-3 lg:order-2">
          <ChooserPanel catalog={catalog} input={b.input} base={b.base} onPick={b.pickBase} onOptions={b.setOptions} />
        </div>
        <YourItem b={b} />
      </div>
      <PlanResult state={b.plan.state} stale={b.stale} baseArt={b.art} onReplan={b.run} />
      <Picker b={b} />
    </>
  );
}

export function PlannerTool() {
  const catalog = useCatalog();
  if (catalog.kind === "error") {
    return (
      <>
        <Header />
        <p role="alert" className="rounded-lg border border-red-500/40 bg-red-950/20 p-4 text-sm text-red-200">
          The planner&apos;s catalog failed to load: {catalog.error}
        </p>
      </>
    );
  }
  if (catalog.kind === "loading") {
    return (
      <>
        <Header />
        <div className={GRID} role="status" aria-label="loading the planner">
          <TooltipSkeleton />
          <div aria-hidden className="h-64 animate-pulse rounded-lg border border-line bg-surface/40" />
        </div>
      </>
    );
  }
  return <Builder catalog={catalog.data} />;
}
