"use client";

import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Map as MapIcon, RefreshCw } from "lucide-react";
import type { BudgetTier } from "../../../core/strategies/schema";
import { assertOk, describeError, warnOnFailure } from "../../../lib/clientWarn";
import { timestampAgeMs } from "../../../lib/sqliteTime";
import { strategiesResponseSchema, type StrategiesResponse } from "../../../lib/strategiesContract";
import { useVisiblePoll } from "../../../lib/useVisiblePoll";
import { ToolChips } from "../../shell/ToolChips";
import { Button } from "../../ui/Button";
import { EmptyState } from "../../ui/EmptyState";
import { PageHeader } from "../../ui/PageHeader";
import { StaleBadge } from "../../ui/StaleBadge";
import { StrategyCard } from "./StrategyCard";
import { StrategyFilters } from "./StrategyFilters";
import { filterStrategies, parseBudget, presentMechanics, yieldNames, type StrategyFilter } from "./strategiesView";

// Prices come from poe.ninja (hourly); the curated facts change only with a release.
const POLL_MS = 15 * 60_000;
const ROUTE = "/api/farm/strategies";

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
  const [filter, setFilter] = useState<StrategyFilter>(() => ({ mechanics: new Set(), budget: parseBudget(params.get("budget")), yieldQuery: "" }));
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

function DataLine({ data }: { data: StrategiesResponse }) {
  const versions = [...new Set(data.strategies.map((s) => s.patch.verified_against))].join(", ");
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-400">
      <span title="league the prices and trade links use">{data.computedLeague}</span>
      <span className="inline-flex items-center gap-1">
        prices <StaleBadge ageMin={data.pricesFetchedAt === null ? null : timestampAgeMs(data.pricesFetchedAt) / 60_000} warnAfterMin={180} />
      </span>
      <span title="patch every fact on these cards was checked against">verified {versions}</span>
      <span>unmarked facts: checked against poe2db / trade2 data</span>
      {data.exPerDiv === null && <span className="text-amber-300">no exchange rate yet — small prices shown in div</span>}
    </p>
  );
}

/** Farm → Strategies: curated atlas setups per mechanic, filterable, with live-priced yield baskets. */
export function StrategiesTool() {
  const { data, error, reload } = useStrategies();
  const { filter, update } = useFilter();
  const all = useMemo(() => data?.strategies ?? [], [data]);
  const shown = useMemo(() => filterStrategies(all, filter), [all, filter]);
  return (
    <section className="grid gap-3">
      <PageHeader
        title="Farm strategies"
        purpose="Atlas setups per mechanic: master, notables, tablets, waystones and what the basket sells for."
        legend="Every fact carries its evidence grade — hover a chip for its sources. Amber means unverified or conflicting: test it in game before you spend on it. Cards are drafts until reviewed."
        action={
          <>
            <ToolChips tab="farm" />
            <Button variant="ghost" size="sm" onClick={reload} aria-label="Refresh strategy prices">
              <RefreshCw aria-hidden className="h-4 w-4" />
            </Button>
          </>
        }
      />
      {error && <p role="alert" className="text-sm text-bad">Strategies unavailable — {error}</p>}
      {!data && !error && <p className="text-sm text-neutral-400">Loading…</p>}
      {data && (
        <>
          <DataLine data={data} />
          <StrategyFilters mechanics={presentMechanics(all)} yieldNames={yieldNames(all)} filter={filter} onChange={update} />
          {shown.length === 0 ? (
            <EmptyState icon={<MapIcon className="h-5 w-5" />} sentence="No strategy matches these filters — widen the budget or clear a mechanic." />
          ) : (
            shown.map((s) => <StrategyCard key={s.id} strategy={s} exPerDiv={data.exPerDiv} league={data.computedLeague} />)
          )}
        </>
      )}
    </section>
  );
}
