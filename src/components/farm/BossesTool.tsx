"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, TriangleAlert } from "lucide-react";
import { assertOk, describeError, warnOnFailure } from "../../lib/clientWarn";
import { farmResponseSchema, type FarmResponse } from "../../lib/farmContract";
import type { BossView, TierResult } from "../../lib/tools/bossEvContract";
import { useVisiblePoll } from "../../lib/useVisiblePoll";
import { TAB_ICONS } from "../shell/tabIcons";
import { Button } from "../ui/Button";
import { detailRowId } from "../ui/DataTable";
import { PageHeader, type HeaderExample } from "../ui/PageHeader";
import { ProvenanceChip } from "../ui/ProvenanceChip";
import { BossDetail } from "./BossDetail";
import { BossTable } from "./BossTable";

// poe.ninja refreshes hourly; a quarter-hour poll keeps ages honest without hammering the route.
const POLL_MS = 15 * 60_000;
const ROUTE = "/api/farm";
const DETAIL_PREFIX = "boss-detail";
// Example chips: two well-known pinnacle fights, shown only when the curated tables carry them.
const EXAMPLE_IDS = ["arbiter-of-ash", "xesht"] as const;

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
        warnOnFailure("[farm] bosses")(e);
        setError(describeError(e));
      });
  }, []);
  useVisiblePoll(load, POLL_MS);
  return { data, error, reload: load };
}

/** One boss open at a time; opening one scrolls its detail into view. */
function useExpansion() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [scrollTo, setScrollTo] = useState<string | null>(null);
  const [tierByBoss, setTierByBoss] = useState<Record<string, string>>({});
  useEffect(() => {
    if (scrollTo === null) return;
    document.getElementById(detailRowId(DETAIL_PREFIX, scrollTo))?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    setScrollTo(null);
  }, [scrollTo]);
  const toggle = (id: string): void => setExpandedId((open) => (open === id ? null : id));
  const open = (id: string): void => {
    setExpandedId(id);
    setScrollTo(id);
  };
  const tierOf = (boss: BossView): TierResult => {
    const first = boss.tiers[0];
    if (!first) throw new Error(`boss ${boss.id} has no tiers`);
    return boss.tiers.find((t) => t.tierId === tierByBoss[boss.id]) ?? first;
  };
  const setTier = (bossId: string, tierId: string): void => setTierByBoss((prev) => ({ ...prev, [bossId]: tierId }));
  return { expandedId, toggle, open, tierOf, setTier };
}

const LEGEND =
  "Entry at the cheaper of buy or craft; floor = priced loot on most kills, chase = rarer drops. " +
  "Rates are community samples at best, so every verdict resting on one stays amber. Unpriced drops are left out, never counted as 0. " +
  "No Div/hour: that needs your own kills per hour, which nothing here measures.";

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

/** One provenance line for the whole table: where prices and loot tables come from, and how fresh. */
function DataLine({ data, onRefresh }: { data: FarmResponse; onRefresh: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ProvenanceChip label="Price" source="poe.ninja (GGG exchange)" at={data.pricesFetchedAt} warnAfterMin={180} title={`league ${data.computedLeague}`} />
      <ProvenanceChip
        label="Uniques"
        source="poe2scout"
        title={data.scoutAgeHours == null ? "no poe2scout prices yet" : `cheapest listing, any roll; ${Math.round(data.scoutAgeHours)} h old`}
      />
      <ProvenanceChip label="Loot tables" source={`curated for ${data.patch}`} title={`access chains and drop lists last checked ${data.dataAsOf}`} />
      {!data.rates && <span className="text-xs text-amber-300">no exchange rate yet — small amounts shown in div</span>}
      <Button variant="ghost" size="sm" onClick={onRefresh} aria-label="Refresh boss prices">
        <RefreshCw aria-hidden className="h-4 w-4" />
      </Button>
    </div>
  );
}

function examplesOf(data: FarmResponse | null, open: (id: string) => void): HeaderExample[] {
  if (!data) return [];
  return EXAMPLE_IDS.flatMap((id) => {
    const boss = data.bosses.find((b) => b.id === id);
    return boss ? [{ label: boss.name, onClick: () => open(id), title: `Open ${boss.name}: entry and drops` }] : [];
  });
}

/** Farm › Bosses: pinnacle bosses by net per kill, each row opening its entry and drops inline. */
export function BossesTool() {
  const { data, error, reload } = useFarm();
  const { expandedId, toggle, open, tierOf, setTier } = useExpansion();
  const exPerDiv = data?.rates?.exaltPerDivine ?? null;
  const best = data?.bosses[0] ?? null;
  return (
    <section className="grid grid-cols-1 gap-3">
      <PageHeader
        title="Pinnacle bosses"
        purpose="See which pinnacle boss pays per kill today: entry cost against what drops."
        legend={LEGEND}
        art={TAB_ICONS.farm.src}
        examples={examplesOf(data, open)}
        action={
          <Button variant="primary" disabled={!best} onClick={() => best && open(best.id)}>
            Open the best boss
          </Button>
        }
      />
      {error && <p role="alert" className="text-sm text-bad">Boss data unavailable — {error}</p>}
      {!data && !error && <p className="text-sm text-neutral-400">Loading…</p>}
      {data && (
        <>
          <DataLine data={data} onRefresh={reload} />
          <PatchWarning warning={data.patchWarning} />
          <BossTable
            bosses={data.bosses}
            expandedId={expandedId}
            onToggle={toggle}
            renderDetail={(id) => <InlineDetail data={data} bossId={id} tierOf={tierOf} setTier={setTier} exPerDiv={exPerDiv ?? 0} />}
            exPerDiv={exPerDiv}
          />
        </>
      )}
    </section>
  );
}

interface DetailProps {
  data: FarmResponse;
  bossId: string;
  tierOf: (boss: BossView) => TierResult;
  setTier: (bossId: string, tierId: string) => void;
  exPerDiv: number;
}

/** The open row's detail; a row without a matching detail view is a server contract break. */
function InlineDetail({ data, bossId, tierOf, setTier, exPerDiv }: DetailProps) {
  const boss = data.details.find((b) => b.id === bossId);
  if (!boss) throw new Error(`farm: no detail view for boss ${bossId}`);
  return <BossDetail boss={boss} tier={tierOf(boss)} onTier={(id) => setTier(boss.id, id)} exPerDiv={exPerDiv} pricesAt={data.pricesFetchedAt} />;
}
