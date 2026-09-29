"use client";

import { ExternalLink, Eye } from "lucide-react";
import { CURRENCY_ART } from "../../../lib/currencyArt";
import { compact, fmtSmart } from "../../../lib/format";
import type { MarketPriceItem } from "../../../lib/marketPricesContract";
import { timestampAgeMs } from "../../../lib/sqliteTime";
import { tradeSearchUrl } from "../../../lib/tradeLink";
import { detailRowId, type Column } from "../../ui/DataTable";
import { ItemArt } from "../../ui/ItemArt";
import { Sparkline } from "../../ui/Sparkline";
import { fmtAgeMin } from "../../ui/StaleBadge";
import { changeTone, fmtChange, THIN_PER_HOUR } from "./pricesView";

export const PRICES_DETAIL_PREFIX = "prices-detail";

export interface PricesColumnCtx {
  league: string;
  exPerDiv: number | null;
  /** Unix seconds of the exchange hour behind every cx field. */
  cxHour: number | null;
  watched: ReadonlySet<string>;
  expandedKey: string | undefined;
  onToggle: (item: MarketPriceItem) => void;
  onWatch: (item: MarketPriceItem) => void;
  /** While a search spans every category, each row names its own. */
  categoryLabel: ((type: string) => string) | null;
}

const ageOf = (stamp: string): string => `${fmtAgeMin(timestampAgeMs(stamp) / 60_000)} old`;

/** The name is the row's keyboard target: the row itself holds the watch and trade controls. */
function ItemCell({ item, ctx }: { item: MarketPriceItem; ctx: PricesColumnCtx }) {
  const open = ctx.expandedKey === item.itemId;
  return (
    <span className="flex min-w-[10rem] items-center gap-2">
      <ItemArt src={item.icon} size={8} />
      <span className="min-w-0">
        <button
          type="button"
          onClick={() => ctx.onToggle(item)}
          aria-expanded={open}
          aria-controls={open ? detailRowId(PRICES_DETAIL_PREFIX, item.itemId) : undefined}
          className="rounded text-left text-sm text-neutral-100 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60"
        >
          {item.name}
        </button>
        {ctx.categoryLabel && <span className="block text-xs text-neutral-500">{ctx.categoryLabel(item.category)}</span>}
      </span>
    </span>
  );
}

function valueTip(item: MarketPriceItem): string {
  const parts = [`poe.ninja · ${ageOf(item.valueAt)}`];
  if (item.cxMidDiv !== null) parts.push(`Currency Exchange mid ${fmtSmart(item.cxMidDiv)} div`);
  if (item.cxBand !== null) parts.push(`band ${fmtSmart(item.cxBand.low)}–${fmtSmart(item.cxBand.high)} div`);
  return parts.join(" · ");
}

const fmtAmount = (n: number): string => (n >= 10_000 ? compact(n) : fmtSmart(n));

function ValueCell({ item, exPerDiv }: { item: MarketPriceItem; exPerDiv: number | null }) {
  if (item.valueDiv === null) {
    return (
      <span className="text-sm text-neutral-500" title={`unpriced · poe.ninja lists it without a value · ${ageOf(item.valueAt)}`}>
        —
      </span>
    );
  }
  const ex = exPerDiv === null ? null : item.valueDiv * exPerDiv;
  return (
    <span className="inline-flex flex-col items-end leading-tight" title={valueTip(item)}>
      <span className="inline-flex items-center gap-1 text-sm tabular-nums text-neutral-100">
        {fmtAmount(item.valueDiv)}
        <img src={CURRENCY_ART.div} alt="div" className="h-4 w-4 object-contain" />
      </span>
      {ex !== null && (
        <span className="inline-flex items-center gap-1 text-xs tabular-nums text-neutral-400">
          {fmtAmount(ex)}
          <img src={CURRENCY_ART.ex} alt="ex" className="h-3.5 w-3.5 object-contain" />
        </span>
      )}
    </span>
  );
}

