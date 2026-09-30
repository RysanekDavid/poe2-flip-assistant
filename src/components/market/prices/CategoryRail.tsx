"use client";

import { useEffect, useRef, type RefObject } from "react";
import { Search, TriangleAlert } from "lucide-react";
import { ItemArt } from "../../ui/ItemArt";

/** One rail entry, exchange or unique: what a click selects and what it will show. */
export interface RailEntry {
  slug: string;
  label: string;
  icon: string | null;
  /** Rows a click reveals under the active filters; null while that group is still loading. */
  count: number | null;
}

export type RailSection = "exchange" | "uniques";

export interface RailGroup {
  section: RailSection;
  title: string;
  entries: readonly RailEntry[];
  /** Search matches in this group under its filters; null while loading. */
  matches: number | null;
  /** Why the group has no data (shown on its header, loudly). */
  error: string | null;
}

interface CategoryRailProps {
  groups: readonly RailGroup[];
  /** Slug on screen; while searching only its section matters. */
  activeSlug: string;
  activeSection: RailSection;
  query: string;
  onSelect: (slug: string) => void;
  /** While searching, the other group's "All" row switches the results to that group. */
  onSearchSection: (section: RailSection) => void;
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
      <span className="sr-only">Search all items and uniques</span>
      <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
      <input
        ref={input}
        type="search"
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        placeholder="Search all items…"
        title="Press / to search — exchange items and uniques"
        className="h-9 w-full rounded-md border border-line bg-neutral-950 pl-8 pr-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-amber-400/60 focus:outline-none"
      />
    </label>
  );
}

/**
 * Below lg the rail is a horizontal strip, and a Uniques row (or its search row) sits far to the
 * right: scroll the strip so the current row is in view. Only the strip's own scrollLeft moves,
 * never the page, and only while it actually overflows (the lg column never does).
 */
function useStripFollowsActive(strip: RefObject<HTMLUListElement | null>, key: string) {
  useEffect(() => {
    const ul = strip.current;
    if (!ul || ul.scrollWidth <= ul.clientWidth) return;
    const row = ul.querySelector<HTMLElement>('[aria-current="true"]');
    if (!row) return;
    const left = row.getBoundingClientRect().left - ul.getBoundingClientRect().left + ul.scrollLeft;
    if (left < ul.scrollLeft || left + row.offsetWidth > ul.scrollLeft + ul.clientWidth) ul.scrollLeft = Math.max(0, left - 8);
  }, [strip, key]);
}

const countText =(n: number | null): string => (n === null ? "…" : String(n));

function GroupHeader({ group }: { group: RailGroup }) {
  return (
    <li className="hidden items-center gap-1.5 px-2 pt-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 lg:flex">
      {group.title}
      {group.error && (
        <span title={group.error} className="inline-flex">
          <TriangleAlert aria-hidden className="h-3.5 w-3.5 text-amber-300" />
          <span className="sr-only">
            {group.title} failed to load: {group.error}
          </span>
        </span>
      )}
    </li>
  );
}

function SearchRow({ group, current, onClick }: { group: RailGroup; current: boolean; onClick: () => void }) {
  return (
    <li className="shrink-0">
      <button type="button" onClick={onClick} aria-current={current ? "true" : undefined} className={`${ROW} ${current ? ROW_ACTIVE : ROW_IDLE}`}>
        <Search aria-hidden className="h-5 w-5 text-neutral-400" />
        <span className="flex-1 whitespace-nowrap">All {group.section === "uniques" ? "uniques" : "exchange"}</span>
        <span className="text-xs tabular-nums text-neutral-400">{countText(group.matches)} matches</span>
      </button>
    </li>
  );
}

function EntryRow({ entry, current, onClick }: { entry: RailEntry; current: boolean; onClick: () => void }) {
  return (
    <li className="shrink-0">
      <button type="button" onClick={onClick} aria-current={current ? "true" : undefined} className={`${ROW} ${current ? ROW_ACTIVE : ROW_IDLE}`}>
        <ItemArt src={entry.icon} size={6} />
        <span className="flex-1 whitespace-nowrap">{entry.label}</span>
        <span className="text-xs tabular-nums text-neutral-500">{countText(entry.count)}</span>
      </button>
    </li>
  );
}

/**
 * poe.ninja's left rail in our tokens: an EXCHANGE and a UNIQUES group, each row with category art,
 * label and count, a 2px amber bar on the active row. Below lg it becomes one horizontal strip.
 */
export function CategoryRail({ groups, activeSlug, activeSection, query, onSelect, onSearchSection, onQuery }: CategoryRailProps) {
  const searching = query.trim() !== "";
  const strip = useRef<HTMLUListElement>(null);
  useStripFollowsActive(strip, `${activeSection}:${activeSlug}:${searching}`);
  return (
    <nav aria-label="Item categories" className="grid min-w-0 content-start gap-2 lg:sticky lg:top-[calc(var(--shell-h,0px)+1rem)]">
      <SearchBox query={query} onQuery={onQuery} />
      <ul ref={strip} className="flex gap-1 overflow-x-auto pb-1 lg:grid lg:gap-0.5 lg:overflow-visible lg:pb-0">
        {groups.map((g) => (
          <RailGroupRows key={g.section} group={g} searching={searching} activeSlug={activeSlug} activeSection={activeSection} onSelect={onSelect} onSearchSection={onSearchSection} />
        ))}
      </ul>
    </nav>
  );
}

function RailGroupRows({ group, searching, activeSlug, activeSection, onSelect, onSearchSection }: { group: RailGroup; searching: boolean } & Pick<CategoryRailProps, "activeSlug" | "activeSection" | "onSelect" | "onSearchSection">) {
  return (
    <>
      <GroupHeader group={group} />
      {searching && <SearchRow group={group} current={group.section === activeSection} onClick={() => onSearchSection(group.section)} />}
      {group.entries.map((e) => (
        <EntryRow key={e.slug} entry={e} current={!searching && e.slug === activeSlug} onClick={() => onSelect(e.slug)} />
      ))}
    </>
  );
}
