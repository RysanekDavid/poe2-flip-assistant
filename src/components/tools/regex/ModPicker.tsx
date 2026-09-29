"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import type { PoolComposeResult } from "../../../core/tools/regex/poolCompose";
import type { PoolMod, PoolTab, RegexPool } from "../../../core/tools/regex/pools/schema";
import type { ModState, PoolTabSelection, ValueRange } from "../../../lib/tools/regexPoolContract";
import { InfoTip } from "../../ui/Tooltip";
import { ModCard } from "./ModCard";
import { filterGroups, inlineRollText, modMeta, tokenInfoByMod, type ModTokenInfo } from "./modView";
import { Segmented, type SegmentOption } from "./Segmented";
import { SelectionSummary } from "./SelectionSummary";
import { setModState, setThreshold, toggleInBucket } from "./selectionOps";

// Players mostly exclude deadly waystone/tablet mods, and hunt for good relic/jewel mods.
const DEFAULT_BRUSH: Record<PoolTab, ModState> = { waystone: "avoid", tablet: "avoid", relic: "want", jewel: "want" };
const TITLE: Record<PoolTab, string> = { waystone: "Waystone mods", tablet: "Tablet mods", relic: "Relic mods", jewel: "Jewel mods" };
const SEARCH_HINT: Record<PoolTab, string> = {
  waystone: "poison, curse, resist…",
  tablet: "breach, essence, rogue…",
  relic: "honour, sacred water…",
  jewel: "critical, life, minion…",
};

const BRUSH: readonly SegmentOption<ModState>[] = [
  { value: "avoid", label: "Avoid", activeClass: "bg-bad/25 text-red-100", title: "a click puts the mod in Avoid: items with it stay dark (key A)" },
  { value: "want", label: "Want", activeClass: "bg-good/25 text-green-100", title: "a click puts the mod in Want: items with it light up (key W)" },
];

interface ModView {
  text: string;
  meta: string;
}

interface PickerProps {
  pool: RegexPool;
  selection: PoolTabSelection;
  onUpdate: (fn: (s: PoolTabSelection) => PoolTabSelection) => void;
  result: PoolComposeResult | null;
}

/** A / W switch the brush while no text field has focus. */
function useBrushKeys(setBrush: (b: ModState) => void): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target;
      if (t instanceof HTMLElement && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return;
      if (e.key === "a" || e.key === "A") setBrush("avoid");
      else if (e.key === "w" || e.key === "W") setBrush("want");
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [setBrush]);
}

interface GroupProps {
  groupId: string;
  label: string;
  mods: PoolMod[];
  open: boolean;
  setGroupOpen: (groupId: string, open: boolean) => void;
  selection: PoolTabSelection;
  views: ReadonlyMap<string, ModView>;
  info: ReadonlyMap<string, ModTokenInfo>;
  masked: ReadonlySet<string>;
  uncovered: ReadonlySet<string>;
  onToggle: (modId: string) => void;
  onThreshold: (key: string, range: ValueRange | null) => void;
}

function ModGroup({ groupId, label, mods, open, setGroupOpen, selection, views, info, masked, uncovered, onToggle, onThreshold }: GroupProps) {
  const bodyId = useId();
  // pin the group open once a card in it is clicked, so dropping its last mark does not fold it away
  const toggle = useCallback((id: string) => {
    setGroupOpen(groupId, true);
    onToggle(id);
  }, [setGroupOpen, groupId, onToggle]);
  const want = mods.filter((m) => selection.mods[m.id] === "want").length;
  const avoid = mods.filter((m) => selection.mods[m.id] === "avoid").length;
  return (
    <section className="border-t border-line first:border-t-0">
      <button type="button" aria-expanded={open} aria-controls={bodyId} onClick={() => setGroupOpen(groupId, !open)} className="flex w-full items-center gap-2 py-2.5 text-left text-sm font-medium text-neutral-200 hover:text-white">
        <ChevronDown aria-hidden className={`h-4 w-4 text-neutral-400 transition-transform ${open ? "" : "-rotate-90"}`} />
        {label}
        <span className="text-xs font-normal tabular-nums text-neutral-500">{mods.length}</span>
        {avoid > 0 && <span className="rounded bg-bad/15 px-1.5 text-xs font-medium text-red-200">{avoid} avoid</span>}
        {want > 0 && <span className="rounded bg-good/15 px-1.5 text-xs font-medium text-green-200">{want} want</span>}
      </button>
      <ul id={bodyId} hidden={!open} className="grid gap-2 pb-3 md:grid-cols-2">
        {open &&
          mods.map((m) => {
            const view = views.get(m.id);
            return (
              <ModCard
                key={m.id}
                mod={m}
                text={view?.text ?? m.id}
                meta={view?.meta ?? ""}
                state={selection.mods[m.id]}
                thresholds={selection.thresholds}
                info={info.get(m.id)}
                masked={masked.has(m.id)}
                uncovered={uncovered.has(m.id)}
                onToggle={toggle}
                onThreshold={onThreshold}
              />
            );
          })}
      </ul>
    </section>
  );
}

