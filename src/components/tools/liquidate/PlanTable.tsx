"use client";

import Image from "next/image";
import { TriangleAlert } from "lucide-react";
import iconExchange from "../../../assets/Currency_exchange.png";
import iconMarket from "../../../assets/Web_market.png";
import type { CurrencyIcons, LiquidationPlan, PlanRow, ValueSource } from "../../../lib/tools/liquidateContract";
import { compact, fmtDivOrEx } from "../../../lib/format";
import { formatObservedDenom } from "../../../core/treasury";

/** How old each value source is, pre-rendered by the panel ("poe.ninja · 12 min ago"). */
export type SourceLabels = Record<ValueSource, string>;

interface TableCtx {
  exPerDiv: number;
  icons: CurrencyIcons;
  sources: SourceLabels;
}

const SOURCE_TONE: Record<ValueSource, string> = {
  cx: "border-sky-500/40 text-sky-300",
  ninja: "border-neutral-600 text-neutral-300",
  scout: "border-orange-500/40 text-orange-300",
  manual: "border-amber-500/40 text-amber-300",
  none: "border-bad/40 text-bad",
};
const SOURCE_TEXT: Record<ValueSource, string> = { cx: "CX", ninja: "ninja", scout: "scout", manual: "yours", none: "unpriced" };

function ItemCell({ r, ctx }: { r: PlanRow; ctx: TableCtx }) {
  return (
    <td className="py-1.5 pl-2 pr-3">
      <span className="flex items-center gap-2">
        {r.icon ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={r.icon} alt="" className="h-7 w-7 shrink-0 object-contain" loading="lazy" />
        ) : (
          <span className="h-7 w-7 shrink-0 rounded bg-neutral-800/60" />
        )}
        <span className="min-w-0">
          <span className="block truncate text-neutral-100">{r.name}</span>
          <span className="flex items-center gap-1.5 text-[11px] text-neutral-500">
            <span className="tabular-nums">{r.qty.toLocaleString("en-US")}×</span>
            <span className={`rounded border px-1 leading-4 ${SOURCE_TONE[r.valueSource]}`} title={ctx.sources[r.valueSource]}>
              {SOURCE_TEXT[r.valueSource]}
            </span>
            {r.unitDiv != null && <span className="tabular-nums">{fmtDivOrEx(r.unitDiv, ctx.exPerDiv)} ea</span>}
          </span>
        </span>
      </span>
    </td>
  );
}

