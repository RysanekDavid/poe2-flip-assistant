"use client";

import { useId, type ReactNode } from "react";
import { BUDGET_TIERS, type BudgetTier, type Mechanic } from "../../../core/strategies/schema";
import { BUDGET_LABEL, MECHANIC_LABEL, type StrategyFilter } from "./strategiesView";

function Chip({ on, onClick, children, title }: { on: boolean; onClick: () => void; children: ReactNode; title?: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      title={title}
      className={`h-7 rounded-md border px-2.5 text-xs font-medium transition-colors ${
        on ? "border-amber-400/60 bg-amber-400/15 text-amber-100" : "border-neutral-700 bg-neutral-900/60 text-neutral-400 hover:text-neutral-100"
      }`}
    >
      {children}
    </button>
  );
}

interface Props {
  mechanics: readonly Mechanic[];
  yieldNames: readonly string[];
  filter: StrategyFilter;
  onChange: (next: StrategyFilter) => void;
}

function toggle(set: ReadonlySet<Mechanic>, m: Mechanic): Set<Mechanic> {
  const next = new Set(set);
  if (next.has(m)) next.delete(m);
  else next.add(m);
  return next;
}

/** Mechanic chips (any of), a budget ceiling and a yield typeahead; every change is instant. */
export function StrategyFilters({ mechanics, yieldNames, filter, onChange }: Props) {
  const listId = useId();
  const setBudget = (budget: BudgetTier | null): void => onChange({ ...filter, budget });
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div role="group" aria-label="Mechanics" className="flex flex-wrap gap-1.5">
        {mechanics.map((m) => (
          <Chip key={m} on={filter.mechanics.has(m)} onClick={() => onChange({ ...filter, mechanics: toggle(filter.mechanics, m) })}>
            {MECHANIC_LABEL[m]}
          </Chip>
        ))}
      </div>
      <div role="group" aria-label="Budget" className="flex flex-wrap gap-1">
        <Chip on={filter.budget === null} onClick={() => setBudget(null)} title="Every budget tier">
          Any budget
        </Chip>
        {BUDGET_TIERS.map((tier) => (
          <Chip key={tier} on={filter.budget === tier} onClick={() => setBudget(tier)} title={`Strategies you can run with a ${BUDGET_LABEL[tier].toLowerCase()} budget or less`}>
            ≤ {BUDGET_LABEL[tier]}
          </Chip>
        ))}
      </div>
      <label className="flex items-center gap-2 text-xs text-neutral-400">
        Yields
        <input
          type="search"
          list={listId}
          value={filter.yieldQuery}
          onChange={(e) => onChange({ ...filter, yieldQuery: e.target.value })}
          placeholder="e.g. Fracturing Orb"
          className="h-7 w-48 rounded-md border border-neutral-700 bg-neutral-900 px-2 text-sm text-neutral-100 placeholder:text-neutral-500"
        />
        <datalist id={listId}>
          {yieldNames.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      </label>
    </div>
  );
}
