"use client";

import { useMemo, useState } from "react";
import type { MarketPriceCategory, MarketPriceItem, MarketPricesResponse } from "../../../lib/marketPricesContract";
import { DataTable } from "../../ui/DataTable";
import { EmptyState } from "../../ui/EmptyState";
import { ItemArt } from "../../ui/ItemArt";
import { PriceDetail } from "./PriceDetail";
import { FilterChip } from "./pricesBits";
import { PRICES_DETAIL_PREFIX, pricesColumns } from "./pricesColumns";
import { DEFAULT_PRICE_SORT, LIQUID_PER_HOUR, MOVER_PCT, nextSort, PRICE_SORT_KEYS, visibleItems, type PriceSort, type PriceSortKey } from "./pricesView";
import { useWatched } from "./usePrices";

interface TableProps {
  data: MarketPricesResponse;
  rows: MarketPriceItem[];
  /** undefined while a search spans every category. */
  category: MarketPriceCategory | undefined;
  sort: PriceSort;
  onSort: (key: string) => void;
}

function PricesTable({ data, rows, category, sort, onSort }: TableProps) {
  const [expanded, setExpanded] = useState<string | undefined>(undefined);
  const { watched, toggle, error } = useWatched();
  const exPerDiv = data.rates?.exPerDiv ?? null;
  const onToggle = (item: MarketPriceItem): void => setExpanded((open) => (open === item.itemId ? undefined : item.itemId));
  const labels = new Map(data.categories.map((c) => [c.type, c.label]));
  const categoryLabel = category === undefined ? (type: string) => labels.get(type) ?? type : null;
  const columns = pricesColumns({ league: data.league, exPerDiv, cxHour: data.cxHour, watched, expandedKey: expanded, onToggle, onWatch: toggle, categoryLabel });
  const empty = (
    <EmptyState icon={<ItemArt src={category?.icon ?? null} size={6} />} sentence="No priced items yet — they appear after the next market poll." />
  );
  return (
    <>
      {error && <p role="alert" className="text-sm text-amber-300">Watchlist: {error}</p>}
      <div className="min-w-0 max-md:overflow-x-auto max-md:[&_th]:static">
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.itemId}
          onRowClick={onToggle}
          interactiveCells
          tall
          sort={{ key: sort.key, dir: sort.dir, onSort }}
          expandedKey={expanded}
          renderExpanded={(r) => <PriceDetail item={r} exPerDiv={exPerDiv} />}
          detailIdPrefix={PRICES_DETAIL_PREFIX}
          emptyState={empty}
        />
      </div>
    </>
  );
}

function isSortKey(key: string): key is PriceSortKey {
  return (PRICE_SORT_KEYS as readonly string[]).includes(key);
}

interface ExchangePaneProps {
  data: MarketPricesResponse;
  category: MarketPriceCategory | undefined;
  query: string;
  movers: boolean;
  liquid: boolean;
  onMovers: (on: boolean) => void;
  onLiquid: (on: boolean) => void;
}

/** The EXCHANGE group's body: Movers/Liquid chips and the sortable table with its inline chart. */
export function ExchangePane({ data, category, query, movers, liquid, onMovers, onLiquid }: ExchangePaneProps) {
  const [sort, setSort] = useState<PriceSort>(DEFAULT_PRICE_SORT);
  const rows = useMemo(
    () => visibleItems(data.items, { category: category?.type ?? "", query, movers, liquid }, sort),
    [data.items, category, query, movers, liquid, sort],
  );
  const onSort = (key: string): void => {
    if (!isSortKey(key)) throw new Error(`prices: column ${key} is not sortable`);
    setSort((s) => nextSort(s, key));
  };
  return (
    <div className="grid min-w-0 content-start gap-3">
      <div role="group" aria-label="Filters" className="flex flex-wrap items-center gap-1.5">
        <FilterChip on={movers} onClick={() => onMovers(!movers)} title={`7-day change of at least ±${MOVER_PCT}%`}>
          Movers
        </FilterChip>
        <FilterChip on={liquid} onClick={() => onLiquid(!liquid)} title={`At least ${LIQUID_PER_HOUR} units traded per hour`}>
          Liquid
        </FilterChip>
        <span className="ml-auto text-xs tabular-nums text-neutral-400">{rows.length} items</span>
      </div>
      <PricesTable data={data} rows={rows} category={query.trim() === "" ? category : undefined} sort={sort} onSort={onSort} />
    </div>
  );
}
