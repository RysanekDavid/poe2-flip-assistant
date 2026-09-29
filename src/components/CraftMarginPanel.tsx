"use client";

import { useEffect, useState } from "react";
import { Diamond, Gem, Loader2, Play, Shield, Sword } from "lucide-react";
import { loadSavedSession } from "./craft/CraftSessionWizard";
import { useCraftMargins } from "./craft/CraftMarginsContext";
import type { RecipeView } from "./craft/craftView";
import { isCraftable, RecipeRow, type DomainMeta } from "./craft/RecipeRow";
import { Button } from "./ui/Button";
import { Panel } from "./ui/Panel";
import type { CraftDomain } from "../core/craftRecipes";

/** Each craft domain keeps its own art and name — the procedures differ per item class. */
export const CRAFT_DOMAINS: Record<CraftDomain, DomainMeta> = {
  jewel: { title: "Jewel", icon: Gem },
  weapon: { title: "Weapon", icon: Sword },
  jewellery: { title: "Jewellery", icon: Diamond },
  armour: { title: "Armour", icon: Shield },
};

export const RECIPE_FILTERS = ["all", "profitable", "jewel", "weapon", "jewellery", "armour"] as const;
export type RecipeFilter = (typeof RECIPE_FILTERS)[number];

const FILTER_LABEL: Record<RecipeFilter, string> = {
  all: "All",
  profitable: "Profitable",
  jewel: "Jewel",
  weapon: "Weapon",
  jewellery: "Jewellery",
  armour: "Armour",
};

export function matchesFilter(r: RecipeView, filter: RecipeFilter): boolean {
  if (filter === "all") return true;
  if (filter === "profitable") return isCraftable(r) && (r.report?.evDiv ?? 0) > 0;
  return r.domain === filter;
}

/** EV rank: priced recipes by EV descending, unscanned ones last. */
function byEv(a: RecipeView, b: RecipeView): number {
  return (b.report?.evDiv ?? -Infinity) - (a.report?.evDiv ?? -Infinity);
}

/** Owner-only "queue refresh" (re-prices ALL domains on the poller). */
function RefreshButton({ onNotice, onError }: { onNotice: (s: string) => void; onError: (s: string) => void }) {
  const [refreshing, setRefreshing] = useState(false);
  const refreshNow = async (): Promise<void> => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const res = await fetch("/api/craft/margins", { method: "POST" });
      const d = (await res.json()) as { queued?: boolean; error?: string };
      if (!res.ok || d.error) onError(d.error ?? `refresh failed (${res.status})`);
      else onNotice("refresh queued — the poller picks it up within ~20s");
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setRefreshing(false);
    }
  };
  return (
    <Button size="sm" onClick={() => void refreshNow()} disabled={refreshing} title="queue a full re-price on the poller (owner)">
      {refreshing ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : <Play aria-hidden className="h-4 w-4" />} queue refresh
    </Button>
  );
}

function FilterChips({ filter, onFilter, counts }: { filter: RecipeFilter; onFilter: (f: RecipeFilter) => void; counts: Record<RecipeFilter, number> }) {
  return (
    <div role="group" aria-label="Filter recipes" className="mb-3 flex flex-wrap gap-1.5">
      {RECIPE_FILTERS.map((f) => (
        <button
          key={f}
          type="button"
          aria-pressed={f === filter}
          onClick={() => onFilter(f)}
          className={`h-8 rounded-md border px-3 text-sm ${
            f === filter ? "border-amber-400/50 bg-amber-400/10 text-amber-100" : "border-line text-neutral-400 hover:border-neutral-600 hover:text-neutral-100"
          }`}
        >
          {FILTER_LABEL[f]} <span className="tabular-nums text-neutral-400">{counts[f]}</span>
        </button>
      ))}
    </div>
  );
}

/** Expanded-card set; a craft session in progress re-expands its card after a refresh/alt-tab. */
function useOpenCards() {
  const [open, setOpen] = useState<Set<string>>(new Set());
  useEffect(() => {
    const saved = loadSavedSession();
    if (saved) setOpen((prev) => new Set(prev).add(saved.recipeKey));
  }, []);
  const toggle = (key: string): void =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const add = (key: string): void => setOpen((prev) => new Set(prev).add(key));
  return { open, toggle, add };
}

/**
 * Every recipe in one panel, ranked by modelled EV per attempt, narrowed by filter chips; each row
 * expands to the full derivation + guide and launches an interactive craft session. Read-only
 * pricing; the human crafts.
 */
export function CraftMarginPanel() {
  const { data, error } = useCraftMargins();
  const [filter, setFilter] = useState<RecipeFilter>("all");
  const [notice, setNotice] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const cards = useOpenCards();
  const all = [...(data?.recipes ?? [])].sort(byEv);
  const counts = Object.fromEntries(RECIPE_FILTERS.map((f) => [f, all.filter((r) => matchesFilter(r, f)).length])) as Record<RecipeFilter, number>;
  const recipes = all.filter((r) => matchesFilter(r, filter));
  const status = data ? (data.enabled ? `auto · stalest every ${data.intervalMin} min` : "manual") : null;
  const refresh = data?.canRefresh ? <RefreshButton onNotice={setNotice} onError={setActionErr} /> : null;
  return (
    <Panel title="Recipes" right={<>{status && <span className="text-xs text-neutral-400">{status}</span>}{refresh}</>}>
      <FilterChips filter={filter} onFilter={setFilter} counts={counts} />
      {notice && <p className="mb-3 text-sm text-sky-400">{notice}</p>}
      {(error ?? actionErr) && <p role="alert" className="mb-3 text-sm text-bad">error: {error ?? actionErr}</p>}
      {data && !data.audit.current && (
        <p role="alert" className="mb-3 rounded-md border border-amber-400/40 bg-amber-950/20 px-3 py-2 text-sm text-amber-300">
          Recipe audit built on a different game-data snapshot ({data.audit.gameDataPatch}, RePoE {data.audit.repoeVersion}) — legality and stale
          badges may be wrong until someone re-runs craft:audit-recipes.
        </p>
      )}
      <div className="space-y-2">
        {recipes.map((r) => (
          <RecipeRow
            key={r.key}
            r={r}
            ex={data?.exaltPerDivine ?? null}
            icons={data?.icons ?? {}}
            meta={CRAFT_DOMAINS[r.domain]}
            intervalMin={data?.intervalMin ?? 0}
            open={cards.open.has(r.key)}
            onToggle={() => cards.toggle(r.key)}
            onOpen={() => cards.add(r.key)}
          />
        ))}
        {recipes.length === 0 && !error && <p className="py-3 text-center text-sm text-neutral-400">{data ? "No recipe matches this filter." : "Loading recipes…"}</p>}
      </div>
    </Panel>
  );
}
