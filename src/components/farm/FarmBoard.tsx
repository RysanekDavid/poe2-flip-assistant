"use client";

import { useCallback, useState } from "react";
import { RefreshCw, TriangleAlert } from "lucide-react";
import { assertOk, describeError, warnOnFailure } from "../../lib/clientWarn";
import { farmResponseSchema, type FarmResponse } from "../../lib/farmContract";
import type { BossView, TierResult } from "../../lib/tools/bossEvContract";
import { timestampAgeMs } from "../../lib/sqliteTime";
import { useVisiblePoll } from "../../lib/useVisiblePoll";
import { Button } from "../ui/Button";
import { PageHeader } from "../ui/PageHeader";
import { StaleBadge } from "../ui/StaleBadge";
import { BossDetail } from "./BossDetail";
import { BossTable } from "./BossTable";
import { MechanicStrip } from "./MechanicStrip";

// poe.ninja refreshes hourly; a quarter-hour poll keeps ages honest without hammering the route.
const POLL_MS = 15 * 60_000;
const ROUTE = "/api/farm";

function useFarm() {
  const [data, setData] = useState<FarmResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    fetch(ROUTE, { cache: "no-store" })
      .then(async (r) => {
        setData(farmResponseSchema.parse(await assertOk(r, ROUTE).json()));
        setError(null);
      })
      .catch((e: unknown) => {
        warnOnFailure("[farm] board")(e);
        setError(describeError(e));
      });
  }, []);
  useVisiblePoll(load, POLL_MS);
  return { data, error, reload: load };
}

function useSelection(details: readonly BossView[], firstRowId: string | null) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tierByBoss, setTierByBoss] = useState<Record<string, string>>({});
  const selected = details.find((b) => b.id === (selectedId ?? firstRowId)) ?? null;
  const tierOf = (boss: BossView): TierResult => {
    const first = boss.tiers[0];
    if (!first) throw new Error(`boss ${boss.id} has no tiers`);
    return boss.tiers.find((t) => t.tierId === tierByBoss[boss.id]) ?? first;
  };
  const setTier = (bossId: string, tierId: string): void => setTierByBoss((prev) => ({ ...prev, [bossId]: tierId }));
  return { selected, tierOf, select: setSelectedId, setTier };
}

const LEGEND =
  "Mechanics: basket heat (7d momentum × value × liquidity) of what each activity drops — it is not Div/hour. " +
  "Bosses: entry at the cheaper of buy or craft; floor = priced loot on most kills, chase = rarer drops; " +
  "rates are community samples at best, so every verdict resting on one stays amber. Unpriced drops are left out, never counted as 0.";

const minutesSince = (stamp: string | null): number | null => (stamp == null ? null : timestampAgeMs(stamp) / 60_000);

/** League, market ages and the curated tables' patch — one quiet line under the header. */
function DataLine({ data }: { data: FarmResponse }) {
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-400">
      <span title="league the prices come from">{data.computedLeague}</span>
      <span className="inline-flex items-center gap-1">
        exchange <StaleBadge ageMin={minutesSince(data.pricesFetchedAt)} warnAfterMin={180} />
      </span>
      <span className="inline-flex items-center gap-1" title="poe2scout unique prices (cheapest listing, any roll)">
        uniques <StaleBadge ageMin={data.scoutAgeHours == null ? null : data.scoutAgeHours * 60} warnAfterMin={48 * 60} />
      </span>
      <span title="patch the curated access chains and loot tables describe; date they were last checked">
        tables {data.patch} · checked {data.dataAsOf}
      </span>
      {!data.rates && <span className="text-amber-300">no exchange rate yet — small amounts shown in div</span>}
    </p>
  );
}

function PatchWarning({ warning }: { warning: FarmResponse["patchWarning"] }) {
  if (!warning) return null;
  if (warning.level === "recheck") return <p className="text-sm text-neutral-400">{warning.text}</p>;
  return (
    <p role="alert" className="flex items-center gap-2 rounded-md border border-amber-400/40 bg-amber-400/10 px-3 py-1.5 text-sm text-amber-200">
      <TriangleAlert aria-hidden className="h-4 w-4 shrink-0" />
      {warning.text}
    </p>
  );
}

/** Farm tab: mechanic baskets by 7d heat, then pinnacle bosses by net per kill with a detail panel. */
export function FarmBoard() {
  const { data, error, reload } = useFarm();
  const { selected, tierOf, select, setTier } = useSelection(data?.details ?? [], data?.bosses[0]?.id ?? null);
  const exPerDiv = data?.rates?.exaltPerDivine ?? null;
  return (
    <section className="grid gap-3">
      <PageHeader
        title="What to farm now"
        purpose="Mechanic baskets by 7d heat, pinnacle bosses by net per kill."
        legend={LEGEND}
        action={
          <Button variant="ghost" size="sm" onClick={reload} aria-label="Refresh farm data">
            <RefreshCw aria-hidden className="h-4 w-4" />
          </Button>
        }
      />
      {error && <p role="alert" className="text-sm text-bad">Farm data unavailable — {error}</p>}
      {!data && !error && <p className="text-sm text-neutral-400">Loading…</p>}
      {data && (
        <>
          <DataLine data={data} />
          <PatchWarning warning={data.patchWarning} />
          <MechanicStrip mechanics={data.mechanics} />
          <BossTable bosses={data.bosses} selectedId={selected?.id ?? null} onSelect={select} exPerDiv={exPerDiv} />
          {selected && <BossDetail boss={selected} tier={tierOf(selected)} onTier={(id) => setTier(selected.id, id)} exPerDiv={exPerDiv ?? 0} />}
        </>
      )}
    </section>
  );
}
