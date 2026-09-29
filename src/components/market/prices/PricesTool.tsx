"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { TriangleAlert } from "lucide-react";
import { categoryBySlug, DEFAULT_CATEGORY_SLUG } from "../../../lib/economyCategories";
import type { MarketPriceCategory, MarketPriceItem, MarketPricesResponse } from "../../../lib/marketPricesContract";
import { timestampAgeMs } from "../../../lib/sqliteTime";
import { DataTable } from "../../ui/DataTable";
import { EmptyState } from "../../ui/EmptyState";
import { ItemArt } from "../../ui/ItemArt";
import { PageHeader } from "../../ui/PageHeader";
import { StaleBadge } from "../../ui/StaleBadge";
import { CategoryRail } from "./CategoryRail";
import { PriceDetail } from "./PriceDetail";
import { PRICES_DETAIL_PREFIX, pricesColumns } from "./pricesColumns";
import { DEFAULT_PRICE_SORT, LIQUID_PER_HOUR, MOVER_PCT, nextSort, PRICE_SORT_KEYS, railCounts, visibleItems, type PriceSort, type PriceSortKey } from "./pricesView";
import { useMarketPrices, useWatched } from "./usePrices";

const LEGEND =
  "Values are poe.ninja's exchange price of one item, in Divine with Exalted under it. Volume is units per hour on the Currency " +
  "Exchange (GGG's hourly digest, 6h mean); ~ marks an estimate from poe.ninja volume where the exchange has no data. Uniques " +
  "and other trade-site items are not listed yet.";

/** ?cat= and ?q= mirror the view so it deep-links; an unknown category warns and is rewritten. */
function usePricesParams() {
  const params = useSearchParams();
  const rawCat = params.get("cat");
  const [slug, setSlug] = useState(() => (rawCat !== null && categoryBySlug(rawCat) ? rawCat : DEFAULT_CATEGORY_SLUG));
  const [query, setQuery] = useState(() => params.get("q") ?? "");
  const write = useCallback((cat: string, q: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set("cat", cat);
    if (q.trim() === "") url.searchParams.delete("q");
    else url.searchParams.set("q", q);
    window.history.replaceState(window.history.state, "", url);
  }, []);
  useEffect(() => {
    if (rawCat === null || categoryBySlug(rawCat)) return;
    console.warn(`[market] unknown price category cat=${rawCat} — showing ${DEFAULT_CATEGORY_SLUG}`);
    write(DEFAULT_CATEGORY_SLUG, params.get("q") ?? "");
  }, [rawCat, params, write]);
  const selectCategory = (next: string): void => {
    setSlug(next);
    setQuery("");
    write(next, "");
  };
  const search = (q: string): void => {
    setQuery(q);
    write(slug, q);
  };
  return { slug, query, selectCategory, search };
}

function Chip({ on, onClick, title, children }: { on: boolean; onClick: () => void; title: string; children: ReactNode }) {
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

function SkeletonRows() {
  return (
    <div role="status" aria-label="Loading prices" className="grid gap-1">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="h-11 animate-pulse rounded bg-neutral-800/60" />
      ))}
    </div>
  );
}

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

function Body({ data }: { data: MarketPricesResponse }) {
  const { slug, query, selectCategory, search } = usePricesParams();
  const [sort, setSort] = useState<PriceSort>(DEFAULT_PRICE_SORT);
  const [movers, setMovers] = useState(false);
  const [liquid, setLiquid] = useState(false);
  const category = data.categories.find((c) => c.slug === slug);
  const rows = useMemo(
    () => visibleItems(data.items, { category: category?.type ?? "", query, movers, liquid }, sort),
    [data.items, category, query, movers, liquid, sort],
  );
  const counts = useMemo(() => railCounts(data.items, { query, movers, liquid }), [data.items, query, movers, liquid]);
  const onSort = (key: string): void => {
    if (!isSortKey(key)) throw new Error(`prices: column ${key} is not sortable`);
    setSort((s) => nextSort(s, key));
  };
  return (
    <div className="grid gap-4 lg:grid-cols-[14rem_minmax(0,1fr)]">
      <CategoryRail categories={data.categories} active={category?.type ?? ""} query={query} counts={counts.byCategory} matches={counts.matches} onSelect={(c) => selectCategory(c.slug)} onQuery={search} />
      <div className="grid min-w-0 content-start gap-3">
        <div role="group" aria-label="Filters" className="flex flex-wrap items-center gap-1.5">
          <Chip on={movers} onClick={() => setMovers((v) => !v)} title={`7-day change of at least ±${MOVER_PCT}%`}>
            Movers
          </Chip>
          <Chip on={liquid} onClick={() => setLiquid((v) => !v)} title={`At least ${LIQUID_PER_HOUR} units traded per hour`}>
            Liquid
          </Chip>
          <span className="ml-auto text-xs tabular-nums text-neutral-400">{rows.length} items</span>
        </div>
        <PricesTable data={data} rows={rows} category={query.trim() === "" ? category : undefined} sort={sort} onSort={onSort} />
      </div>
    </div>
  );
}

/** Market › Prices: every exchange item, poe.ninja-style — category rail, sortable table, inline chart. */
export function PricesTool() {
  const { data, error } = useMarketPrices();
  const ageMin = data?.fetchedAt ? timestampAgeMs(data.fetchedAt) / 60_000 : null;
  return (
    <section className="grid gap-4">
      <PageHeader
        title="Prices"
        purpose={`Every exchange item${data ? ` in ${data.league}` : ""}: price, 7-day trend and how much trades per hour.`}
        legend={LEGEND}
        action={data && <StaleBadge ageMin={ageMin} warnAfterMin={180} />}
      />
      {error && <EmptyState icon={<TriangleAlert className="h-5 w-5 text-amber-300" />} sentence={`Could not load prices: ${error}`} />}
      {data ? <Body data={data} /> : !error && <SkeletonRows />}
    </section>
  );
}
