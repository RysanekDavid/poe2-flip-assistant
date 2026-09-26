"use client";

import { useEffect, useState, useCallback } from "react";
import { Save, ArrowRightCircle, CheckCircle2 } from "lucide-react";
import { roundPrice } from "../lib/format";
import { assertOk, warnOnFailure } from "../lib/clientWarn";
import { formatAmount, formatDenom, type Denom } from "../core/treasury";

/** Ninja's native quote unit is Divine — show it the way ninja does so numbers reconcile at a glance. */
function fmtMid(div: number): string {
  return div >= 10 ? Math.round(div).toLocaleString("en-US") : div.toFixed(2);
}

type Ccy = "DIVINE" | "EXALT" | "CHAOS";
const SHORT: Record<Ccy, string> = { DIVINE: "Div", EXALT: "Ex", CHAOS: "Ch" };
type Icons = Record<Ccy, string | null>;

interface FlipRow {
  itemId: string;
  item: string;
  category: string;
  midDivine: number;
  volume: number;
  change7d: number | null;
  marginPct: number;
  mode: "REAL" | "RECO";
  profitChaos: number;
  edgePct: number;
  buyDisp: Denom;
  sellDisp: Denom;
  marketBuyDisp: Denom;
  marketSellDisp: Denom;
  manualStale?: boolean;
  manualAgeMin?: number | null;
  liveVsNinjaPct: number | null;
  risk: "PUMP" | "DECLINE" | null;
}

interface WatchItem {
  item_id: string;
  manual_buy_exalt: number | null;
  manual_sell_chaos: number | null;
  manual_buy_ccy: string | null;
  manual_sell_ccy: string | null;
}

/** A currency icon + amount, e.g. (◇) 49 Div. Falls back to text if the icon isn't loaded. */
function CcyAmount({ denom, icons, className = "" }: { denom: Denom; icons: Icons; className?: string }) {
  const icon = icons[denom.unit];
  const a = formatAmount(denom);
  return (
    <span className={`inline-flex items-center gap-1 tabular-nums ${className}`}>
      {icon && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={icon} alt="" className="h-4 w-4 shrink-0 object-contain" loading="lazy" />
      )}
      {a} <span className="text-xs font-normal text-neutral-500">{SHORT[denom.unit]}</span>
    </span>
  );
}

