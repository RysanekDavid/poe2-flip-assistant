"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import { Loader2, Search } from "lucide-react";
import { ENTITY_KIND_LABEL } from "../../core/entities/schema";
import type { EntityLookup, EntitySearchResponse } from "../../lib/learnContract";
import { currentData, entitySearchUrl, type Remote } from "../../lib/learnSearch";
import { EntityCard, type EntityCardData } from "../coach/EntityChip";
import { EmptyState } from "../ui/EmptyState";
import { ItemArt } from "../ui/ItemArt";
import { Panel } from "../ui/Panel";
import { PriceChip } from "../ui/PriceChip";
import { PickupHintBadge, SellRouteBadge } from "./SellRoute";
import { useEntitySearch } from "./useLearnApi";

const EXAMPLES = ["Exalted Orb", "Omen of Whittling", "Essence of the Body", "Headhunter"];

export function toCardData(entity: EntityLookup): EntityCardData {
  return {
    ...entity,
    price_div: entity.price?.div ?? null,
    price_at: entity.price?.at ?? null,
    price_source: entity.price?.source,
  };
}

interface ResultListProps {
  id: string;
  results: readonly EntityLookup[];
  active: number;
  exPerDiv: number | null;
  onPick: (entity: EntityLookup) => void;
}

function ResultList({ id, results, active, exPerDiv, onPick }: ResultListProps) {
  return (
    <ul id={id} role="listbox" aria-label="Matching items" className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-md border border-line bg-neutral-900 shadow-xl">
      {results.map((entity, index) => (
        <li
          key={entity.id}
          id={`${id}-${index}`}
          role="option"
          aria-selected={index === active}
          // mousedown, not click: the input's blur would close the list before a click lands
          onMouseDown={(e) => {
            e.preventDefault();
            onPick(entity);
          }}
          className={`flex cursor-pointer items-center gap-2.5 px-3 py-1.5 text-sm ${index === active ? "bg-amber-400/10 text-amber-100" : "text-neutral-200 hover:bg-neutral-800"}`}
        >
          <ItemArt src={entity.icon_url} size={6} />
          <span className="min-w-0 flex-1 truncate">{entity.name}</span>
          <span className="text-xs text-neutral-400">{ENTITY_KIND_LABEL[entity.kind]}</span>
          <PriceChip div={entity.price?.div ?? null} exPerDiv={exPerDiv} />
        </li>
      ))}
    </ul>
  );
}

function nextIndex(key: string, active: number, count: number): number | null {
  if (key === "ArrowDown") return Math.min(active + 1, count - 1);
  if (key === "ArrowUp") return Math.max(active - 1, 0);
  return null;
}

function ExampleChips({ onChoose }: { onChoose: (name: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs text-neutral-400">
      Try:
      {EXAMPLES.map((name) => (
        <button
          key={name}
          type="button"
          onClick={() => onChoose(name)}
          className="rounded border border-line px-2 py-0.5 text-neutral-300 hover:border-amber-400/40 hover:text-amber-100"
        >
          {name}
        </button>
      ))}
    </div>
  );
}

function SearchStatus({ search, current, query }: { search: Remote<EntitySearchResponse>; current: EntitySearchResponse | null; query: string }) {
  if (search.kind === "error") return <p className="mt-2 text-sm text-bad">Search failed: {search.message}</p>;
  if (current !== null && current.results.length === 0) {
    return <p className="mt-2 text-sm text-neutral-400">No item matches “{query.trim()}”.</p>;
  }
  return null;
}

interface ListKeys {
  results: readonly EntityLookup[];
  active: number;
  setActive: (index: number) => void;
  setOpen: (open: boolean) => void;
  pick: (entity: EntityLookup) => void;
}

/** Arrow keys move, Enter picks the highlighted current result, Escape closes the list. */
function listKeyHandler({ results, active, setActive, setOpen, pick }: ListKeys): (e: KeyboardEvent<HTMLInputElement>) => void {
  return (e) => {
    const moved = nextIndex(e.key, active, results.length);
    const highlighted = results[active];
    if (moved !== null) {
      e.preventDefault();
      setOpen(true);
      setActive(moved);
    } else if (e.key === "Enter" && highlighted) {
      e.preventDefault();
      pick(highlighted);
    } else if (e.key === "Escape") setOpen(false);
  };
}

/** Combobox: debounced catalog search, arrow keys + Enter to pick, Escape to close. */
function SearchBox({ onPick }: { onPick: (entity: EntityLookup, exPerDiv: number | null) => void }) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const url = entitySearchUrl(query);
  const search = useEntitySearch(url);
  // Only results for the text in the box: a debouncing keystroke must not let Enter pick a stale row.
  const current = currentData(search, url);
  const results = current?.results ?? [];
  const exPerDiv = current?.ex_per_div ?? null;
  const type = (text: string) => {
    setQuery(text);
    setActive(0);
    setOpen(true);
  };
  const pick = (entity: EntityLookup) => {
    onPick(entity, exPerDiv);
    setOpen(false);
  };
  const onKeyDown = listKeyHandler({ results, active, setActive, setOpen, pick });
  const expanded = open && results.length > 0;
  return (
    <div className="space-y-2">
      <div className="relative max-w-xl">
        <Search aria-hidden className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-neutral-500" />
        <input
          ref={inputRef}
          role="combobox"
          aria-expanded={expanded}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={expanded ? `${listId}-${active}` : undefined}
          aria-label="Item name"
          value={query}
          onChange={(e) => type(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          placeholder="Type an item: currency, omen, essence, unique…"
          className="h-10 w-full rounded-md border border-neutral-700 bg-neutral-950 pl-9 pr-9 text-sm text-neutral-100 outline-none placeholder:text-neutral-500 focus:border-amber-400/60"
        />
        {url !== null && current === null && search.kind !== "error" && (
          <Loader2 aria-label="searching" className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-neutral-400" />
        )}
        {expanded && <ResultList id={listId} results={results} active={active} exPerDiv={exPerDiv} onPick={pick} />}
        <SearchStatus search={search} current={current} query={query} />
      </div>
      <ExampleChips onChoose={(name) => { type(name); inputRef.current?.focus(); }} />
    </div>
  );
}

function LookupCard({ entity, exPerDiv }: { entity: EntityLookup; exPerDiv: number | null }) {
  const titleId = useId();
  return (
    <Panel>
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
        <div className="max-w-2xl text-sm">
          <EntityCard entity={toCardData(entity)} titleId={titleId} exPerDiv={exPerDiv} />
        </div>
        <div className="flex flex-col items-start gap-2">
          <SellRouteBadge route={entity.sell_route} />
          <PickupHintBadge hint={entity.pickup_hint} />
        </div>
      </div>
    </Panel>
  );
}

/** Learn › What is this: find any catalog item, see what it does, what it is worth and where to sell it. */
export function WhatIsThis() {
  const [picked, setPicked] = useState<{ entity: EntityLookup; exPerDiv: number | null } | null>(null);
  return (
    <div className="space-y-4">
      <SearchBox onPick={(entity, exPerDiv) => setPicked({ entity, exPerDiv })} />
      {picked ? (
        <LookupCard entity={picked.entity} exPerDiv={picked.exPerDiv} />
      ) : (
        <EmptyState icon={<Search className="h-5 w-5" />} sentence="Pick an item to see what it does, what it is worth right now, and where to sell it." />
      )}
    </div>
  );
}
