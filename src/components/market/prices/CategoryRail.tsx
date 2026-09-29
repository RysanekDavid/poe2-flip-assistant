"use client";

import { useEffect, useRef, type RefObject } from "react";
import { Search } from "lucide-react";
import type { MarketPriceCategory } from "../../../lib/marketPricesContract";
import { ItemArt } from "../../ui/ItemArt";

interface CategoryRailProps {
  categories: readonly MarketPriceCategory[];
  /** Category type on screen; ignored while a search is active. */
  active: string;
  query: string;
  /** Rows per category type under the active chips (Movers/Liquid), matching what a click shows. */
  counts: ReadonlyMap<string, number>;
  /** Matches across every category under the same chips, shown as the "All" row while searching. */
  matches: number;
  onSelect: (category: MarketPriceCategory) => void;
  onQuery: (query: string) => void;
}

const ROW =
  "flex shrink-0 items-center gap-2 rounded-md border-l-2 px-2 py-1.5 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60 lg:w-full";
const ROW_ACTIVE = "border-amber-400 bg-neutral-800/70 text-neutral-100";
const ROW_IDLE = "border-transparent text-neutral-400 hover:bg-neutral-800/40 hover:text-neutral-200";

/** `/` focuses the search from anywhere on the page, as on poe.ninja; typing in a field keeps its slash. */
function useSlashFocus(target: RefObject<HTMLInputElement | null>) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target;
      if (el instanceof HTMLElement && (el.isContentEditable || el.closest("input, textarea, select"))) return;
      e.preventDefault();
      target.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [target]);
}

function SearchBox({ query, onQuery }: Pick<CategoryRailProps, "query" | "onQuery">) {
  const input = useRef<HTMLInputElement>(null);
  useSlashFocus(input);
  return (
    <label className="relative block">
      <span className="sr-only">Search all items</span>
      <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
      <input
        ref={input}
        type="search"
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        placeholder="Search all items…"
        title="Press / to search"
        className="h-9 w-full rounded-md border border-line bg-neutral-950 pl-8 pr-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-amber-400/60 focus:outline-none"
      />
    </label>
  );
}

/**
 * poe.ninja's left rail in our tokens: category art, label, count, a 2px amber bar on the active
 * row (the sub-tab underline's language). Below lg it becomes a horizontal strip over the table.
 */
export function CategoryRail({ categories, active, query, counts, matches, onSelect, onQuery }: CategoryRailProps) {
  const searching = query.trim() !== "";
  return (
    <nav aria-label="Item categories" className="grid min-w-0 content-start gap-2 lg:sticky lg:top-[calc(var(--shell-h,0px)+1rem)]">
      <SearchBox query={query} onQuery={onQuery} />
      <p className="hidden px-2 pt-1 text-xs font-semibold uppercase tracking-wide text-neutral-500 lg:block">Exchange</p>
      <ul className="flex gap-1 overflow-x-auto pb-1 lg:grid lg:gap-0.5 lg:overflow-visible lg:pb-0">
        {searching && (
          <li className="shrink-0">
            <span aria-current="true" className={`${ROW} ${ROW_ACTIVE}`}>
              <Search aria-hidden className="h-5 w-5 text-neutral-400" />
              <span className="flex-1">All</span>
              <span className="text-xs tabular-nums text-neutral-400">{matches} matches</span>
            </span>
          </li>
        )}
        {categories.map((c) => {
          const current = !searching && c.type === active;
          return (
            <li key={c.type} className="shrink-0">
              <button type="button" onClick={() => onSelect(c)} aria-current={current ? "true" : undefined} className={`${ROW} ${current ? ROW_ACTIVE : ROW_IDLE}`}>
                <ItemArt src={c.icon} size={6} />
                <span className="flex-1 whitespace-nowrap">{c.label}</span>
                <span className="text-xs tabular-nums text-neutral-500">{counts.get(c.type) ?? 0}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