export function FlipDetailCard({ selectedId }: { selectedId?: string }) {
  const [row, setRow] = useState<FlipRow | null>(null);
  const [manual, setManual] = useState<WatchItem | null>(null);
  const [icons, setIcons] = useState<Icons>({ DIVINE: null, EXALT: null, CHAOS: null });
  const [buy, setBuy] = useState("");
  const [sell, setSell] = useState("");
  const [qty, setQty] = useState("1");
  const [buyCcy, setBuyCcy] = useState<Ccy>("EXALT");
  const [sellCcy, setSellCcy] = useState<Ccy>("CHAOS");
  const [logged, setLogged] = useState(false);
  const [posOpened, setPosOpened] = useState(false);
  const [rates, setRates] = useState<{ exaltPerDivine: number; chaosPerDivine: number } | null>(null);
  const [netWorth, setNetWorth] = useState<number | null>(null);
  const [range, setRange] = useState<{ lowDiv: number; highDiv: number; spreadPct: number; samples: number } | null>(null);

  const load = useCallback(() => {
    if (!selectedId) {
      setRow(null);
      return;
    }
    Promise.all([
      fetch("/api/spreads").then((r) => r.json()),
      fetch("/api/watchlist").then((r) => r.json()),
    ]).then(([sp, wl]) => {
      const found = (sp.spreads ?? []).find((r: FlipRow) => r.itemId === selectedId) ?? null;
      setRow(found);
      if (sp.currencyIcons) setIcons(sp.currencyIcons);
      if (sp.rates) setRates(sp.rates);
      const w = (wl.watchlist ?? []).find((w: WatchItem) => w.item_id === selectedId) ?? null;

      // stale Ange prices aren't trustworthy — drop them silently and let the chart/estimate
      // drive. No nag, no manual re-save: old manual prices just get cleared.
      if (found?.manualStale && w?.manual_buy_exalt != null) {
        fetch("/api/watchlist", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemId: selectedId, manualBuyExalt: null, manualSellChaos: null, manualBuyCcy: "EXALT", manualSellCcy: "CHAOS" }),
        }).then(() => window.dispatchEvent(new Event("watchlist-changed")));
        setManual(null);
        setBuy("");
        setSell("");
        setBuyCcy("EXALT");
        setSellCcy("CHAOS");
        return;
      }

      setManual(w);
      setBuy(w?.manual_buy_exalt?.toString() ?? "");
      setSell(w?.manual_sell_chaos?.toString() ?? "");
      setBuyCcy((w?.manual_buy_ccy as Ccy) ?? "EXALT");
      setSellCcy((w?.manual_sell_ccy as Ccy) ?? "CHAOS");
    });
  }, [selectedId]);

  useEffect(() => {
    load();
    const onChange = () => load();
    window.addEventListener("watchlist-changed", onChange);
    const id = setInterval(load, 60_000);
    return () => {
      window.removeEventListener("watchlist-changed", onChange);
      clearInterval(id);
    };
  }, [load]);

  // flip range — the 1d low/high price, so the gap above the inputs shows real flip potential:
  // buy near the low, sell near the high. Uses our tracked history (last 24h), falls back to the
  // tail of ninja's 7d curve when we don't have a full day tracked yet.
  useEffect(() => {
    if (!selectedId) {
      setRange(null);
      return;
    }
    let alive = true;
    setRange(null);
    fetch(`/api/prices?item=${encodeURIComponent(selectedId)}`)
      .then((r) => r.json())
      .then((d: { history?: Array<{ baseValue: number; fetchedAt: string }>; spark7d?: number[] | null; change7d?: number | null; baseValue?: number | null }) => {
        if (!alive) return;
        const cutoff = Date.now() - 24 * 3_600_000;
        let vals = (d.history ?? [])
          .map((p) => ({ t: Date.parse(p.fetchedAt.replace(" ", "T") + "Z"), v: p.baseValue }))
          .filter((x) => Number.isFinite(x.t) && x.t >= cutoff && Number.isFinite(x.v) && x.v > 0)
          .map((x) => x.v);
        if (vals.length < 2 && d.spark7d && d.spark7d.length >= 2 && d.baseValue && d.baseValue > 0) {
          // reconstruct absolute Div from ninja's cumulative-% sparkline, keep only the last day (≈ last 1/7)
          const base7dAgo = d.change7d != null ? d.baseValue / (1 + d.change7d / 100) : d.baseValue;
          const abs = d.spark7d.map((pct) => base7dAgo * (1 + pct / 100));
          vals = abs.slice(Math.floor((abs.length * 6) / 7)).filter((v) => v > 0);
        }
        if (vals.length < 2) {
          setRange(null);
          return;
        }
        const lowDiv = Math.min(...vals);
        const highDiv = Math.max(...vals);
        setRange({ lowDiv, highDiv, spreadPct: lowDiv > 0 ? ((highDiv - lowDiv) / lowDiv) * 100 : 0, samples: vals.length });
      })
      .catch(() => alive && setRange(null));
    return () => {
      alive = false;
    };
  }, [selectedId]);

  // bankroll for position sizing — latest net worth from the Wealth tracker (may be null)
  useEffect(() => {
    const grab = () =>
      fetch("/api/balance")
        .then((r) => assertOk(r, "/api/balance").json()).then((d) => setNetWorth(d?.stats?.latest?.net_worth_div ?? null))
        .catch(warnOnFailure("[flip-card] bankroll for position sizing"));
    grab();
    const onFlips = () => grab();
    window.addEventListener("flips-changed", onFlips);
    return () => window.removeEventListener("flips-changed", onFlips);
  }, []);

  /** One-click prefill from the market estimate — tweak to your real Ange numbers, then save/log. */
  const useMarket = () => {
    if (!row) return;
    const trim = (n: number) => (Math.abs(n) >= 1 ? String(Math.round(n)) : n.toFixed(2));
    setBuyCcy(row.marketBuyDisp.unit as Ccy);
    setBuy(trim(row.marketBuyDisp.amount));
    setSellCcy(row.marketSellDisp.unit as Ccy);
    setSell(trim(row.marketSellDisp.amount));
  };

  const savePrices = (b: number | null, s: number | null) => {
    if (!selectedId) return;
    fetch("/api/watchlist", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId: selectedId, manualBuyExalt: b, manualSellChaos: s, manualBuyCcy: buyCcy, manualSellCcy: sellCcy }),
    }).then(() => window.dispatchEvent(new Event("watchlist-changed")));
  };
  const clearPrices = () => {
    setBuy("");
    setSell("");
    savePrices(null, null);
  };

  /** Log this flip straight into Flip History — qty × (sell − buy), no prefill round-trip. */
  const logFlip = () => {
    if (!row) return;
    const b = Number(buy), s = Number(sell), q = Number(qty);
    if (!(b > 0) || !(s > 0) || !(q > 0)) return;
    fetch("/api/flips", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        item_id: row.itemId,
        item_name: row.item,
        qty: q,
        buy_price: b,
        buy_ccy: buyCcy,
        sell_price: s,
        sell_ccy: sellCcy,
      }),
    }).then((r) => {
      if (!r.ok) return;
      window.dispatchEvent(new Event("flips-changed"));
      setLogged(true);
      window.setTimeout(() => setLogged(false), 1800);
    });
  };

  /** Open a position: record the BUY leg now, sell later from the Open Positions panel. */
  const openPosition = () => {
    if (!row) return;
    const b = Number(buy), q = Number(qty);
    if (!(b > 0) || !(q > 0)) return;
    fetch("/api/positions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId: row.itemId, itemName: row.item, qty: q, buyPrice: b, buyCcy }),
    }).then((r) => {
      if (!r.ok) return;
      window.dispatchEvent(new Event("positions-changed"));
      setPosOpened(true);
      window.setTimeout(() => setPosOpened(false), 1800);
    });
  };

  if (!selectedId) {
    return (
      <section className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
        <h2 className="mb-2 text-lg font-semibold">Flip Plan</h2>
        <p className="text-sm text-neutral-500">click a row in the watchlist to see its full flip plan</p>
      </section>
    );
  }

  return (
    <section className="flex h-full flex-col rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
      <header className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1">
        <h2 className="text-lg font-semibold">{row?.item ?? selectedId}</h2>
        {row && (
          <span
            className={`rounded px-2 py-0.5 text-xs ${
              row.mode === "REAL" ? "bg-good/20 text-good" : row.risk != null ? "bg-warn/20 text-warn" : "bg-neutral-700 text-neutral-300"
            }`}
          >
            {row.mode === "REAL" ? "real" : row.risk != null ? "est ⚠" : "est"}
          </span>
        )}
        {/* mini stats — moved out of the way, next to the chip */}
        {row && (
          <span className="ml-auto flex items-center gap-2 text-xs text-neutral-500">
            <span>mid {fmtMid(row.midDivine)} Div</span>
            <span>vol {row.volume.toFixed(0)}</span>
            {row.change7d != null && (
              <span className={row.change7d >= 0 ? "text-good" : "text-bad"}>
                {row.change7d >= 0 ? "+" : ""}
                {row.change7d.toFixed(0)}% 7d
              </span>
            )}
          </span>
        )}
      </header>

      {!row ? (
        <p className="text-sm text-neutral-500">no price data yet — poll first</p>
      ) : (
        <>
          {/* compact plan row */}
          <div className="grid grid-cols-4 gap-2">
            <MiniPlan label="BUY" color="text-bad"><CcyAmount denom={row.buyDisp} icons={icons} className="font-bold" /></MiniPlan>
            <MiniPlan label="SELL" color="text-good"><CcyAmount denom={row.sellDisp} icons={icons} className="font-bold" /></MiniPlan>
            <MiniPlan label="Margin" color="text-good"><span className="font-bold tabular-nums">{row.marginPct.toFixed(1)}%</span></MiniPlan>
            <MiniPlan label="Profit" color=""><span className="font-bold tabular-nums">{roundPrice(row.profitChaos)} Ch</span></MiniPlan>
          </div>

          {/* market estimate — single compact line */}
          <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded bg-neutral-800/40 px-2.5 py-1.5 text-xs text-neutral-400">
            <span><span className="font-semibold text-neutral-300">Market</span> mid {fmtMid(row.midDivine)} Div · buy ~{formatDenom(row.marketBuyDisp)} · sell ~{formatDenom(row.marketSellDisp)} · {row.edgePct.toFixed(1)}%</span>
            {row.mode === "REAL" &&
              (() => {
                const d = row.marginPct - row.edgePct;
                const up = d >= 0;
                return (
                  <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${up ? "bg-good/20 text-good" : "bg-bad/20 text-bad"}`}>
                    {up ? "+" : ""}
                    {d.toFixed(1)}% vs market
                  </span>
                );
              })()}
          </div>

          {/* mean-reversion hint */}
          {row.mode === "REAL" && row.liveVsNinjaPct != null && Math.abs(row.liveVsNinjaPct) >= 5 && (
            <p className={`mt-2 rounded px-2 py-1 text-xs ${row.liveVsNinjaPct < 0 ? "bg-good/10 text-good" : "bg-bad/10 text-bad"}`}>
              {row.liveVsNinjaPct < 0
                ? `↑ live ${Math.abs(row.liveVsNinjaPct).toFixed(0)}% below ninja — likely reverts up (good to buy)`
                : `↓ live ${row.liveVsNinjaPct.toFixed(0)}% above ninja — likely reverts down (good to sell now)`}
            </p>
          )}
          {/* flip range — fills the gap with real flip potential: 7d low (buy) vs high (sell) */}
          {range && (
            <div className="mt-3 rounded-lg border border-neutral-800 bg-neutral-950/30 p-3">
              <div className="mb-2 flex items-baseline justify-between">
                <span className="text-xs font-semibold text-neutral-300">Flip range</span>
                <span className="text-[11px] text-neutral-600">24h low → high · {range.samples} pts</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <RangeStat label="buy near" accent="text-sky-400" icon={icons.DIVINE}>
                  {fmtMid(range.lowDiv)}
                </RangeStat>
                <RangeStat label="sell near" accent="text-amber-400" icon={icons.DIVINE}>
                  {fmtMid(range.highDiv)}
                </RangeStat>
                <div className="rounded-md border border-emerald-900/40 bg-emerald-950/20 px-2 py-1.5 text-center">
                  <div className="text-base font-bold tabular-nums text-emerald-400">
                    {range.spreadPct.toFixed(0)}%
                  </div>
                  <div className="text-[10px] uppercase tracking-wide text-neutral-500">max swing</div>
                </div>
              </div>
              <p className="mt-2 text-[11px] text-neutral-600">
                price swung {fmtMid(range.lowDiv)}→{fmtMid(range.highDiv)} Div over 24h — the room a swing flip has.
              </p>
            </div>
          )}

          {/* prices + quantity → save (real spread) or log directly. mt-auto pins it to the
              bottom so the card fills its height and lines up with the chart beside it. */}
          <div className="mt-auto rounded-lg border border-neutral-800 bg-neutral-950/50 p-3 pt-3">
            <div className="mb-2.5 flex items-center justify-between text-xs text-neutral-500">
              <span>
                your real Ange prices → <span className="text-good">true spread</span>
              </span>
              <span className="flex items-center gap-2">
                <button
                  onClick={useMarket}
                  className="text-neutral-500 hover:text-sky-300"
                  title="prefill buy/sell from the market estimate — one click, then adjust to what Ange actually shows"
                >
                  use market
                </button>
                {manual?.manual_buy_exalt != null && (
                  <button onClick={clearPrices} className="text-neutral-600 hover:text-bad">
                    clear
                  </button>
                )}
              </span>
            </div>
            <div className="flex flex-wrap items-end gap-2 text-sm">
              <Field label="buy at" labelColor="text-bad" value={buy} onChange={setBuy} ccy={buyCcy} setCcy={setBuyCcy} icons={icons} />
              <Field label="sell at" labelColor="text-good" value={sell} onChange={setSell} ccy={sellCcy} setCcy={setSellCcy} icons={icons} />
              <label className="flex flex-col gap-1">
                <span className="text-xs text-neutral-400">qty</span>
                <input
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  inputMode="numeric"
                  className="w-16 rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-right tabular-nums focus:border-sky-500 focus:outline-none"
                />
              </label>
            </div>

            {/* action bar — three clear, modern buttons: save (neutral) · open position (blue) · log flip (green) */}
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <button
                onClick={() => savePrices(buy.trim() === "" ? null : Number(buy), sell.trim() === "" ? null : Number(sell))}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-800/60 px-3 py-2 text-sm font-medium text-neutral-200 transition-all hover:border-neutral-500 hover:bg-neutral-700/60 active:scale-[0.98]"
                title="save these as your live Ange prices (switches the spread to REAL)"
              >
                <Save className="h-4 w-4" /> save prices
              </button>
              <button
                onClick={openPosition}
                className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-white shadow-sm transition-all active:scale-[0.98] ${
                  posOpened ? "bg-emerald-600" : "bg-sky-600 shadow-sky-950/40 hover:bg-sky-500"
                }`}
                title="placed a buy order on Ange? open a position (buy leg only) — sell it later from Open Positions"
              >
                {posOpened ? <CheckCircle2 className="h-4 w-4" /> : <ArrowRightCircle className="h-4 w-4" />}
                {posOpened ? "opened" : "open position"}
              </button>
              <button
                onClick={logFlip}
                className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-white shadow-sm transition-all active:scale-[0.98] ${
                  logged ? "bg-emerald-500" : "bg-emerald-600 shadow-emerald-950/40 hover:bg-emerald-500"
                }`}
                title="instant round-trip: log a completed buy+sell into Flip History"
              >
                <CheckCircle2 className="h-4 w-4" /> {logged ? "logged" : "log flip"}
              </button>
            </div>

            {/* bankroll sizing — committed capital, expected profit, % of net worth */}
            {(() => {
              if (!rates) return null;
              const toDiv = (amt: number, ccy: Ccy) =>
                ccy === "DIVINE" ? amt : ccy === "EXALT" ? amt / rates.exaltPerDivine : amt / rates.chaosPerDivine;
              const b = Number(buy), s = Number(sell), q = Number(qty);
              if (!(b > 0) || !(q > 0)) return null;
              const committed = toDiv(b, buyCcy) * q;
              const expProfit = s > 0 ? (toDiv(s, sellCcy) - toDiv(b, buyCcy)) * q : null;
              const pct = netWorth && netWorth > 0 ? (committed / netWorth) * 100 : null;
              return (
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-neutral-800 pt-2 text-xs">
                  <span className="text-neutral-400">
                    commit <span className="font-semibold text-neutral-200 tabular-nums">{fmtMid(committed)} Div</span>
                    {pct != null && <span className="text-neutral-500"> · {pct.toFixed(1)}% of net worth</span>}
                  </span>
                  {expProfit != null && (
                    <span className={expProfit >= 0 ? "text-good" : "text-bad"}>
                      expect {expProfit >= 0 ? "+" : ""}<span className="font-semibold tabular-nums">{fmtMid(expProfit)} Div</span>
                    </span>
                  )}
                  {netWorth == null && <span className="text-neutral-600">(set net worth in Wealth tab for % sizing)</span>}
                </div>
              );
            })()}
          </div>
        </>
      )}
    </section>
  );
}

function Field({
  label,
  labelColor,
  value,
  onChange,
  ccy,
  setCcy,
  icons,
}: {
  label: string;
  labelColor: string;
  value: string;
  onChange: (v: string) => void;
  ccy: Ccy;
  setCcy: (c: Ccy) => void;
  icons: Icons;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className={`text-xs ${labelColor}`}>{label}</span>
      <div className="flex items-center gap-1">
        {icons[ccy] && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={icons[ccy]!} alt="" className="h-4 w-4 shrink-0 object-contain" />
        )}
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="amount"
          inputMode="decimal"
          className="w-20 rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-right tabular-nums"
        />
        <CcySelect value={ccy} onChange={setCcy} />
      </div>
    </label>
  );
}

function CcySelect({ value, onChange }: { value: Ccy; onChange: (c: Ccy) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as Ccy)} className="rounded border border-neutral-700 bg-neutral-800 px-1.5 py-1 text-sm">
      <option value="EXALT">Ex</option>
      <option value="CHAOS">Ch</option>
      <option value="DIVINE">Div</option>
    </select>
  );
}

function RangeStat({ label, accent, icon, children }: { label: string; accent: string; icon: string | null; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-neutral-800 bg-neutral-900/40 px-2 py-1.5 text-center">
      <div className={`flex items-center justify-center gap-1 text-base font-bold tabular-nums ${accent}`}>
        {icon && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={icon} alt="" className="h-4 w-4 shrink-0 object-contain" loading="lazy" />
        )}
        {children}
      </div>
      <div className="text-[10px] uppercase tracking-wide text-neutral-500">{label}</div>
    </div>
  );
}

function MiniPlan({ label, color, children }: { label: string; color: string; children: React.ReactNode }) {
  return (
    <div className="rounded bg-neutral-800/40 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-neutral-500">{label}</div>
      <div className={`text-sm ${color}`}>{children}</div>
    </div>
  );
}
