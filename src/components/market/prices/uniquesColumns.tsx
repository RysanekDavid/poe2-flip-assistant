"use client";

import { ExternalLink } from "lucide-react";
import { CURRENCY_ART } from "../../../lib/currencyArt";
import { compact, fmtSmart } from "../../../lib/format";
import type { MarketUniqueItem } from "../../../lib/marketUniquesContract";
import { tradeSearchUrl } from "../../../lib/tradeLink";
import type { Column } from "../../ui/DataTable";
import { ItemArt } from "../../ui/ItemArt";
import { Sparkline } from "../../ui/Sparkline";
import { fmtAgeMin } from "../../ui/StaleBadge";
import { changeTone, fmtChange } from "./pricesView";
import { changeGapReason, valueSourceLabel } from "./uniquesView";

export interface UniquesColumnCtx {
  /** The league scout priced (the default league): trade links search there too. */
  league: string;
  exPerDiv: number;
  /** While a search spans every unique category, each row names its own. */
  categoryLabel: ((id: string) => string) | null;
}

const ageText = (iso: string): string => fmtAgeMin((Date.now() - Date.parse(iso)) / 60_000);

function ItemCell({ item, ctx }: { item: MarketUniqueItem; ctx: UniquesColumnCtx }) {
  const sub = [item.base, ctx.categoryLabel?.(item.category)].filter((s) => s !== undefined && s !== "").join(" · ");
  return (
    <span className="flex min-w-[11rem] items-center gap-2">
      <ItemArt src={item.icon} size={8} alt="" />
      <span className="min-w-0 leading-tight">
        <span className="block text-sm font-medium text-neutral-100">{item.name}</span>
        {sub !== "" && <span className="block text-xs text-neutral-500">{sub}</span>}
      </span>
    </span>
  );
}

function valueTip(item: MarketUniqueItem): string {
  if (item.valueSource === "trade") {
    return "poe2scout has no price for this unique, so it is priced from the official trade site: median of the cheapest instant-buyout listings. An asking price, not a sale.";
  }
  return "poe2scout's cheapest listed ask (outlier-guarded against its recent log), in Divine — an ask, not a sale.";
}

const fmtAmount = (n: number): string => (n >= 10_000 ? compact(n) : fmtSmart(n));

function ValueCell({ item, exPerDiv }: { item: MarketUniqueItem; exPerDiv: number }) {
  if (item.valueDiv === null) {
    return (
      <span className="text-sm text-neutral-500" title={`unpriced · ${item.unpricedReason ?? "no price"}`}>
        —
      </span>
    );
  }
  const source = valueSourceLabel(item);
  return (
    <span className="inline-flex flex-col items-end leading-tight" title={valueTip(item)}>
      <span className="inline-flex items-center gap-1 text-sm tabular-nums text-neutral-100">
        {fmtAmount(item.valueDiv)}
        <img src={CURRENCY_ART.div} alt="div" className="h-4 w-4 object-contain" />
      </span>
      <span className="inline-flex items-center gap-1 text-xs tabular-nums text-neutral-400">
        {source !== null && <span className="text-neutral-400">{source} ·</span>}
        {fmtAmount(item.valueDiv * exPerDiv)}
        <img src={CURRENCY_ART.ex} alt="ex" className="h-3.5 w-3.5 object-contain" />
      </span>
    </span>
  );
}

function AgeCell({ item }: { item: MarketUniqueItem }) {
  if (item.priceAt === null) {
    const tip = item.valueDiv === null ? "no price, so no age" : "poe2scout has no history point for this price, so its age is unknown";
    return (
      <span className="text-sm text-neutral-500" title={tip}>
        —
      </span>
    );
  }
  const who = item.valueSource === "trade" ? "trade search ran" : "poe2scout set this price";
  const age = ageText(item.priceAt);
  return (
    <span className="whitespace-nowrap text-sm tabular-nums text-neutral-300" title={`${who} ${age} ago`}>
      {age}
    </span>
  );
}

function ListingsCell({ item }: { item: MarketUniqueItem }) {
  const tip = item.valueSource === "trade" ? "instant-buyout listings the trade search saw" : "listings poe2scout counts right now — supply, not sales";
  return (
    <span className={`text-sm tabular-nums ${item.listings === null || item.listings === 0 ? "text-neutral-500" : "text-neutral-200"}`} title={tip}>
      {item.listings === null ? "—" : compact(item.listings)}
    </span>
  );
}

function ChangeCell({ item }: { item: MarketUniqueItem }) {
  const tip = item.change7d === null ? changeGapReason(item) : `poe2scout price change over the last 7 days (${item.spark7d.length} points)`;
  return (
    <span className="inline-flex items-center justify-end gap-2" title={tip}>
      {item.change7d !== null && item.spark7d.length >= 2 && <Sparkline data={item.spark7d} width={72} height={20} className="max-sm:hidden" />}
      <span className={`min-w-12 whitespace-nowrap text-right text-sm tabular-nums ${changeTone(item.change7d)}`}>{item.change7d === null ? "—" : fmtChange(item.change7d)}</span>
    </span>
  );
}

function TradeCell({ item, league }: { item: MarketUniqueItem; league: string }) {
  const query = item.base === "" ? { name: item.name } : { name: item.name, type: item.base };
  return (
    <a
      href={tradeSearchUrl(league, query)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Search ${item.name} on the trade site`}
      title={`Search ${item.name} on the trade site (${league})`}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-sky-300 hover:bg-neutral-800 hover:text-sky-200"
    >
      <ExternalLink aria-hidden className="h-4 w-4" />
    </a>
  );
}

export function uniquesColumns(ctx: UniquesColumnCtx): Column<MarketUniqueItem>[] {
  return [
    { key: "name", header: "Item", sortable: true, wrap: true, cell: (r) => <ItemCell item={r} ctx={ctx} /> },
    {
      key: "value",
      header: "Value",
      align: "right",
      sortable: true,
      tip: "poe2scout's cheapest ask in Divine, Exalted under it. \"trade listings\" = scout has no price, so the trade site's listings price it. — = no price anywhere (hover for why).",
      cell: (r) => <ValueCell item={r} exPerDiv={ctx.exPerDiv} />,
    },
    { key: "age", header: "Price age", align: "right", sortable: true, tip: "How long ago the shown price was set", cell: (r) => <AgeCell item={r} /> },
    { key: "listings", header: "Listings", align: "right", sortable: true, tip: "Listings behind the shown price — supply, not sales", cell: (r) => <ListingsCell item={r} /> },
    { key: "change", header: "7 days", align: "right", sortable: true, tip: "poe2scout 7-day price change; — when its log is too thin (hover for why)", cell: (r) => <ChangeCell item={r} /> },
    { key: "actions", header: "", align: "right", width: "3rem", cell: (r) => <TradeCell item={r} league={ctx.league} /> },
  ];
}
