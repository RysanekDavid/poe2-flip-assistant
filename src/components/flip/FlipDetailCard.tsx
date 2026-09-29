"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { formatDenom, formatObservedDenom, type Denom } from "../../core/treasury";
import { compact } from "../../lib/format";
import { WatchlistResponseSchema, inLeague, type WatchRow } from "../../lib/watchlistContract";
import { ItemArt } from "../ui/ItemArt";
import { edgeTooltip } from "../FlipEdge";
import { CCY_ART, fmtMid, type FlipSelection } from "./flipTypes";
import { FlipRange } from "./FlipRange";
import { FlipPlanForm } from "./FlipPlanForm";

interface WatchState {
  /** The row in the league you are viewing — the only one whose prices apply here. */
  watch: WatchRow | null;
  /** Set when the item is watched in a DIFFERENT league (one row per item: saving moves it). */
  foreignLeague: string | null;
  loaded: boolean;
  error: string | null;
}

const EMPTY: WatchState = { watch: null, foreignLeague: null, loaded: false, error: null };

/** This item's watchlist row (manual Ange prices), refetched whenever the watchlist changes. */
function useWatchRow(itemId: string): WatchState {
  const [state, setState] = useState<WatchState>(EMPTY);
  const load = useCallback(() => {
    fetch("/api/watchlist")
      .then(async (r) => {
        if (!r.ok) throw new Error(`/api/watchlist → ${r.status}`);
        const { league, watchlist } = WatchlistResponseSchema.parse(await r.json());
        const row = watchlist.find((w) => w.item_id === itemId) ?? null;
        const here = row != null && inLeague(row, league);
        const foreignLeague = row != null && !here && row.active === 1 ? (row.league ?? "an untagged league") : null;
        setState({ watch: here ? row : null, foreignLeague, loaded: true, error: null });
      })
      .catch((e: unknown) => setState({ ...EMPTY, loaded: true, error: e instanceof Error ? e.message : String(e) }));
  }, [itemId]);
  useEffect(() => {
    setState(EMPTY);
    load();
    window.addEventListener("watchlist-changed", load);
    return () => window.removeEventListener("watchlist-changed", load);
  }, [load]);
  return state;
}

function Leg({ label, denom, observed }: { label: string; denom: Denom; observed: boolean }) {
  const text = observed ? formatObservedDenom(denom) : formatDenom(denom);
  return (
    <div className="rounded-md bg-neutral-800/40 px-2 py-1.5">
      <div className="text-xs text-neutral-400">{label}</div>
      <div className="flex items-center gap-1 text-sm font-semibold tabular-nums text-neutral-100">
        <img src={CCY_ART[denom.unit]} alt="" className="h-4 w-4 shrink-0 object-contain" />
        {text}
      </div>
    </div>
  );
}

function Stat({ label, tip, children }: { label: string; tip: string; children: ReactNode }) {
  return (
    <span title={tip} className="whitespace-nowrap">
      <span className="text-neutral-400">{label}</span> <span className="tabular-nums text-neutral-200">{children}</span>
    </span>
  );
}

/** Mid, oscillation and Div/day — the numbers Top Flips keeps out of its columns. */
function StatsLine({ row }: { row: FlipSelection["row"] }) {
  const perDay = row.throughputDivDay >= 0.1 ? `${row.source === "cx" && row.flowObserved ? "" : "~"}${compact(row.throughputDivDay)}` : "—";
  return (
    <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
      <Stat label="Mid" tip="poe.ninja mid price, Divine per unit">{fmtMid(row.midDivine)} Div</Stat>
      <Stat label="Div/day" tip="profit/unit × units you can fill per day (your share of the slower leg's flow) · ~ = estimated">{perDay}</Stat>
      <Stat label="Osc" tip="how much the 7d price wiggles beyond its net drift — high = flips repeatedly without trending away">{row.oscScore.toFixed(0)}</Stat>
      <Stat label="Vol" tip="poe.ninja volume (Div-denominated, time unit unverified)">{compact(row.volume)}</Stat>
      {row.change7d != null && <Stat label="7d" tip="7-day price change">{row.change7d >= 0 ? "+" : ""}{row.change7d.toFixed(0)}%</Stat>}
    </p>
  );
}

function ReversionHint({ pct }: { pct: number | null }) {
  if (pct == null || Math.abs(pct) < 5) return null;
  const below = pct < 0;
  return (
    <p className={`mt-2 rounded px-2 py-1 text-xs ${below ? "bg-good/10 text-good" : "bg-bad/10 text-bad"}`}>
      {below
        ? `live ${Math.abs(pct).toFixed(0)}% below ninja — likely reverts up (good to buy)`
        : `live ${pct.toFixed(0)}% above ninja — likely reverts down (good to sell now)`}
    </p>
  );
}

/**
 * The flip plan for the clicked row. Everything market-side comes from that row itself (Top Flips
 * or the watchlist), so an unwatched item has a full plan; only your saved Ange prices are fetched.
 */
export function FlipDetailCard({ selection }: { selection: FlipSelection }) {
  const { row, rates } = selection;
  const { watch, foreignLeague, loaded, error } = useWatchRow(row.itemId);
  const observed = row.source === "cx";
  return (
    <section className="flex h-full flex-col rounded-lg border border-line bg-neutral-900/50 p-4">
      <header className="flex items-center gap-2">
        <ItemArt src={row.icon} size={8} />
        <h3 className="min-w-0 truncate text-lg font-semibold text-neutral-100">{row.item}</h3>
        <span className="ml-auto text-xs text-neutral-400">{observed ? "exchange data" : "estimate"}</span>
      </header>
      <StatsLine row={row} />
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Leg label="Market buy" denom={row.marketBuyDisp} observed={observed} />
        <Leg label="Market sell" denom={row.marketSellDisp} observed={observed} />
        <div className="rounded-md bg-neutral-800/40 px-2 py-1.5" title={edgeTooltip(row, null)}>
          <div className="text-xs text-neutral-400">Edge</div>
          <div className="text-sm font-semibold tabular-nums text-neutral-100">{row.edgePct.toFixed(1)}%</div>
        </div>
      </div>
      <ReversionHint pct={row.mode === "REAL" ? row.liveVsNinjaPct : null} />
      <FlipRange itemId={row.itemId} />
      {error && <p role="alert" className="mt-3 text-xs text-bad">saved prices unavailable — {error}</p>}
      {/* keyed by item: a new item re-seeds the form from its saved prices, a save keeps what you typed */}
      {loaded && <FlipPlanForm key={row.itemId} row={row} rates={rates} manual={watch} foreignLeague={foreignLeague} />}
    </section>
  );
}
