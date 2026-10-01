"use client";

import { useCallback, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Map as MapIcon, RefreshCw } from "lucide-react";
import type { BudgetTier, Mechanic } from "../../../core/strategies/schema";
import { assertOk, describeError, warnOnFailure } from "../../../lib/clientWarn";
import { strategiesResponseSchema, type StrategiesResponse, type StrategyView } from "../../../lib/strategiesContract";
import { useVisiblePoll } from "../../../lib/useVisiblePoll";
import { TAB_ICONS } from "../../shell/tabIcons";
import { Button } from "../../ui/Button";
import { Drawer } from "../../ui/Drawer";
import { EmptyState } from "../../ui/EmptyState";
import { PageHeader, type HeaderExample } from "../../ui/PageHeader";
import { ProvenanceChip } from "../../ui/ProvenanceChip";
import { StrategyCard } from "./StrategyCard";
import { StrategyDetail } from "./StrategyDetail";
import { StrategyFilters } from "./StrategyFilters";
import { mechanicArt } from "./strategyArt";
import { sortStrategies, type StrategySort } from "./strategyCards";
import { EMPTY_FILTER, filterStrategies, parseBudget, yieldNames, type StrategyFilter } from "./strategiesView";

// Prices come from poe.ninja (hourly); the curated facts change only with a release.
const POLL_MS = 15 * 60_000;
const ROUTE = "/api/farm/strategies";
/** ?s=<strategy id> opens that strategy's drawer, so a strategy deep-links and Back closes it. */
const OPEN_PARAM = "s";

function useStrategies() {
  const [data, setData] = useState<StrategiesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    fetch(ROUTE, { cache: "no-store" })
      .then(async (r) => {
        setData(strategiesResponseSchema.parse(await assertOk(r, ROUTE).json()));
        setError(null);
      })
      .catch((e: unknown) => {
        warnOnFailure("[farm] strategies")(e);
        setError(describeError(e));
      });
  }, []);
  useVisiblePoll(load, POLL_MS);
  return { data, error, reload: load };
}

/** The filter, with its budget mirrored into ?budget= so a "what can I farm with X" view deep-links. */
function useFilter() {
  const params = useSearchParams();
  const [filter, setFilter] = useState<StrategyFilter>(() => ({ ...EMPTY_FILTER, budget: parseBudget(params.get("budget")) }));
  const update = useCallback((next: StrategyFilter) => {
    setFilter(next);
    const url = new URL(window.location.href);
    const budget: BudgetTier | null = next.budget;
    if (budget === null) url.searchParams.delete("budget");
    else url.searchParams.set("budget", budget);
    window.history.replaceState(window.history.state, "", url);
  }, []);
  return { filter, update };
}

/** The open strategy lives in ?s=: opening pushes history (Back closes), closing replaces it. */
function useOpenStrategy() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const openId = params.get(OPEN_PARAM);
  const go = useCallback(
    (id: string | null, push: boolean) => {
      const url = new URL(window.location.href);
      if (id === null) url.searchParams.delete(OPEN_PARAM);
      else url.searchParams.set(OPEN_PARAM, id);
      const href = `${pathname}${url.search}`;
      if (push) router.push(href, { scroll: false });
      else router.replace(href, { scroll: false });
    },
    [pathname, router],
  );
  const open = useCallback((id: string) => go(id, true), [go]);
  const close = useCallback(() => go(null, false), [go]);
  return { openId, open, close };
}

const LEGEND =
  "Strategies live in Farm because each one is a way to farm maps. The % is how the prices of a strategy's drops moved over 7 days on poe.ninja — " +
  "a price move, not profit per hour: drop rates are unknown, so no Div/hour is shown. Budget, Build and Complexity are our ratings against a fixed scale; " +
  "hover a bar for the scale and the reason. Cards stay drafts until reviewed.";

