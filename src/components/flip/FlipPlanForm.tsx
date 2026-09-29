"use client";

import { useState } from "react";
import { ArrowRightCircle, CheckCircle2, Save } from "lucide-react";
import type { Currency, ExchangeRates } from "../../core/priceEngine";
import type { WatchRow } from "../../lib/watchlistContract";
import { Button } from "../ui/Button";
import { CCY_ART, CCY_SHORT, type Candidate } from "./flipTypes";
import { clearManualPrices, logFlip, openPosition, saveManualPrices, type PlanInput } from "./flipActions";
import { SizingLine, useNetWorth } from "./FlipSizing";

const CCYS: readonly Currency[] = ["EXALT", "CHAOS", "DIVINE"];
const INPUT = "rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-right tabular-nums text-neutral-100";

type Status = { kind: "idle" } | { kind: "done"; text: string } | { kind: "error"; text: string };

interface Fields {
  buy: string;
  sell: string;
  qty: string;
  buyCcy: Currency;
  sellCcy: Currency;
}

/** Saved Ange prices prefill the form — unless they expired, in which case the model ignores them too. */
function initialFields(manual: WatchRow | null): Fields {
  const fresh = manual != null && !manual.manual_stale;
  return {
    buy: fresh ? (manual.manual_buy_exalt?.toString() ?? "") : "",
    sell: fresh ? (manual.manual_sell_chaos?.toString() ?? "") : "",
    qty: "1",
    buyCcy: (fresh ? manual.manual_buy_ccy : null) ?? "EXALT",
    sellCcy: (fresh ? manual.manual_sell_ccy : null) ?? "CHAOS",
  };
}

const num = (s: string): number => (s.trim() === "" ? NaN : Number(s));

function toInput(f: Fields): PlanInput {
  return { buy: num(f.buy), buyCcy: f.buyCcy, sell: num(f.sell), sellCcy: f.sellCcy, qty: num(f.qty) };
}

/** Round the market leg to what you would type into Ange. */
const trim = (n: number): string => (Math.abs(n) >= 1 ? String(Math.round(n)) : n.toFixed(2));

function PriceField(props: { label: string; value: string; ccy: Currency; onValue: (v: string) => void; onCcy: (c: Currency) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-neutral-400">{props.label}</span>
      <span className="flex items-center gap-1">
        <img src={CCY_ART[props.ccy]} alt="" className="h-4 w-4 shrink-0 object-contain" />
        <input value={props.value} onChange={(e) => props.onValue(e.target.value)} placeholder="amount" inputMode="decimal" className={`w-20 ${INPUT}`} />
        <select
          aria-label={`${props.label} currency`}
          value={props.ccy}
          onChange={(e) => props.onCcy(CCYS.find((c) => c === e.target.value) ?? props.ccy)}
          className="rounded-md border border-neutral-700 bg-neutral-900 px-1.5 py-1 text-sm text-neutral-100"
        >
          {CCYS.map((c) => <option key={c} value={c}>{CCY_SHORT[c]}</option>)}
        </select>
      </span>
    </label>
  );
}

type Run = (done: string, missing: string | null, action: () => Promise<void>) => void;

/** Save · open position · log flip. `missing` = what the action still needs; it is refused with that, never ignored. */
function PlanActions({ row, input, watched, run }: { row: Candidate; input: PlanInput; watched: boolean; run: Run }) {
  const buyOk = input.buy > 0 && Number.isInteger(input.qty) && input.qty > 0;
  const bothPrices = input.buy > 0 && input.sell > 0;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <Button
        size="sm"
        onClick={() => run(watched ? "prices saved" : "watched + prices saved", bothPrices ? null : "enter a buy and a sell price first", () => saveManualPrices(row, input))}
        title="save as your live Ange prices in this league — the watchlist row switches to your real spread"
      >
        <Save aria-hidden className="h-3.5 w-3.5" /> save prices
      </Button>
      <Button
        size="sm"
        onClick={() => run("position opened", buyOk ? null : "enter a buy price and a whole-number qty first", () => openPosition(row, input))}
        title="placed a buy order? track the buy leg now, sell it later from Open Positions"
      >
        <ArrowRightCircle aria-hidden className="h-3.5 w-3.5" /> open position
      </Button>
      <Button
        variant="primary"
        size="sm"
        onClick={() => run("flip logged", buyOk && bothPrices ? null : "enter buy, sell and a whole-number qty first", () => logFlip(row, input))}
        title="finished a buy + sell? log it into Flip History"
      >
        <CheckCircle2 aria-hidden className="h-3.5 w-3.5" /> log flip
      </Button>
    </div>
  );
}

