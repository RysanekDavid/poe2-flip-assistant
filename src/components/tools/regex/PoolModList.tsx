"use client";

import { useCallback, useId, useMemo, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import type { PoolComposeResult } from "../../../core/tools/regex/poolCompose";
import type { PoolMod, RegexPool } from "../../../core/tools/regex/pools/schema";
import type { PoolTabSelection, ValueRange } from "../../../lib/tools/regexPoolContract";
import { ModRow } from "./ModRow";
import { filterGroups, tokenInfoByMod, type ModTokenInfo } from "./modView";
import { setModState, setThreshold, type ModChoice } from "./selectionOps";

interface ListProps {
  pool: RegexPool;
  selection: PoolTabSelection;
  onUpdate: (fn: (s: PoolTabSelection) => PoolTabSelection) => void;
  result: PoolComposeResult | null;
}

interface GroupProps {
  label: string;
  mods: PoolMod[];
  selection: PoolTabSelection;
  info: Map<string, ModTokenInfo>;
  masked: ReadonlySet<string>;
  uncovered: ReadonlySet<string>;
  onState: (modId: string, choice: ModChoice) => void;
  onThreshold: (key: string, range: ValueRange | null) => void;
}

function ModGroup({ label, mods, selection, info, masked, uncovered, onState, onThreshold }: GroupProps) {
  const [open, setOpen] = useState(true);
  const bodyId = useId();
  const want = mods.filter((m) => selection.mods[m.id] === "want").length;
  const avoid = mods.filter((m) => selection.mods[m.id] === "avoid").length;
  return (
    <section className="border-t border-line first:border-t-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 py-2 text-left text-sm font-semibold text-neutral-100 hover:text-white"
      >
        <ChevronDown aria-hidden className={`h-4 w-4 text-neutral-400 transition-transform ${open ? "" : "-rotate-90"}`} />
        {label}
        <span className="text-xs font-normal text-neutral-400">{mods.length}</span>
        {want > 0 && <span className="rounded bg-good/15 px-1.5 text-xs font-medium text-green-200">{want} want</span>}
        {avoid > 0 && <span className="rounded bg-bad/15 px-1.5 text-xs font-medium text-red-200">{avoid} avoid</span>}
      </button>
      <ul id={bodyId} hidden={!open} className="pb-2">
        {mods.map((m) => (
          <ModRow
            key={m.id}
            mod={m}
            state={selection.mods[m.id]}
            thresholds={selection.thresholds}
            info={info.get(m.id)}
            masked={masked.has(m.id)}
            uncovered={uncovered.has(m.id)}
            onState={onState}
            onThreshold={onThreshold}
          />
        ))}
      </ul>
    </section>
  );
}

/** Left column: every mod of the pool, grouped, searchable, each with Want / Avoid / Ignore. */
export function PoolModList({ pool, selection, onUpdate, result }: ListProps) {
  const [query, setQuery] = useState("");
  const groups = useMemo(() => filterGroups(pool, query), [pool, query]);
  const info = useMemo(() => tokenInfoByMod(pool, result), [pool, result]);
  const masked = useMemo(() => new Set(result?.masked ?? []), [result]);
  const uncovered = useMemo(() => new Set(result?.uncovered ?? []), [result]);
  const onState = useCallback((id: string, c: ModChoice) => onUpdate((s) => setModState(s, id, c)), [onUpdate]);
  const onThreshold = useCallback((key: string, r: ValueRange | null) => onUpdate((s) => setThreshold(s, key, r)), [onUpdate]);
  const shown = groups.reduce((n, g) => n + g.mods.length, 0);
  return (
    <section aria-label="mods" className="min-w-0 rounded-lg border border-line bg-surface/60 p-4">
      <label className="mb-2 flex h-9 items-center gap-2 rounded-md border border-neutral-700 bg-neutral-950 px-2.5 focus-within:border-amber-400/60">
        <Search aria-hidden className="h-4 w-4 text-neutral-400" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`search ${pool.mods.length} mods…`}
          aria-label="search mods"
          className="min-w-0 flex-1 bg-transparent text-sm text-neutral-100 outline-none placeholder:text-neutral-500"
        />
        {query && <span className="text-xs tabular-nums text-neutral-400">{shown} shown</span>}
      </label>
      {groups.length === 0 && <p className="py-3 text-sm text-neutral-400">No mod contains “{query}”.</p>}
      {groups.map((g) => (
        <ModGroup
          key={g.id}
          label={g.label}
          mods={g.mods}
          selection={selection}
          info={info}
          masked={masked}
          uncovered={uncovered}
          onState={onState}
          onThreshold={onThreshold}
        />
      ))}
    </section>
  );
}
