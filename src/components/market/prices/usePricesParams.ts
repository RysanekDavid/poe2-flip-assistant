"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { DEFAULT_CATEGORY_SLUG } from "../../../lib/economyCategories";
import type { MarketPriceCategory } from "../../../lib/marketPricesContract";
import { isUniqueSlug, UNIQUE_CATEGORIES } from "../../../lib/uniqueCategories";
import type { RailSection } from "./CategoryRail";

// Unique slugs are static, so a deep link to one holds before (or without) the uniques loading.
const listed = (categories: readonly MarketPriceCategory[], slug: string): boolean => isUniqueSlug(slug) || categories.some((c) => c.slug === slug);

const FIRST_UNIQUE_SLUG = UNIQUE_CATEGORIES[0]?.slug ?? DEFAULT_CATEGORY_SLUG;

export const sectionOf = (slug: string): RailSection => (isUniqueSlug(slug) ? "uniques" : "exchange");

/**
 * ?cat= and ?q= mirror the view so it deep-links. A category this response does not list warns and
 * is rewritten: unknown, or known but absent right now (Other exists only while it holds items), so
 * the table never claims "no priced items yet" for a bucket that simply isn't there.
 */
export function usePricesParams(categories: readonly MarketPriceCategory[]) {
  const params = useSearchParams();
  const rawCat = params.get("cat");
  const [picked, setSlug] = useState(() => (rawCat !== null && listed(categories, rawCat) ? rawCat : DEFAULT_CATEGORY_SLUG));
  const slug = listed(categories, picked) ? picked : DEFAULT_CATEGORY_SLUG;
  const [query, setQuery] = useState(() => params.get("q") ?? "");
  const write = useCallback((cat: string, q: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set("cat", cat);
    if (q.trim() === "") url.searchParams.delete("q");
    else url.searchParams.set("q", q);
    window.history.replaceState(window.history.state, "", url);
  }, []);
  useEffect(() => {
    if (rawCat === null || listed(categories, rawCat)) return;
    console.warn(`[market] price category cat=${rawCat} is not listed — showing ${DEFAULT_CATEGORY_SLUG}`);
    write(DEFAULT_CATEGORY_SLUG, params.get("q") ?? "");
  }, [rawCat, params, write, categories]);
  const selectCategory = (next: string): void => {
    setSlug(next);
    setQuery("");
    write(next, "");
  };
  /** Keeps the search and moves its results to the other group. */
  const selectSection = (section: RailSection): void => {
    if (section === sectionOf(slug)) return;
    const next = section === "uniques" ? FIRST_UNIQUE_SLUG : DEFAULT_CATEGORY_SLUG;
    setSlug(next);
    write(next, query);
  };
  const search = (q: string): void => {
    setQuery(q);
    write(slug, q);
  };
  return { slug, query, selectCategory, selectSection, search };
}