function RoutePill({ r }: { r: PlanRow }) {
  if (r.recommended === "manual") {
    return <span className="rounded border border-bad/40 px-1.5 py-0.5 text-[11px] text-bad" title={r.reason}>price it</span>;
  }
  const cx = r.recommended === "cx";
  return (
    <span title={r.reason} className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] ${cx ? "border-sky-500/40 text-sky-300" : "border-orange-500/40 text-orange-300"}`}>
      <Image src={cx ? iconExchange : iconMarket} alt="" className="h-5 w-5 object-contain" />
      {cx ? "exchange" : "trade"}
    </span>
  );
}

/** fmtDivOrEx prints non-positive as "—"; a net below zero (fee above value) must read as a loss. */
function fmtNet(v: number, exPerDiv: number): string {
  if (v === 0) return "0";
  return v < 0 ? `−${fmtDivOrEx(-v, exPerDiv)}` : fmtDivOrEx(v, exPerDiv);
}

function divCell(v: number | null, exPerDiv: number, title: string) {
  return (
    <td className={`px-2 text-right tabular-nums ${v != null && v < 0 ? "text-bad" : "text-neutral-200"}`} title={title}>
      {v == null ? <span className="text-neutral-600">—</span> : fmtNet(v, exPerDiv)}
    </td>
  );
}

function FeeCell({ r, exPerDiv }: { r: PlanRow; exPerDiv: number }) {
  if (r.recommended !== "cx" || r.cx == null) {
    return <td className="px-2 text-right text-neutral-600" title="a trade listing's gold fee (merchant tab) is not modelled">—</td>;
  }
  if (!r.cx.feeComplete || r.feeTotalDiv == null) {
    return <td className="px-2 text-right text-amber-400" title="the gold fee could not be priced — net figures exclude it">?</td>;
  }
  return (
    <td className="px-2 text-right tabular-nums text-neutral-400" title={`${compact(r.cx.feeGold ?? 0)} gold on ${compact(r.cx.receiveUnits)} currency received (fee per unit you receive)`}>
      {fmtDivOrEx(r.feeTotalDiv, exPerDiv)}
    </td>
  );
}

function etaText(h: number): string {
  if (h < 1) return "<1h";
  if (h < 48) return `${Math.round(h)}h`;
  return `${(h / 24).toFixed(1)}d`;
}

function EtaCell({ r }: { r: PlanRow }) {
  const cx = r.recommended === "cx" ? r.cx : null;
  if (cx == null || cx.etaHours == null) {
    const why = cx == null ? "a trade listing has no observed flow" : "no observed exchange flow — time to sell unknown";
    return <td className="px-2 text-right text-neutral-600" title={why}>—</td>;
  }
  const flow = `${compact(cx.unitsPerHour ?? 0)} units/h traded · you fill a share of it · ${cx.tier} market`;
  return <td className="px-2 text-right tabular-nums text-neutral-300" title={flow}>{etaText(cx.etaHours)}</td>;
}

function DenomCell({ r, icons }: { r: PlanRow; icons: CurrencyIcons }) {
  const d = r.recommended === "cx" ? r.cx?.denom : r.recommended === "trade" ? r.trade?.noteDenom : undefined;
  if (d == null) return <td className="px-2 text-neutral-600">—</td>;
  const icon = icons[d.unit];
  const title = r.recommended === "cx"
    ? `ask per unit in the currency with the lowest gold fee · price grid ~${Math.round(r.cx?.gridStepPct ?? 0)}%`
    : `stash note: ${r.trade?.note ?? ""}`;
  return (
    <td className="px-2" title={title}>
      <span className="inline-flex items-center gap-1 tabular-nums text-neutral-200">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {icon && <img src={icon} alt="" className="h-4 w-4 object-contain" loading="lazy" />}
        {formatObservedDenom(d)}
      </span>
    </td>
  );
}

function WarnCell({ r }: { r: PlanRow }) {
  // A thin exchange row still carries its cx quote, but its warnings (grid, ETA) are about a route you are not taking.
  const cxWarnings = r.recommended === "cx" ? (r.cx?.warnings ?? []) : [];
  const all = [...r.warnings, ...cxWarnings, ...(r.trade?.competitionNote ? [r.trade.competitionNote] : [])];
  if (all.length === 0) return <td className="px-2" />;
  return (
    <td className="px-2 text-amber-400" title={all.join("\n")}>
      <span className="inline-flex items-center gap-0.5 text-[11px]"><TriangleAlert className="h-3.5 w-3.5" />{all.length}</span>
    </td>
  );
}

function Row({ r, ctx }: { r: PlanRow; ctx: TableCtx }) {
  return (
    <tr className="border-t border-neutral-800/70 hover:bg-neutral-900/60">
      <ItemCell r={r} ctx={ctx} />
      <td className="px-2"><RoutePill r={r} /></td>
      {divCell(r.fastTotalDiv, ctx.exPerDiv, "sell now: undercut to fill fast — total, net of the gold fee")}
      {divCell(r.patientTotalDiv, ctx.exPerDiv, "sit above mid and wait — total, net of the gold fee")}
      <FeeCell r={r} exPerDiv={ctx.exPerDiv} />
      <EtaCell r={r} />
      <DenomCell r={r} icons={ctx.icons} />
      <WarnCell r={r} />
    </tr>
  );
}

function TotalsRow({ plan, exPerDiv }: { plan: LiquidationPlan; exPerDiv: number }) {
  const t = plan.totals;
  return (
    <tr className="border-t-2 border-neutral-700 font-semibold">
      <td className="py-2 pl-2 text-neutral-300">
        total
        {t.unpricedCount > 0 && <span className="ml-2 text-xs font-normal text-bad" title="rows without a value are left out of every total">{t.unpricedCount} unpriced</span>}
      </td>
      <td />
      {divCell(t.fastDiv, exPerDiv, "all priced rows, sold fast, net of the fees we could price")}
      {divCell(t.patientDiv, exPerDiv, "all priced rows, sold patiently, net of the fees we could price")}
      <td className={`px-2 text-right tabular-nums ${t.feeIncompleteCount > 0 ? "text-amber-400" : "text-neutral-400"}`}
        title={t.feeIncompleteCount > 0 ? `${t.feeIncompleteCount} exchange rows have an unpriced fee — this understates the cost` : "gold fees of the exchange rows, in Div at your gold valuation"}>
        {fmtNet(t.feeDiv, exPerDiv)}{t.feeIncompleteCount > 0 ? "+?" : ""}
      </td>
      <td colSpan={3} />
    </tr>
  );
}

export function PlanTable({ plan, exPerDiv, icons, sources }: { plan: LiquidationPlan } & TableCtx) {
  const ctx: TableCtx = { exPerDiv, icons, sources };
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[46rem] text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider text-neutral-500">
            <th className="pb-1 pl-2">item</th>
            <th className="px-2 pb-1">route</th>
            <th className="px-2 pb-1 text-right" title="total if you undercut to sell now">fast</th>
            <th className="px-2 pb-1 text-right" title="total if you wait above mid">patient</th>
            <th className="px-2 pb-1 text-right" title="exchange gold fee, in Div">fee</th>
            <th className="px-2 pb-1 text-right" title="time to clear at your share of the observed flow">eta</th>
            <th className="px-2 pb-1" title="price per unit, in the currency to ask for">ask in</th>
            <th className="px-2 pb-1" />
          </tr>
        </thead>
        <tbody>
          {plan.rows.map((r) => <Row key={r.name} r={r} ctx={ctx} />)}
          <TotalsRow plan={plan} exPerDiv={exPerDiv} />
        </tbody>
      </table>
    </div>
  );
}
