"use client";

import { useCallback, useState } from "react";
import { RefreshCw, TriangleAlert } from "lucide-react";
import { assertOk, describeError, warnOnFailure } from "../../../lib/clientWarn";
import { bossEvResponseSchema, type BossEvResponse, type BossView, type TierResult } from "../../../lib/tools/bossEvContract";
import { timestampAgeMs } from "../../../lib/sqliteTime";
import { useVisiblePoll } from "../../../lib/useVisiblePoll";
import { BossDetail } from "./BossDetail";
import { BossTable } from "./BossTable";
import { ageTone, fmtAge } from "./LootRow";

// poe.ninja refreshes hourly; a quarter-hour poll keeps ages honest without hammering the route.
const POLL_MS = 15 * 60_000;
const ROUTE = "/api/tools/boss-ev";

function useBossEv() {
  const [data, setData] = useState<BossEvResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    fetch(ROUTE, { cache: "no-store" })
      .then(async (r) => {
        setData(bossEvResponseSchema.parse(await assertOk(r, ROUTE).json()));
        setError(null);
      })
      .catch((e: unknown) => {
        warnOnFailure("[tools] boss-ev")(e);
        setError(describeError(e));
      });
  }, []);
  useVisiblePoll(load, POLL_MS);
  return { data, error, reload: load };
}

function hoursSince(stamp: string | null): number | null {
  return stamp == null ? null : timestampAgeMs(stamp) / 3_600_000;
}

/** "data as of" strip: league, market ages, rate source, and which patch the tables describe. */
function DataStrip({ data }: { data: BossEvResponse }) {
  const pricesAge = hoursSince(data.pricesFetchedAt);
  const ratesAge = hoursSince(data.rates?.fetchedAt ?? null);
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-500">
      <span title="league the prices come from">{data.computedLeague}</span>
      <span title="newest poe.ninja exchange snapshot for this league; each price also shows its own age">
        exchange <span className={ageTone(pricesAge)}>{fmtAge(pricesAge)}</span>
      </span>
      <span title="poe2scout unique prices (cheapest listing, any roll)">
        uniques <span className={ageTone(data.scoutAgeHours)}>{fmtAge(data.scoutAgeHours)}</span>
      </span>
      <span title="Divine ↔ Exalted rate used to show small amounts in ex">
        {data.rates ? (
          <>
            1 div = {Math.round(data.rates.exaltPerDivine)} ex · {data.rates.source}{" "}
            <span className={ageTone(ratesAge)}>{fmtAge(ratesAge)}</span>
          </>
        ) : (
          <span className="text-bad">rates unavailable — amounts in div</span>
        )}
      </span>
      <span title="patch the curated access chains and loot tables describe; date they were last checked">
        tables {data.patch} · curated {data.dataAsOf}
      </span>
    </div>
  );
}

function useSelection(bosses: readonly BossView[]) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tierByBoss, setTierByBoss] = useState<Record<string, string>>({});
  const tierOf = (boss: BossView): TierResult => {
    const first = boss.tiers[0];
    if (!first) throw new Error(`boss ${boss.id} has no tiers`);
    return boss.tiers.find((t) => t.tierId === tierByBoss[boss.id]) ?? first;
  };
  const selected = bosses.find((b) => b.id === selectedId) ?? bosses[0] ?? null;
  const setTier = (bossId: string, tierId: string): void => setTierByBoss((prev) => ({ ...prev, [bossId]: tierId }));
  return { selected, tierOf, select: setSelectedId, setTier };
}

/** Pinnacle boss EV: break-even drop rate first, sourced EV second. Read-only. */
export function BossEvTool() {
  const { data, error, reload } = useBossEv();
  const { selected, tierOf, select, setTier } = useSelection(data?.bosses ?? []);
  const exPerDiv = data?.rates?.exaltPerDivine ?? 0;
  return (
    <section className="grid gap-3">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-lg font-semibold text-neutral-100">Boss EV</h2>
        <span className="text-xs text-neutral-500" title="EV counts only priced drops with a sourced rate; most chase rates are community estimates">
          break-even first — the chase-drop rates are guesses
        </span>
        <button onClick={reload} title="refresh now" className="ml-auto text-neutral-500 hover:text-neutral-200">
          <RefreshCw className="h-4 w-4" />
        </button>
      </header>
      {error && <p role="alert" className="text-xs text-bad">boss EV unavailable — {error}</p>}
      {!data && !error && <p className="text-xs text-neutral-500">loading…</p>}
      {data && (
        <>
          <DataStrip data={data} />
          {data.patchWarning?.level === "obsolete" && (
            <p role="alert" className="flex items-center gap-2 rounded border border-warn/40 bg-warn/10 px-3 py-1.5 text-xs text-warn">
              <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
              {data.patchWarning.text}
            </p>
          )}
          {data.patchWarning?.level === "recheck" && <p className="text-xs text-neutral-500">{data.patchWarning.text}</p>}
          <BossTable bosses={data.bosses} tierOf={tierOf} selectedId={selected?.id ?? null} onSelect={select} exPerDiv={exPerDiv} />
          {selected && <BossDetail boss={selected} tier={tierOf(selected)} onTier={(id) => setTier(selected.id, id)} exPerDiv={exPerDiv} />}
        </>
      )}
    </section>
  );
}