function PickerHeader({ tab, count, brush, onBrush }: { tab: PoolTab; count: number; brush: ModState; onBrush: (b: ModState) => void }) {
  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-neutral-300">
        {TITLE[tab]} · <span className="tabular-nums">{count}</span>
        <InfoTip tip="Pick Avoid or Want, then click mods to add them there. Click a marked mod again to drop it; a mod in the other bucket moves over. Keys A / W switch the brush." label="how marking mods works" />
      </h3>
      <span className="flex items-center gap-2 text-xs text-neutral-400">
        Clicking adds to
        <Segmented options={BRUSH} value={brush} onChange={onBrush} label="clicking a mod adds it to" />
      </span>
    </header>
  );
}

function ModSearch({ tab, query, onQuery, shown }: { tab: PoolTab; query: string; onQuery: (q: string) => void; shown: number | null }) {
  return (
    <label className="flex h-10 items-center gap-2 rounded-md border border-neutral-700 bg-neutral-950 px-3 focus-within:border-amber-400/60">
      <Search aria-hidden className="h-4 w-4 text-neutral-400" />
      <input
        type="search"
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        placeholder={`Search mods — ${SEARCH_HINT[tab]}`}
        aria-label="search mods"
        className="min-w-0 flex-1 bg-transparent text-sm text-neutral-100 outline-none placeholder:text-neutral-500"
      />
      {shown !== null && <span className="text-xs tabular-nums text-neutral-400">{shown} shown</span>}
    </label>
  );
}

/**
 * The mods card: pick a bucket with the Avoid / Want brush, then click mod cards to fill it. Groups
 * start collapsed unless they hold a marked mod; typing a search opens every matching group.
 */
export function ModPicker({ pool, selection, onUpdate, result }: PickerProps) {
  const [brush, setBrush] = useState<ModState>(DEFAULT_BRUSH[pool.tab]);
  const [query, setQuery] = useState("");
  const [openOverride, setOpenOverride] = useState<Record<string, boolean>>({});
  useBrushKeys(setBrush);
  const views = useMemo(() => new Map(pool.mods.map((m): [string, ModView] => [m.id, { text: inlineRollText(m), meta: modMeta(m, pool) }])), [pool]);
  const groups = useMemo(() => filterGroups(pool, query), [pool, query]);
  const info = useMemo(() => tokenInfoByMod(pool, result), [pool, result]);
  const masked = useMemo(() => new Set(result?.masked ?? []), [result]);
  const uncovered = useMemo(() => new Set(result?.uncovered ?? []), [result]);
  const onToggle = useCallback((id: string) => onUpdate((s) => toggleInBucket(s, id, brush)), [onUpdate, brush]);
  const onRemove = useCallback((id: string) => onUpdate((s) => setModState(s, id, "ignore")), [onUpdate]);
  const onThreshold = useCallback((key: string, r: ValueRange | null) => onUpdate((s) => setThreshold(s, key, r)), [onUpdate]);
  const setGroupOpen = useCallback((id: string, open: boolean) => setOpenOverride((o) => (o[id] === open ? o : { ...o, [id]: open })), []);
  const labelOf = useCallback((id: string) => views.get(id)?.text ?? id, [views]);
  const shown = groups.reduce((n, g) => n + g.mods.length, 0);
  const searching = query.trim() !== "";
  return (
    <section aria-label="mods" className="flex min-w-0 flex-col gap-3 rounded-lg border border-line bg-surface/60 p-4">
      <PickerHeader tab={pool.tab} count={pool.mods.length} brush={brush} onBrush={setBrush} />
      <SelectionSummary mods={selection.mods} labelOf={labelOf} onRemove={onRemove} />
      <ModSearch tab={pool.tab} query={query} onQuery={setQuery} shown={searching ? shown : null} />
      <div>
        {groups.length === 0 && <p className="py-3 text-sm text-neutral-400">No mod contains “{query}”.</p>}
        {groups.map((g) => (
          <ModGroup
            key={g.id}
            groupId={g.id}
            label={g.label}
            mods={g.mods}
            open={searching || (openOverride[g.id] ?? g.mods.some((m) => selection.mods[m.id] !== undefined))}
            setGroupOpen={setGroupOpen}
            selection={selection}
            views={views}
            info={info}
            masked={masked}
            uncovered={uncovered}
            onToggle={onToggle}
            onThreshold={onThreshold}
          />
        ))}
      </div>
    </section>
  );
}
