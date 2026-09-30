"use client";

import { useMemo, useState } from "react";
import { TriangleAlert } from "lucide-react";
import type { MarketUniqueItem, MarketUniquesResponse } from "../../../lib/marketUniquesContract";
import { DataTable } from "../../ui/DataTable";
import { EmptyState } from "../../ui/EmptyState";
import { ItemArt } from "../../ui/ItemArt";
import { FilterChip, SkeletonRows } from "./pricesBits";
import { uniquesColumns } from "./uniquesColumns";
import {
  DEFAULT_UNIQUE_SORT,
  emptyUniquesSentence,
  MIN_VALUE_DIV,
  nextUniqueSort,
  UNIQUE_SORT_KEYS,
  visibleUniques,
  type UniqueFilter,
  type UniqueSort,
  type UniqueSortKey,
} from "./uniquesView";

interface UniquesPaneProps {
  data: MarketUniquesResponse | null;
  error: string | null;
  /** scout category id on screen; ignored while searching. */
  categoryId: string;
  query: string;
  valuableOnly: boolean;
  onValuableOnly: (on: boolean) => void;
}

function isSortKey(key: string): key is UniqueSortKey {
  return (UNIQUE_SORT_KEYS as readonly string[]).includes(key);
}

/** scout covers the default league only: say so to anyone pinned elsewhere instead of implying their market. */
function LeagueNote({ data }: { data: MarketUniquesResponse }) {
  if (data.league.toLowerCase() === data.viewerLeague.toLowerCase()) return null;
  return (
    <p className="text-xs text-amber-200" title="poe2scout and the trade fallback are read for the app's default league only">
      Unique prices are from {data.league}, not your pinned {data.viewerLeague}.
    </p>
  );
}

function Warnings({ warnings }: { warnings: readonly string[] }) {
  if (warnings.length === 0) return null;
  return (
    <ul role="status" className="grid gap-0.5 text-xs text-amber-300">
      {warnings.map((w) => (
        <li key={w} className="flex items-start gap-1.5">
          <TriangleAlert aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {w}
        </li>
      ))}
    </ul>
  );
}

interface TableProps {
  data: MarketUniquesResponse;
  rows: MarketUniqueItem[];
  filter: UniqueFilter;
  sort: UniqueSort;
  onSort: (key: string) => void;
}

function UniquesTable({ data, rows, filter, sort, onSort }: TableProps) {
  const searching = filter.query.trim() !== "";
  const labels = new Map(data.categories.map((c) => [c.id, c.label]));
  const icon = data.categories.find((c) => c.id === filter.category)?.icon ?? null;
  const columns = uniquesColumns({ league: data.league, exPerDiv: data.exPerDiv, categoryLabel: searching ? (id) => labels.get(id) ?? id : null });
  return (
    <div className="min-w-0 max-md:overflow-x-auto max-md:[&_th]:static">
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        interactiveCells
        tall
        sort={{ key: sort.key, dir: sort.dir, onSort }}
        emptyState={<EmptyState icon={<ItemArt src={searching ? null : icon} size={6} />} sentence={emptyUniquesSentence(data.items, filter)} />}
      />
    </div>
  );
}

/** The UNIQUES group's body: value filter, league note, scout warnings and the table. */
export function UniquesPane({ data, error, categoryId, query, valuableOnly, onValuableOnly }: UniquesPaneProps) {
  const [sort, setSort] = useState<UniqueSort>(DEFAULT_UNIQUE_SORT);
  const filter = useMemo<UniqueFilter>(() => ({ category: categoryId, query, valuableOnly }), [categoryId, query, valuableOnly]);
  const rows = useMemo(() => (data ? visibleUniques(data.items, filter, sort) : null), [data, filter, sort]);
  const onSort = (key: string): void => {
    if (!isSortKey(key)) throw new Error(`uniques: column ${key} is not sortable`);
    setSort((s) => nextUniqueSort(s, key));
  };
  return (
    <div className="grid min-w-0 content-start gap-3">
      <div role="group" aria-label="Filters" className="flex flex-wrap items-center gap-1.5">
        <FilterChip on={valuableOnly} onClick={() => onValuableOnly(!valuableOnly)} title={`Hide uniques worth less than ${MIN_VALUE_DIV} Divine, or with no price`}>
          ≥ {MIN_VALUE_DIV} Div
        </FilterChip>
        {rows && <span className="ml-auto text-xs tabular-nums text-neutral-400">{rows.length} unique{rows.length === 1 ? "" : "s"}</span>}
      </div>
      {data && <LeagueNote data={data} />}
      {data && <Warnings warnings={data.warnings} />}
      {error && <EmptyState icon={<TriangleAlert className="h-5 w-5 text-amber-300" />} sentence={`Could not load unique prices: ${error}`} />}
      {data && rows ? <UniquesTable data={data} rows={rows} filter={filter} sort={sort} onSort={onSort} /> : !error && <SkeletonRows label="Loading unique prices" />}
    </div>
  );
}
