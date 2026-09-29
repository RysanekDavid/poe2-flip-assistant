"use client";

import { ExternalLink } from "lucide-react";
import { fmtDiv, fmtRate } from "../../core/tools/bossEv/headline";
import { sortLoot } from "../../core/tools/bossEv/rowText";
import { tradeSourceLabel, tradeSourceTitle } from "../../core/tools/bossEv/tradeText";
import type { LootLineView } from "../../lib/tools/bossEvContract";
import { DataTable, type Column } from "../ui/DataTable";
import { ItemArt } from "../ui/ItemArt";
import { PriceChip } from "../ui/PriceChip";
import { artSrc } from "./farmArt";
import { CONFIDENCE_HINT, LineageBadge } from "./farmView";

function DropCell({ line }: { line: LootLineView }) {
  return (
    <span className="flex items-center gap-2">
      <ItemArt src={artSrc(line.icon)} size={8} />
      <span className="text-neutral-100">{line.name}</span>
      {line.lineage && <LineageBadge />}
    </span>
  );
}

/** A pool pick: its cheapest member (what EV counts), with the spread and coverage in the title. */
function PoolPrice({ line, exPerDiv }: { line: LootLineView; exPerDiv: number | null }) {
  const pool = line.pool;
  if (!pool) return null;
  const rate = exPerDiv ?? 0;
  const missing = pool.unpricedMembers.length > 0 ? `\nnot on poe.ninja: ${pool.unpricedMembers.join(", ")}` : "";
  const title = `at least one random pick, weights unpublished — EV and floor count one, at the cheapest member\nmin ${fmtDiv(pool.minDiv, rate)} · median ${fmtDiv(pool.medianDiv, rate)} · max ${fmtDiv(pool.maxDiv, rate)}\n${pool.priced} of ${pool.total} members priced${missing}`;
  return (
    <span className="inline-flex items-center gap-1 text-sm tabular-nums text-neutral-100" title={title}>
      {fmtDiv(pool.minDiv, rate)} – {fmtDiv(pool.maxDiv, rate)}
    </span>
  );
}

function PriceCell({ line, exPerDiv }: { line: LootLineView; exPerDiv: number | null }) {
  if (line.pool) return <PoolPrice line={line} exPerDiv={exPerDiv} />;
  if (!line.price) {
    return (
      <span className="text-sm text-neutral-400" title={`${line.unpricedReason ?? "no market price"} — left out of EV, never counted as 0`}>
        unpriced
      </span>
    );
  }
  const chip = <PriceChip div={line.price.div} exPerDiv={exPerDiv} source={line.price.source} ageMin={line.price.ageHours == null ? undefined : line.price.ageHours * 60} />;
  if (line.price.source !== "trade") return chip;
  // a trade2 fallback is an asking price scout could not give: say so on the row, not only on hover
  return (
    <span className="inline-flex flex-col items-end" title={tradeSourceTitle(line.price)}>
      {chip}
      <span className="text-xs text-neutral-400">{tradeSourceLabel(line.price)}</span>
    </span>
  );
}

/** The sourced rate, or a rarity label when no number is published; both sources and confidence on hover. */
function RateCell({ line }: { line: LootLineView }) {
  const unknown = line.rate.kind === "unknown";
  const text = unknown && line.rarity ? line.rarity.label : fmtRate(line.rate);
  const weak = line.confidence === "conflicting" || line.confidence === "unverified";
  const rateLine = unknown ? "no published rate" : `per-kill rate as ${line.source.title} states it`;
  const rarityLine = line.rarity ? `\n${line.rarity.source.title} labels it "${line.rarity.label}"` : "";
  const title = `${rateLine}${rarityLine}\n${CONFIDENCE_HINT[line.confidence]}`;
  return (
    <span className={`text-sm tabular-nums ${unknown ? "text-neutral-400" : "text-neutral-200"}`} title={title}>
      {text}
      {weak && <span className="text-amber-300"> ?</span>}
    </span>
  );
}

function evText(line: LootLineView, exPerDiv: number): { text: string; title: string } {
  if (line.rate.kind === "range" && line.evDiv != null && line.evHighDiv != null) {
    return { text: `${fmtDiv(line.evDiv, exPerDiv)} – ${fmtDiv(line.evHighDiv, exPerDiv)}`, title: "range rate: the low end counts toward EV, the high end is the upside" };
  }
  if (line.evDiv != null) return { text: fmtDiv(line.evDiv, exPerDiv), title: "price × rate, per kill" };
  return { text: "—", title: line.price == null ? "no price — excluded from EV" : "no known rate — excluded from EV" };
}

const host = (url: string): string => new URL(url).hostname.replace(/^www\./, "");

function columns(exPerDiv: number | null): Column<LootLineView>[] {
  return [
    { key: "name", header: "Drop", cell: (l) => <DropCell line={l} /> },
    { key: "price", header: "Price", align: "right", tip: "poe.ninja for exchange items, poe2scout for uniques and lineage gems, trade listings for uniques poe2scout has no price for; unpriced drops are left out of EV, never counted as 0", cell: (l) => <PriceCell line={l} exPerDiv={exPerDiv} /> },
    { key: "rate", header: "Rate", align: "right", tip: "per-kill drop rate as the cited source states it, or its rarity label when it gives no number. ? = sources disagree or the rate is unverified", cell: (l) => <RateCell line={l} /> },
    {
      key: "ev",
      header: "EV / kill",
      align: "right",
      cell: (l) => {
        const ev = evText(l, exPerDiv ?? 0);
        return (
          <span className="tabular-nums" title={ev.title}>
            {ev.text}
          </span>
        );
      },
    },
    {
      key: "src",
      header: "Source",
      cell: (l) => (
        <a href={l.source.url} target="_blank" rel="noreferrer" title={`${l.source.title} — checked ${l.source.accessed}`} className="inline-flex items-center gap-1 text-xs text-neutral-400 hover:text-neutral-100">
          <ExternalLink aria-hidden className="h-3 w-3" />
          {host(l.source.url)}
        </a>
      ),
    },
  ];
}

/** Every drop of one tier with art, price, rate or rarity, EV share and citation — by EV, unrated below. */
export function LootTable({ loot, exPerDiv }: { loot: LootLineView[]; exPerDiv: number | null }) {
  return <DataTable columns={columns(exPerDiv)} rows={sortLoot(loot)} rowKey={(l) => l.name} emptyState={<p className="text-sm text-neutral-400">No drops listed.</p>} />;
}