function priceNote(manual: WatchRow | null, foreignLeague: string | null): string {
  if (manual?.manual_stale) return " — saved ones expired, re-enter";
  if (foreignLeague) return ` — watched in ${foreignLeague}; saving here moves it to this league`;
  return "";
}

interface FormProps {
  row: Candidate;
  rates: ExchangeRates | null;
  /** This item's watchlist row in the league you are viewing, or null. */
  manual: WatchRow | null;
  /** The league this item is watched in when that is NOT the one you are viewing. */
  foreignLeague: string | null;
}

/** Your real Ange prices + quantity → save them (true spread), open a position or log a finished flip. */
export function FlipPlanForm({ row, rates, manual, foreignLeague }: FormProps) {
  const [f, setF] = useState<Fields>(() => initialFields(manual));
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const netWorth = useNetWorth();
  const set = (patch: Partial<Fields>) => setF((prev) => ({ ...prev, ...patch }));
  const input = toInput(f);
  const run: Run = (done, missing, action) => {
    if (missing) return setStatus({ kind: "error", text: missing });
    setStatus({ kind: "idle" });
    action().then(
      () => setStatus({ kind: "done", text: done }),
      (e: unknown) => setStatus({ kind: "error", text: e instanceof Error ? e.message : String(e) }),
    );
  };
  const useMarket = () =>
    set({ buyCcy: row.marketBuyDisp.unit, buy: trim(row.marketBuyDisp.amount), sellCcy: row.marketSellDisp.unit, sell: trim(row.marketSellDisp.amount) });
  const clear = () => {
    set({ buy: "", sell: "" });
    run("prices cleared", null, () => clearManualPrices(row));
  };

  return (
    <div className="mt-3 rounded-lg border border-line bg-neutral-950/50 p-3">
      <div className="mb-2 flex items-center justify-between gap-2 text-xs text-neutral-400">
        <span>Your Ange prices{priceNote(manual, foreignLeague)}</span>
        <span className="flex shrink-0 items-center gap-1">
          <Button variant="ghost" size="sm" onClick={useMarket} title="prefill from the market legs, then adjust to what Ange shows">use market</Button>
          {manual?.manual_buy_exalt != null && <Button variant="ghost" size="sm" onClick={clear}>clear</Button>}
        </span>
      </div>
      <div className="flex flex-wrap items-end gap-2 text-sm">
        <PriceField label="buy at" value={f.buy} ccy={f.buyCcy} onValue={(buy) => set({ buy })} onCcy={(buyCcy) => set({ buyCcy })} />
        <PriceField label="sell at" value={f.sell} ccy={f.sellCcy} onValue={(sell) => set({ sell })} onCcy={(sellCcy) => set({ sellCcy })} />
        <label className="flex flex-col gap-1">
          <span className="text-xs text-neutral-400">qty</span>
          <input value={f.qty} onChange={(e) => set({ qty: e.target.value })} inputMode="numeric" className={`w-16 ${INPUT}`} />
        </label>
      </div>
      <PlanActions row={row} input={input} watched={manual?.active === 1} run={run} />
      <SizingLine input={input} rates={rates} netWorth={netWorth} marketEdgePct={row.edgePct} />
      {status.kind !== "idle" && (
        <p role={status.kind === "error" ? "alert" : "status"} className={`mt-2 text-xs ${status.kind === "error" ? "text-bad" : "text-good"}`}>
          {status.text}
        </p>
      )}
    </div>
  );
}
