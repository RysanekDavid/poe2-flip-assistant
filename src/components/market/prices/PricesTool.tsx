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
import { CategoryRail, type RailGroup } from "./CategoryRail";
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

interface UniquesState {
  data: MarketUniquesResponse | null;
  error: string | null;
}

interface Filters {
  query: string;
  movers: boolean;
  liquid: boolean;
  valuableOnly: boolean;
}

/** Both rail groups under the active filters; unique rows keep their static labels while loading. */
function useRailGroups(data: MarketPricesResponse, uniques: UniquesState, f: Filters): RailGroup[] {
  const exchange = useMemo(() => railCounts(data.items, f), [data.items, f]);
  const unique = useMemo(() => (uniques.data ? uniqueRailCounts(uniques.data.items, f) : null), [uniques.data, f]);
  const icons = new Map(uniques.data?.categories.map((c) => [c.id, c.icon]) ?? []);
  return [
    {
      section: "exchange",
      title: "Exchange",
      entries: data.categories.map((c) => ({ slug: c.slug, label: c.label, icon: c.icon, count: exchange.byCategory.get(c.type) ?? 0 })),
      matches: exchange.matches,
      error: null,
    },
    {
      section: "uniques",
      title: "Uniques",
      entries: UNIQUE_CATEGORIES.map((c) => ({ slug: c.slug, label: c.label, icon: icons.get(c.id) ?? null, count: unique ? (unique.byCategory.get(c.id) ?? 0) : null })),
      matches: unique?.matches ?? null,
      error: uniques.error,
    },
  ];
}

function Body({ data, uniques }: { data: MarketPricesResponse; uniques: UniquesState }) {
  const { slug, query, selectCategory, selectSection, search } = usePricesParams(data.categories);
  const [movers, setMovers] = useState(false);
  const [liquid, setLiquid] = useState(false);
  const [valuableOnly, setValuableOnly] = useState(true);
  const filters = useMemo(() => ({ query, movers, liquid, valuableOnly }), [query, movers, liquid, valuableOnly]);
  const groups = useRailGroups(data, uniques, filters);
  const section = sectionOf(slug);
  const uniqueCategory = UNIQUE_CATEGORIES.find((c) => c.slug === slug);
  return (
    <div className="grid gap-4 lg:grid-cols-[14rem_minmax(0,1fr)]">
      <CategoryRail groups={groups} activeSlug={slug} activeSection={section} query={query} onSelect={selectCategory} onSearchSection={selectSection} onQuery={search} />
      {uniqueCategory ? (
        <UniquesPane data={uniques.data} error={uniques.error} categoryId={uniqueCategory.id} query={query} valuableOnly={valuableOnly} onValuableOnly={setValuableOnly} />
      ) : (
        <ExchangePane
          data={data}
          category={data.categories.find((c) => c.slug === slug)}
          query={query}
          movers={movers}
          liquid={liquid}
          onMovers={setMovers}
          onLiquid={setLiquid}
        />
      )}
    </div>
  );
}

/** Market › Prices: every exchange item and unique, poe.ninja-style — category rail, sortable tables, inline charts. */
export function PricesTool() {
  const { data, error } = useMarketPrices();
  const uniques = useMarketUniques();
  const ageMin = data?.fetchedAt ? timestampAgeMs(data.fetchedAt) / 60_000 : null;
  return (
    <section className="grid gap-4">
      <PageHeader
        title="Prices"
        purpose={`Every exchange item${data ? ` in ${data.league}` : ""} and every unique: price, 7-day trend and how much trades.`}
        legend={LEGEND}
        action={data && <StaleBadge ageMin={ageMin} warnAfterMin={180} />}
      />
      {error && <EmptyState icon={<TriangleAlert className="h-5 w-5 text-amber-300" />} sentence={`Could not load prices: ${error}`} />}
      {data ? <Body data={data} uniques={uniques} /> : !error && <SkeletonRows label="Loading prices" />}
    </section>
  );
}
