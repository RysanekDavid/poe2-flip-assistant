"use client";

import { useMemo } from "react";
import { ListChecks, RefreshCw } from "lucide-react";
import type { AnyStrategyView, StrategiesResponse } from "../../../lib/strategiesContract";
import { Button } from "../../ui/Button";
import { Drawer } from "../../ui/Drawer";
import { EmptyState } from "../../ui/EmptyState";
import { PageHeader } from "../../ui/PageHeader";
import { ProvenanceChip } from "../../ui/ProvenanceChip";
import { LiquidateCard, RollSellCard, TradeMethodCard } from "./KindCards";
import { LiquidateDetail, RollSellDetail, TradeMethodDetail } from "./KindDetail";
import { useOpenStrategy, useStrategies } from "./useStrategyBoard";

type NonFarm = Exclude<AnyStrategyView, { kind: "farm" }>;
type NonFarmKind = NonFarm["kind"];

function Card({ strategy, exPerDiv, onOpen }: { strategy: NonFarm; exPerDiv: number | null; onOpen: (id: string) => void }) {
  switch (strategy.kind) {
    case "roll_and_sell":
      return <RollSellCard strategy={strategy} exPerDiv={exPerDiv} onOpen={onOpen} />;
    case "trade":
      return <TradeMethodCard strategy={strategy} exPerDiv={exPerDiv} onOpen={onOpen} />;
    case "liquidate":
      return <LiquidateCard strategy={strategy} exPerDiv={exPerDiv} onOpen={onOpen} />;
  }
}

function Detail({ strategy, data }: { strategy: NonFarm; data: StrategiesResponse }) {
  switch (strategy.kind) {
    case "roll_and_sell":
      return <RollSellDetail strategy={strategy} data={data} />;
    case "trade":
      return <TradeMethodDetail strategy={strategy} data={data} />;
    case "liquidate":
      return <LiquidateDetail strategy={strategy} data={data} />;
  }
}

function isKind(kinds: readonly NonFarmKind[]) {
  return (view: AnyStrategyView): view is NonFarm => view.kind !== "farm" && kinds.includes(view.kind);
}

interface KindBoardProps {
  /** Which kinds this tool lists. */
  kinds: readonly NonFarmKind[];
  /** Log prefix for a failed load. */
  label: string;
  title: string;
  purpose: string;
  legend: string;
  art: string;
  noun: string;
}

/** A tool page of strategy cards of some kinds: Craft › Roll & sell and Trade › Methods. */
export function KindBoard({ kinds, label, title, purpose, legend, art, noun }: KindBoardProps) {
  const { data, error, reload } = useStrategies(label);
  const { openId, open, close } = useOpenStrategy();
  const shown = useMemo(() => (data?.strategies ?? []).filter(isKind(kinds)), [data, kinds]);
  const opened = openId === null ? null : (shown.find((s) => s.id === openId) ?? null);
  return (
    <section className="grid gap-3">
      <PageHeader title={title} purpose={purpose} legend={legend} art={art} />
      {error && <p role="alert" className="text-sm text-bad">{`${title} unavailable — ${error}`}</p>}
      {!data && !error && <p className="text-sm text-neutral-400">Loading…</p>}
      {data && openId !== null && !opened && (
        <p role="alert" className="flex flex-wrap items-center gap-2 rounded-md border border-amber-400/40 bg-amber-400/10 px-3 py-1.5 text-sm text-amber-200">
          This link points to a {noun} that is not here ({openId}).
          <Button variant="ghost" size="sm" onClick={close}>
            Dismiss
          </Button>
        </p>
      )}
      {data && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <ProvenanceChip label="Price" source="poe.ninja (GGG exchange)" at={data.pricesFetchedAt} warnAfterMin={180} title={`league ${data.computedLeague}`} />
            <span className="text-xs text-neutral-400">{`${shown.length} ${noun}s`}</span>
            {data.exPerDiv === null && <span className="text-xs text-amber-300">no exchange rate yet — small prices shown in div</span>}
            <Button variant="ghost" size="sm" onClick={reload} aria-label={`Refresh ${noun} prices`}>
              <RefreshCw aria-hidden className="h-4 w-4" />
            </Button>
          </div>
          {shown.length === 0 ? (
            <EmptyState icon={<ListChecks className="h-5 w-5" />} sentence={`No ${noun} is curated yet.`} />
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,330px),1fr))] gap-3">
              {shown.map((s) => (
                <Card key={s.id} strategy={s} exPerDiv={data.exPerDiv} onOpen={open} />
              ))}
            </div>
          )}
        </>
      )}
      {data && opened && (
        <Drawer title={opened.title} onClose={close}>
          <Detail strategy={opened} data={data} />
        </Drawer>
      )}
    </section>
  );
}
