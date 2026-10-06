"use client";

import { useState } from "react";
import { ChevronDown, Hammer } from "lucide-react";
import type { PlannerCatalog } from "../../../lib/tools/craftPlannerContract";
import { useIsPhone } from "../../../lib/useIsPhone";
import { TAB_ICONS } from "../../shell/tabIcons";
import { Button } from "../../ui/Button";
import { PageHeader } from "../../ui/PageHeader";
import { BaseChooser, baseArt } from "./BaseChooser";
import { FeasibilityLine } from "./FeasibilityLine";
import { ItemTooltip } from "./ItemTooltip";
import { ModPicker } from "./ModPicker";
import { useCatalog } from "./plannerClient";
import { familyKey, picks, type PlannerInput, type StartInput } from "./plannerModel";
import { PlannerOptions } from "./PlannerOptions";
import { PlanResult } from "./PlanResult";
import { TooltipSkeleton } from "./PlanTimeline";
import { StartCompare } from "./StartCompare";
import { useBuilder, type BuilderState } from "./useBuilder";
import { PLANNER_EXAMPLES } from "./usePlannerInput";

/**
 * Craft › Planner: build the item you want as an in-game tooltip (base, item level, a mod per
 * slot or a pool of mods per side), choose where to start (compare a clean and a bought base by
 * default), press Plan it, get the bench — every step with its odds and cost — and run it.
 */

const LEGEND =
  "Odds that depend on which mod a random add rolls are estimates (PoE2 publishes no mod weights): amber, with a band and the formula. " +
  "Removals, side omens and essence writes are counted exactly. Costs use live exchange prices; a base you buy is added at the price you enter. Spends no trade searches.";

const GRID = "grid gap-4 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]";

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

interface ChooserProps {
  catalog: PlannerCatalog;
  b: BuilderState;
  onPick: (c: PlannerInput["itemClass"], base: string) => void;
}

/** Base grid + options. On a phone the grid folds behind the chosen base until "change base". */
function ChooserPanel({ catalog, b, onPick }: ChooserProps) {
  const phone = useIsPhone();
  const [open, setOpen] = useState(false);
  const { input } = b;
  const art = baseArt(input.base);
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
          onPick={(c, base) => {
            onPick(c, base);
            setOpen(false);
          }}
        />
      )}
      <PlannerOptions catalog={catalog} base={b.base} input={input} onChange={b.setOptions} pool={b.pool} onStart={(patch: Partial<StartInput>) => b.setStart(patch)} />
    </section>
  );
}

function YourItem({ b }: { b: BuilderState }) {
  const empty = b.check.p.used + b.check.s.used === 0;
  const loading = b.plans.primary.kind === "loading" || b.plans.bought.kind === "loading";
  const blocked = empty ? "choose at least one mod" : (b.problems[0] ?? null);
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
        pools={b.input.pools}
        poolIssues={b.issues.forPool}
        onPoolMode={(side, on) => b.setPool(side, on ? "from-side" : null)}
        onPoolAdd={(side) => b.setPicking({ side, pool: true })}
        onPoolChange={(side, p) => b.setPool(side, p)}
      />
      <FeasibilityLine check={b.check} issues={b.issues.general} onIlvl={b.setIlvl} />
      {blocked && !empty && <p className="text-sm text-amber-200">{blocked}</p>}
      <Button variant="primary" className="w-full" disabled={blocked != null || loading} title={blocked ?? undefined} onClick={b.run}>
        <Hammer aria-hidden className="h-4 w-4" /> {loading ? "Planning…" : "Plan it"}
      </Button>
    </section>
  );
}

function Picker({ b }: { b: BuilderState }) {
  const { picking, pool, input } = b;
  if (!picking || !pool) return null;
  const side = picking.side;
  const sidePool = input.pools[side];
  const here = "pool" in picking ? null : (input.slots[side][picking.slot] ?? null);
  const taken = new Set([...picks(input.slots).filter((p) => p !== here), ...(input.pools.prefix?.candidates ?? []), ...(input.pools.suffix?.candidates ?? [])].map(familyKey));
  return (
    <ModPicker
      side={side}
      pool={pool}
      ilvl={input.ilvl}
      current={here}
      taken={taken}
      poolMode={"pool" in picking}
      onPick={(p) => {
        if ("pool" in picking && sidePool) b.setPool(side, { ...sidePool, candidates: [...sidePool.candidates, p] });
        else if (!("pool" in picking)) b.setSlot(side, picking.slot, p);
        b.setPicking(null);
      }}
      onClose={() => b.setPicking(null)}
    />
  );
}

function Results({ b }: { b: BuilderState }) {
  const ask = { value: b.input.start.askDiv, onChange: (v: number | null) => b.setStart({ askDiv: v }) };
  return (
    <div className="space-y-3">
      <StartCompare primary={b.plans.primary} bought={b.plans.bought} view={b.plans.view} onView={b.plans.setView} askDiv={ask.value} onAsk={ask.onChange} />
      <PlanResult state={b.plans.shown} stale={b.stale} baseArt={b.art} onReplan={b.run} onAlternative={b.applyAlternative} ask={ask} />
    </div>
  );
}

function Builder({ catalog }: { catalog: PlannerCatalog }) {
  const b = useBuilder(catalog);
  return (
    <>
      <Header examples={PLANNER_EXAMPLES.map((ex) => ({ label: ex.label, title: ex.title, onClick: () => b.applyExample(ex) }))} />
      <div className={GRID}>
        <div className="space-y-3 lg:order-2">
          <ChooserPanel catalog={catalog} b={b} onPick={b.pickBase} />
        </div>
        <YourItem b={b} />
      </div>
      <Results b={b} />
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

