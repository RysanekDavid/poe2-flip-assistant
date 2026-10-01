"use client";

import { useId, type ReactNode } from "react";
import { BUDGET_SCALE } from "../../../core/strategies/ratings";
import { BUDGET_TIERS, type BudgetTier, type Mechanic } from "../../../core/strategies/schema";
import type { MechanicTrend } from "../../../lib/strategiesContract";
import { ItemArt } from "../../ui/ItemArt";
import { BUDGET_LABEL, MECHANIC_LABEL, type StrategyFilter } from "./strategiesView";
import { fmtChange, SORT_HINT, SORT_LABEL, STRATEGY_SORTS, TONE_TEXT, trendTip, trendTone, type StrategySort } from "./strategyCards";

const ON = "border-amber-400/60 bg-amber-400/15 text-amber-100";
const OFF = "border-line bg-neutral-900/60 text-neutral-300 hover:border-neutral-500 hover:text-neutral-100";

function Chip({ on, onClick, children, title }: { on: boolean; onClick: () => void; children: ReactNode; title?: string }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} title={title} className={`h-7 rounded-md border px-2.5 text-xs font-medium transition-colors ${on ? ON : OFF}`}>
      {children}
    </button>
  );
}


/** A mechanic as art + name + how its drops' prices moved this week; a click filters the cards. */
function MechanicChip({ row, art, on, onClick }: { row: MechanicTrend; art: string | null; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      title={`${MECHANIC_LABEL[row.mechanic]}: ${trendTip(row.trend)}`}
      className={`flex h-10 shrink-0 items-center gap-2 rounded-md border px-2.5 transition-colors ${on ? ON : OFF}`}
    >
      <ItemArt src={art} size={6} />
      <span className="text-sm font-medium">{MECHANIC_LABEL[row.mechanic]}</span>
      {row.trend && <span className={`text-sm font-semibold tabular-nums ${TONE_TEXT[trendTone(row.trend)]}`}>{fmtChange(row.trend.change7d)}</span>}
    </button>
  );
}

function toggle(set: ReadonlySet<Mechanic>, m: Mechanic): Set<Mechanic> {
  const next = new Set(set);
  if (next.has(m)) next.delete(m);
  else next.add(m);
  return next;
}

interface Props {
  mechanics: readonly MechanicTrend[];
  artOf: (m: Mechanic) => string | null;
  yieldNames: readonly string[];
  filter: StrategyFilter;
  onChange: (next: StrategyFilter) => void;
  sort: StrategySort;
  onSort: (sort: StrategySort) => void;
}

function BudgetAndSort({ filter, onChange, sort, onSort }: Pick<Props, "filter" | "onChange" | "sort" | "onSort">) {
  const setBudget = (budget: BudgetTier | null): void => onChange({ ...filter, budget });
  return (
    <>
      <div role="group" aria-label="Budget" className="flex flex-wrap gap-1">
        <Chip on={filter.budget === null} onClick={() => setBudget(null)} title="Every budget">
          Any budget
        </Chip>
        {BUDGET_TIERS.map((tier) => (
          <Chip key={tier} on={filter.budget === tier} onClick={() => setBudget(tier)} title={`Up to ${BUDGET_LABEL[tier].toLowerCase()}: ${BUDGET_SCALE[tier]}`}>
            ≤ {BUDGET_LABEL[tier]}
          </Chip>
        ))}
      </div>
      <div role="group" aria-label="Sort" className="flex flex-wrap gap-1">
        {STRATEGY_SORTS.map((s) => (
          <Chip key={s} on={sort === s} onClick={() => onSort(s)} title={SORT_HINT[s]}>
            {SORT_LABEL[s]}
          </Chip>
        ))}
      </div>
    </>
  );
}

/** The mechanic heat strip doubles as the filter; then budget, order and a drop search. Every change is instant. */
export function StrategyFilters({ mechanics, artOf, yieldNames, filter, onChange, sort, onSort }: Props) {
  const listId = useId();
  return (
    <section data-tour="farm" aria-label="Filter strategies" className="grid gap-2">
      {/* one swipeable row on a phone (eleven chips would fill the screen), wrapped from md up */}
      <div role="group" aria-label="Mechanics, with the 7-day price move of their drops" className="relative flex gap-1.5 max-md:overflow-x-auto max-md:pb-1 md:flex-wrap">
        {mechanics.map((row) => (
          <MechanicChip
            key={row.mechanic}
            row={row}
            art={artOf(row.mechanic)}
            on={filter.mechanics.has(row.mechanic)}
            onClick={() => onChange({ ...filter, mechanics: toggle(filter.mechanics, row.mechanic) })}
          />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <BudgetAndSort filter={filter} onChange={onChange} sort={sort} onSort={onSort} />
        <label className="flex min-w-0 items-center gap-2 text-xs text-neutral-400">
          Drops
          <input
            type="search"
            list={listId}
            value={filter.yieldQuery}
            onChange={(e) => onChange({ ...filter, yieldQuery: e.target.value })}
            placeholder="e.g. Fracturing Orb"
            className="h-7 w-44 min-w-0 rounded-md border border-neutral-700 bg-neutral-900 px-2 text-sm text-neutral-100 placeholder:text-neutral-500"
          />
          <datalist id={listId}>
            {yieldNames.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </label>
      </div>
    </section>
  );
}
