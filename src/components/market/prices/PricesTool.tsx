"use client";

import { useMemo, useState } from "react";
import { TriangleAlert } from "lucide-react";
import type { MarketPricesResponse } from "../../../lib/marketPricesContract";
import type { MarketUniquesResponse } from "../../../lib/marketUniquesContract";
import { timestampAgeMs } from "../../../lib/sqliteTime";
import { UNIQUE_CATEGORIES } from "../../../lib/uniqueCategories";
import { EmptyState } from "../../ui/EmptyState";
import { PageHeader } from "../../ui/PageHeader";
import { StaleBadge } from "../../ui/StaleBadge";
import { CategoryRail, type RailGroup, type RailStatus } from "./CategoryRail";
import { ExchangePane } from "./ExchangePane";
import { SkeletonRows } from "./pricesBits";
import { railCounts } from "./pricesView";
import { UniquesPane } from "./UniquesPane";
import { uniqueRailCounts } from "./uniquesView";
import { useMarketPrices, useMarketUniques } from "./usePrices";
import { sectionOf, usePricesParams } from "./usePricesParams";

const LEGEND =
  "Exchange values are poe.ninja's price of one item, in Divine with Exalted under it. Volume is units per hour on the Currency " +
  "Exchange (GGG's hourly digest, 6h mean); ~ marks an estimate from poe.ninja volume where the exchange has no data. Unique " +
  "values are poe2scout's cheapest ask for the default league; \"trade listings\" marks a trade-site price where scout has none.";

interface Loaded<T> {
  data: T | null;
  error: string | null;
}

interface UniquesState extends Loaded<MarketUniquesResponse> {
  requested: boolean;
}

interface Filters {
  query: string;
  movers: boolean;
  liquid: boolean;
  valuableOnly: boolean;
}

function statusOf(data: unknown, error: string | null, requested: boolean): RailStatus {
  if (data !== null) return "ready";
  if (error !== null) return "error";
  return requested ? "loading" : "idle";
}

/** Both rail groups under the active filters. Each group loads on its own; its rows keep static labels meanwhile. */
function useRailGroups(exchange: Loaded<MarketPricesResponse>, uniques: UniquesState, f: Filters): RailGroup[] {
  const ex = useMemo(() => (exchange.data ? railCounts(exchange.data.items, f) : null), [exchange.data, f]);
  const un = useMemo(() => (uniques.data ? uniqueRailCounts(uniques.data.items, f) : null), [uniques.data, f]);
  const icons = new Map(uniques.data?.categories.map((c) => [c.id, c.icon]) ?? []);
  return [
    {
      section: "exchange",
      title: "Exchange",
      entries: (exchange.data?.categories ?? []).map((c) => ({ slug: c.slug, label: c.label, icon: c.icon, count: ex?.byCategory.get(c.type) ?? 0 })),
      matches: ex?.matches ?? null,
      status: statusOf(exchange.data, exchange.error, true),
      error: exchange.data ? null : exchange.error,
    },
    {
      section: "uniques",
      title: "Uniques",
      entries: UNIQUE_CATEGORIES.map((c) => ({ slug: c.slug, label: c.label, icon: icons.get(c.id) ?? null, count: un ? (un.byCategory.get(c.id) ?? 0) : null })),
      matches: un?.matches ?? null,
      status: statusOf(uniques.data, uniques.error, uniques.requested),
      error: uniques.data ? null : uniques.error,
    },
  ];
}

interface ExchangeSlotProps {
  exchange: Loaded<MarketPricesResponse>;
  slug: string;
  filters: Filters;
  setMovers: (on: boolean) => void;
  setLiquid: (on: boolean) => void;
}

function ExchangeSlot({ exchange, slug, filters, setMovers, setLiquid }: ExchangeSlotProps) {
  const { data, error } = exchange;
  if (!data) {
    if (error) return <EmptyState icon={<TriangleAlert className="h-5 w-5 text-amber-300" />} sentence={`Could not load prices: ${error}`} />;
    return <SkeletonRows label="Loading prices" />;
  }
  const { query, movers, liquid } = filters;
  const category = data.categories.find((c) => c.slug === slug);
  const pane = <ExchangePane data={data} category={category} query={query} movers={movers} liquid={liquid} onMovers={setMovers} onLiquid={setLiquid} />;
  if (!error) return pane;
  return (
    <div className="grid min-w-0 content-start gap-3">
      <p role="alert" className="text-sm text-amber-300">
        Could not refresh prices: {error}
      </p>
      {pane}
    </div>
  );
}

/**
 * Rail + the active group's pane. It does not wait for the exchange payload: a unique deep link
 * renders from the uniques route alone, and each pane shows its own loading or error state.
 */
function Body({ exchange }: { exchange: Loaded<MarketPricesResponse> }) {
  const { slug, query, selectCategory, selectSection, search } = usePricesParams(exchange.data?.categories ?? null);
  const [movers, setMovers] = useState(false);
  const [liquid, setLiquid] = useState(false);
  const [valuableOnly, setValuableOnly] = useState(true);
  const section = sectionOf(slug);
  const uniques = useMarketUniques(section === "uniques" || query.trim() !== "");
  const filters = useMemo(() => ({ query, movers, liquid, valuableOnly }), [query, movers, liquid, valuableOnly]);
  const groups = useRailGroups(exchange, uniques, filters);
  const uniqueCategory = UNIQUE_CATEGORIES.find((c) => c.slug === slug);
  return (
    <div className="grid gap-4 lg:grid-cols-[14rem_minmax(0,1fr)]">
      <CategoryRail groups={groups} activeSlug={slug} activeSection={section} query={query} onSelect={selectCategory} onSearchSection={selectSection} onQuery={search} />
      {uniqueCategory ? (
        <UniquesPane data={uniques.data} error={uniques.error} categoryId={uniqueCategory.id} query={query} valuableOnly={valuableOnly} onValuableOnly={setValuableOnly} />
      ) : (
        <ExchangeSlot exchange={exchange} slug={slug} filters={filters} setMovers={setMovers} setLiquid={setLiquid} />
      )}
    </div>
  );
}

/** Market › Prices: every exchange item and unique, poe.ninja-style — category rail, sortable tables, inline charts. */
export function PricesTool() {
  const exchange = useMarketPrices();
  const { data } = exchange;
  const ageMin = data?.fetchedAt ? timestampAgeMs(data.fetchedAt) / 60_000 : null;
  return (
    <section className="grid gap-4">
      <PageHeader
        title="Prices"
        purpose={`Every exchange item${data ? ` in ${data.league}` : ""} and every unique: price, 7-day trend and how much trades.`}
        legend={LEGEND}
        action={data && <StaleBadge ageMin={ageMin} warnAfterMin={180} />}
      />
      <Body exchange={exchange} />
    </section>
  );
}
