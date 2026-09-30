"use client";

import { useState } from "react";
import { ChevronDown, Gem } from "lucide-react";
import type { Budget, RisingSection as Section, RisingUnique } from "../../../lib/opportunitiesContract";
import { DataTable, type Column } from "../../ui/DataTable";
import { EmptyState } from "../../ui/EmptyState";
import { ItemArt } from "../../ui/ItemArt";
import { Panel } from "../../ui/Panel";
import { PriceChip } from "../../ui/PriceChip";
import { Sparkline } from "../../ui/Sparkline";
import { InfoTip } from "../../ui/Tooltip";
import { changeTone, fmtChange } from "../prices/pricesView";
import { LiveListings } from "./LiveListings";
import { ageSince, fmtDiv } from "./opportunityFormat";

const ABOUT =
  "Uniques worth 1 Div or more whose price rose while their listing count fell, across poe2scout's recent points (older " +
  "half vs newer half, by median). A trend needs at least 4 points with the newest under 48 h old; anything thinner or older " +
  "is left out. Fewer listings can mean sales or delistings, never proof of either. Open a row for its cheapest live listings.";

function ItemCell({ r, open }: { r: RisingUnique; open: boolean }) {
  return (
    <span className="flex min-w-[10rem] items-center gap-2">
      <ChevronDown aria-hidden className={`h-4 w-4 shrink-0 text-neutral-400 transition-transform ${open ? "rotate-180 text-amber-300" : ""}`} />
      <ItemArt src={r.icon} size={8} />
      <span className="min-w-0 leading-tight">
        <span className="block text-sm font-medium text-neutral-100">{r.name}</span>
        {r.base !== "" && <span className="block text-xs text-neutral-400">{r.base}</span>}
      </span>
    </span>
  );
}

function TrendCell({ r }: { r: RisingUnique }) {
  const tip = `${r.points} poe2scout points, newest ${ageSince(r.newestAt)} ago\nlisted ${r.listedThen} → ${r.listedNow} (median of each half): supply, not sales`;
  return (
    <span className="inline-flex flex-col items-end leading-tight" title={tip}>
      <span className="inline-flex items-center gap-1.5">
        <Sparkline data={r.spark} />
        <span className={`text-sm tabular-nums ${changeTone(r.priceChangePct)}`}>{fmtChange(r.priceChangePct)}</span>
      </span>
      <span className="text-xs tabular-nums text-neutral-400">
        listed {r.listedThen} → {r.listedNow}
      </span>
    </span>
  );
}

function columns(openId: string | null): Column<RisingUnique>[] {
  return [
    { key: "item", header: "Unique", cell: (r) => <ItemCell r={r} open={openId === r.id} /> },
    {
      key: "value",
      header: "Value",
      align: "right",
      tip: "poe2scout's cheapest listed ask, or the trade-site fallback where scout has none. An ask, not a sale.",
      cell: (r) => <PriceChip div={r.valueDiv} exPerDiv={null} source={r.valueSource === "trade" ? "trade" : "scout"} />,
    },
    { key: "trend", header: "Trend", align: "right", tip: "price change and listing count, older half → newer half of the recent points", cell: (r) => <TrendCell r={r} /> },
  ];
}

function Body({ section }: { section: Section }) {
  const [openId, setOpenId] = useState<string | null>(null);
  if (section.status === "error") {
    return (
      <p role="alert" className="text-sm text-bad">
        {section.error}
      </p>
    );
  }
  return (
    <div className="min-w-0 max-md:overflow-x-auto max-md:[&_th]:static">
      <DataTable
        columns={columns(openId)}
        rows={section.items}
        rowKey={(r) => r.id}
        tall
        onRowClick={(r) => setOpenId((cur) => (cur === r.id ? null : r.id))}
        expandedKey={openId ?? undefined}
        renderExpanded={(r) => <LiveListings name={r.name} base={r.base} />}
        detailIdPrefix="rising"
        emptyState={<EmptyState icon={<Gem className="h-5 w-5" />} sentence={section.emptyReason ?? "No rising uniques right now."} />}
      />
    </div>
  );
}

/** Rising uniques from stored poe2scout history; a row opens its cheapest live listings on demand. */
export function RisingSection({ section, budget }: { section: Section; budget: Budget }) {
  const hidden = section.status === "ok" && section.items.length > 0 ? section.overBudget : 0;
  const right = (
    <>
      {hidden > 0 && (
        <span className="text-xs text-neutral-400" title={budget.capDiv === null ? "hidden by your budget" : `hidden because they cost more than your budget (≤ ${fmtDiv(budget.capDiv)} Div)`}>
          +{hidden} over budget
        </span>
      )}
      <InfoTip tip={ABOUT} label="About rising uniques" side="bottom" align="end" />
    </>
  );
  return (
    <Panel title="Rising uniques" right={right}>
      <Body section={section} />
    </Panel>
  );
}