function TrendCell({ item }: { item: MarketPriceItem }) {
  const tip = item.trendAt === null ? "poe.ninja sent no 7-day trend" : `poe.ninja 7-day change · ${ageOf(item.trendAt)}`;
  return (
    <span className="inline-flex items-center justify-end gap-2" title={tip}>
      {item.spark7d && <Sparkline data={item.spark7d} width={72} height={20} className="max-sm:hidden" />}
      <span className={`min-w-12 whitespace-nowrap text-right text-sm tabular-nums ${changeTone(item.change7d)}`}>{item.change7d === null ? "—" : fmtChange(item.change7d)}</span>
    </span>
  );
}

function volumeTip(item: MarketPriceItem, cxHour: number | null): string {
  if (item.volumePerHour === null || item.volumeSource === null) return "no volume data";
  const thin = item.volumePerHour < THIN_PER_HOUR ? "thin market · " : "";
  if (item.volumeSource === "cx") {
    const age = cxHour === null ? "" : ` · ${fmtAgeMin((Date.now() - cxHour * 1000) / 60_000)} old`;
    return `${thin}Currency Exchange: mean units/hour over the last 6h${age}`;
  }
  return `${thin}poe.ninja volume ÷ value — estimated, unit unverified · ${ageOf(item.valueAt)}`;
}

function VolumeCell({ item, cxHour }: { item: MarketPriceItem; cxHour: number | null }) {
  const v = item.volumePerHour;
  const text = v === null ? "—" : `${item.volumeSource === "ninja" ? "~" : ""}${v < 10 ? v.toLocaleString("en", { maximumFractionDigits: v < 1 ? 2 : 1 }) : compact(v)}`;
  const tone = v === null || v < THIN_PER_HOUR ? "text-neutral-500" : "text-neutral-200";
  return (
    <span className={`text-sm tabular-nums ${tone}`} title={volumeTip(item, cxHour)}>
      {text}
    </span>
  );
}

function ActionsCell({ item, ctx }: { item: MarketPriceItem; ctx: PricesColumnCtx }) {
  const watching = ctx.watched.has(item.itemId);
  const watchLabel = watching ? `Stop watching ${item.name}` : `Watch ${item.name} (alerts + Exchange watchlist)`;
  return (
    <span className="inline-flex items-center justify-end gap-1">
      <button
        type="button"
        onClick={() => ctx.onWatch(item)}
        aria-pressed={watching}
        aria-label={watchLabel}
        title={watchLabel}
        className={`inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-neutral-800 ${watching ? "text-amber-300" : "text-neutral-500 hover:text-neutral-200"}`}
      >
        <Eye aria-hidden className="h-4 w-4" />
      </button>
      <a
        href={tradeSearchUrl(ctx.league, { type: item.name })}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Search ${item.name} on the trade site`}
        title="Search on the trade site"
        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-sky-300 hover:bg-neutral-800 hover:text-sky-200"
      >
        <ExternalLink aria-hidden className="h-4 w-4" />
      </a>
    </span>
  );
}

export function pricesColumns(ctx: PricesColumnCtx): Column<MarketPriceItem>[] {
  return [
    { key: "name", header: "Item", sortable: true, wrap: true, cell: (r) => <ItemCell item={r} ctx={ctx} /> },
    {
      key: "value",
      header: "Value",
      align: "right",
      sortable: true,
      tip: "poe.ninja exchange value in Divine, Exalted under it. Hover a value for its source and age, and the Currency Exchange mid when the exchange has a market.",
      cell: (r) => <ValueCell item={r} exPerDiv={ctx.exPerDiv} />,
    },
    { key: "change", header: "7 days", align: "right", sortable: true, tip: "poe.ninja 7-day price change", cell: (r) => <TrendCell item={r} /> },
    {
      key: "volume",
      header: "Volume / h",
      align: "right",
      sortable: true,
      tip: "Units traded per hour on the Currency Exchange (6h mean). ~ = estimated from poe.ninja volume where the exchange has no data.",
      cell: (r) => <VolumeCell item={r} cxHour={ctx.cxHour} />,
    },
    { key: "actions", header: "", align: "right", width: "5rem", cell: (r) => <ActionsCell item={r} ctx={ctx} /> },
  ];
}