function examples(update: (f: StrategyFilter) => void): HeaderExample[] {
  return [
    { label: "Omen farming", onClick: () => update({ ...EMPTY_FILTER, yieldQuery: "Omen" }), title: "strategies that drop Omens" },
    { label: "≤ League start", onClick: () => update({ ...EMPTY_FILTER, budget: "league_start" }), title: "strategies you can run on a fresh-league budget" },
    { label: "Breach", onClick: () => update({ ...EMPTY_FILTER, mechanics: new Set<Mechanic>(["breach"]) }), title: "Breach strategies only" },
  ];
}

function UnknownStrategy({ id, onDismiss }: { id: string; onDismiss: () => void }) {
  return (
    <p role="alert" className="flex flex-wrap items-center gap-2 rounded-md border border-amber-400/40 bg-amber-400/10 px-3 py-1.5 text-sm text-amber-200">
      This link points to a strategy that no longer exists ({id}).
      <Button variant="ghost" size="sm" onClick={onDismiss}>
        Dismiss
      </Button>
    </p>
  );
}

function Board({ data, shown, onOpen }: { data: StrategiesResponse; shown: readonly StrategyView[]; onOpen: (id: string) => void }) {
  if (shown.length === 0) {
    return <EmptyState icon={<MapIcon className="h-5 w-5" />} sentence="No strategy matches these filters — widen the budget or clear a mechanic." />;
  }
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,330px),1fr))] gap-3">
      {shown.map((s) => (
        <StrategyCard key={s.id} strategy={s} exPerDiv={data.exPerDiv} onOpen={onOpen} />
      ))}
    </div>
  );
}

/** Farm › Strategies: one card per way to farm, filterable by the mechanic heat strip, each opening its full setup. */
export function StrategiesTool() {
  const { data, error, reload } = useStrategies();
  const { filter, update } = useFilter();
  const [sort, setSort] = useState<StrategySort>("hot");
  const { openId, open, close } = useOpenStrategy();
  const all = useMemo(() => data?.strategies ?? [], [data]);
  const shown = useMemo(() => sortStrategies(filterStrategies(all, filter), sort), [all, filter, sort]);
  const opened = openId === null ? null : (all.find((s) => s.id === openId) ?? null);
  const hottest = sortStrategies(shown, "hot")[0] ?? null;
  return (
    <section className="grid gap-3">
      <PageHeader
        title="Farm strategies"
        purpose="Pick a way to farm maps: its setup, and what its drops sell for today."
        legend={LEGEND}
        art={TAB_ICONS.farm.src}
        examples={examples(update)}
        action={
          <Button variant="primary" disabled={!hottest} onClick={() => hottest && open(hottest.id)}>
            Open the hottest
          </Button>
        }
      />
      {error && <p role="alert" className="text-sm text-bad">Strategies unavailable — {error}</p>}
      {!data && !error && <p className="text-sm text-neutral-400">Loading…</p>}
      {data && openId !== null && !opened && <UnknownStrategy id={openId} onDismiss={close} />}
      {data && (
        <>
          <StrategyFilters
            mechanics={data.mechanics}
            artOf={(m) => mechanicArt(m, all)}
            yieldNames={yieldNames(all)}
            filter={filter}
            onChange={update}
            sort={sort}
            onSort={setSort}
          />
          <div className="flex flex-wrap items-center gap-2">
            <ProvenanceChip label="Price" source="poe.ninja (GGG exchange)" at={data.pricesFetchedAt} warnAfterMin={180} title={`league ${data.computedLeague}`} />
            <span className="text-xs text-neutral-400">{shown.length === all.length ? `${all.length} strategies` : `${shown.length} of ${all.length} strategies`}</span>
            <Button variant="ghost" size="sm" onClick={reload} aria-label="Refresh strategy prices">
              <RefreshCw aria-hidden className="h-4 w-4" />
            </Button>
          </div>
          <Board data={data} shown={shown} onOpen={open} />
        </>
      )}
      {data && opened && (
        <Drawer title={opened.title} onClose={close}>
          <StrategyDetail strategy={opened} data={data} />
        </Drawer>
      )}
    </section>
  );
}
