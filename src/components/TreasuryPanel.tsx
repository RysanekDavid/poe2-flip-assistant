"use client";

import { useEffect, useState, useCallback } from "react";
import { roundPrice } from "../lib/format";
import { SwapIcon } from "./ui/icons";
import { CURRENCIES, CCY_UNIT, crossRate, makeRateFn, triangularLoops, convert } from "../core/treasury";
import type { ExchangeRates, Currency } from "../core/priceEngine";

const LS_OVERRIDES = "treasury-rate-overrides";

type Holdings = Record<Currency, number>;

const TONE: Record<Currency, string> = { DIVINE: "text-amber-400", EXALT: "text-sky-400", CHAOS: "text-neutral-200" };
const EDGE = 0.03;

function fmtRate(n: number): string {
  if (n >= 100) return Math.round(n).toLocaleString("en-US");
  if (n >= 1) return n.toFixed(2);
  return n.toFixed(4);
}

/** Divine amounts keep decimals (fractions matter); Ex/Ch round to whole. */
function fmtAmount(n: number, ccy: Currency): string {
  return ccy === "DIVINE" ? n.toFixed(2) : roundPrice(n);
}

export function TreasuryPanel() {
  const [rates, setRates] = useState<ExchangeRates | null>(null);
  const [holdingsStr, setHoldingsStr] = useState<Record<Currency, string>>({ DIVINE: "", EXALT: "", CHAOS: "" });
  const [from, setFrom] = useState<Currency>("EXALT");
  const [to, setTo] = useState<Currency>("DIVINE");
  const [amount, setAmount] = useState("");
  const [overrides, setOverrides] = useState<Record<string, string>>({});

  const loadRates = useCallback(
    () =>
      fetch("/api/spreads")
        .then((r) => r.json())
        .then((d) => setRates(d.rates ?? null))
        .catch(() => {}),
    [],
  );
  const loadHoldings = useCallback(
    () =>
      fetch("/api/holdings")
        .then((r) => r.json())
        .then((d) => {
          const h: Holdings = d.holdings ?? { DIVINE: 0, EXALT: 0, CHAOS: 0 };
          setHoldingsStr({
            DIVINE: h.DIVINE ? String(h.DIVINE) : "",
            EXALT: h.EXALT ? String(h.EXALT) : "",
            CHAOS: h.CHAOS ? String(h.CHAOS) : "",
          });
        })
        .catch(() => {}),
    [],
  );

  useEffect(() => {
    loadRates();
    loadHoldings();
    try {
      const raw = window.localStorage.getItem(LS_OVERRIDES);
      if (raw) setOverrides(JSON.parse(raw));
    } catch {
      /* ignore */
    }
    const id = setInterval(loadRates, 60_000);
    return () => clearInterval(id);
  }, [loadRates, loadHoldings]);

  const hv = (c: Currency): number => Number(holdingsStr[c]) || 0;

  const saveHolding = (ccy: Currency) => {
    fetch("/api/holdings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currency: ccy, amount: hv(ccy) }),
    }).catch(() => {});
  };

  const persist = (next: Record<string, string>) => {
    try {
      window.localStorage.setItem(LS_OVERRIDES, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  // keep the raw string while typing (so you can type "0", "0.", "0.003"); only valid >0 values take effect
  const setOverride = (pairKey: string, val: string) => {
    setOverrides((o) => {
      const next = { ...o };
      if (val === "") delete next[pairKey];
      else next[pairKey] = val;
      persist(next);
      return next;
    });
  };
  const clearOverrides = () => {
    setOverrides({});
    persist({});
  };

  if (!rates) return <p className="text-sm text-neutral-500">no rates yet — poll first</p>;

  // numeric overrides actually applied (valid, > 0)
  const numOverrides: Record<string, number> = {};
  for (const [k, v] of Object.entries(overrides)) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) numOverrides[k] = n;
  }
  const hasOverrides = Object.keys(numOverrides).length > 0;
  const eff = makeRateFn(rates, numOverrides);
  const amt = Number(amount) || 0;
  const reverse = () => {
    setFrom(to);
    setTo(from);
  };
  const pairKey = `${from}_${to}`;
  const plan = from !== to && amt > 0 ? convert(from, to, amt, rates, EDGE, eff) : null;
  const loops = triangularLoops(eff);
  const totalDiv = hv("DIVINE") + hv("EXALT") / rates.exaltPerDivine + hv("CHAOS") / rates.chaosPerDivine;

  return (
    <div className="space-y-4 text-sm">
      {/* 3×3 rate matrix */}
      <div>
        <div className="mb-1 text-xs text-neutral-400">Rates — 1 row-ccy = N col-ccy</div>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-neutral-500">
              <th className="py-1 text-left">from \ to</th>
              {CURRENCIES.map((c) => (
                <th key={c} className={`py-1 text-right ${TONE[c]}`}>
                  {CCY_UNIT[c]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CURRENCIES.map((f) => (
              <tr key={f} className="border-t border-neutral-800">
                <td className={`py-1 ${TONE[f]}`}>{CCY_UNIT[f]}</td>
                {CURRENCIES.map((t) => (
                  <td key={t} className={`py-1 text-right tabular-nums ${numOverrides[`${f}_${t}`] != null ? "text-amber-300" : ""}`}>
                    {f === t ? "—" : fmtRate(eff(f, t))}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* holdings */}
      <div className="rounded border border-neutral-800 bg-neutral-950/40 p-3">
        <div className="mb-2 flex items-center justify-between text-xs text-neutral-400">
          <span>Holdings</span>
          <span className="text-amber-400">≈ {totalDiv.toFixed(2)} Div total</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {CURRENCIES.map((c) => (
            <label key={c} className="flex flex-col gap-1">
              <span className={`text-xs ${TONE[c]}`}>{CCY_UNIT[c]}</span>
              <input
                value={holdingsStr[c]}
                onChange={(e) => setHoldingsStr((s) => ({ ...s, [c]: e.target.value }))}
                onBlur={() => saveHolding(c)}
                inputMode="decimal"
                placeholder="0"
                className="w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-right tabular-nums"
              />
            </label>
          ))}
        </div>
      </div>

      {/* convert planner */}
      <div className="rounded border border-neutral-800 bg-neutral-950/40 p-3">
        <div className="mb-2 flex items-center gap-2">
          <CcySelect value={from} onChange={setFrom} />
          <button onClick={reverse} title="reverse" className="rounded border border-neutral-700 bg-neutral-800 p-1.5 hover:bg-neutral-700">
            <SwapIcon className="h-4 w-4" />
          </button>
          <CcySelect value={to} onChange={setTo} />
        </div>
        <div className="mb-2 flex items-center gap-2">
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder={`amount in ${CCY_UNIT[from]}`}
            className={`flex-1 rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-right tabular-nums ${TONE[from]}`}
          />
          <button
            onClick={() => setAmount(holdingsStr[from] || "")}
            className="rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:border-good/60 hover:text-good"
          >
            use all
          </button>
        </div>

        {/* live order-book override for this pair — enter what the in-game book shows */}
        {from !== to && (
          <div className="mb-2 flex items-center gap-2 rounded border border-neutral-800 bg-neutral-900/60 px-2 py-1.5 text-xs">
            <span className="text-neutral-400">Live</span>
            <span className="text-neutral-500">1 {CCY_UNIT[from]} =</span>
            <input
              value={overrides[pairKey] ?? ""}
              onChange={(e) => setOverride(pairKey, e.target.value)}
              inputMode="decimal"
              placeholder={fmtRate(crossRate(from, to, rates))}
              className={`w-24 rounded border px-2 py-0.5 text-right tabular-nums ${
                numOverrides[pairKey] != null ? "border-amber-500/50 bg-amber-500/10 text-amber-300" : "border-neutral-700 bg-neutral-800"
              }`}
            />
            <span className={TONE[to]}>{CCY_UNIT[to]}</span>
            <span className="ml-auto text-neutral-600">ninja {fmtRate(crossRate(from, to, rates))}</span>
          </div>
        )}

        {from === to ? (
          <p className="text-xs text-neutral-500">pick two different currencies</p>
        ) : plan ? (
          <div className="space-y-1.5">
            <Row label="Classic — market" badge="instant" badgeTone="bg-good/20 text-good" out={`${fmtAmount(plan.marketOut, to)} ${CCY_UNIT[to]}`} tone={TONE[to]} />
            <Row label="Max — edge (+3%)" badge="slower" badgeTone="bg-warn/20 text-warn" out={`${fmtAmount(plan.edgeOut, to)} ${CCY_UNIT[to]}`} tone={TONE[to]} />
            <div className="flex items-center justify-between text-xs text-neutral-500">
              <span>via {CCY_UNIT[plan.third]}</span>
              <span className="tabular-nums">
                {fmtAmount(plan.viaThirdOut, to)} {CCY_UNIT[to]}
                {Math.abs(plan.viaThirdOut - plan.marketOut) / plan.marketOut < 0.001 ? " (= direct on ninja mids)" : ""}
              </span>
            </div>
            {to === "DIVINE" && from !== "DIVINE" && (
              <p className="rounded bg-amber-500/10 px-2 py-1 text-xs text-amber-200">
                ⭐ parks value compactly — hold the bulk in Divine, not a pile of {CCY_UNIT[from]}.
              </p>
            )}
            {plan.warnings.map((w, i) => (
              <p key={i} className="rounded bg-bad/10 px-2 py-1 text-xs text-bad">
                ⚠ {w}
              </p>
            ))}
          </div>
        ) : (
          <p className="text-xs text-neutral-500">enter an amount</p>
        )}
      </div>

      {/* triangular arbitrage — ~0 on ninja mids, lights up once live overrides diverge */}
      <div className="rounded border border-neutral-800 bg-neutral-950/40 p-3">
        <div className="mb-1.5 flex items-center justify-between text-xs text-neutral-400">
          <span>Triangular loops {hasOverrides ? "(live)" : "(ninja mids ≈ 0)"}</span>
          {hasOverrides && (
            <button onClick={clearOverrides} className="text-neutral-500 hover:text-bad">
              reset overrides
            </button>
          )}
        </div>
        <div className="space-y-1">
          {loops.map((l, i) => {
            const arb = l.profitPct > 0.5;
            return (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="tabular-nums text-neutral-400">{l.path}</span>
                <span className={`font-semibold tabular-nums ${arb ? "text-good" : "text-neutral-500"}`}>
                  {l.profitPct >= 0 ? "+" : ""}
                  {l.profitPct.toFixed(2)}%{arb ? " ⚡ arb" : ""}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-xs text-neutral-600">
        Default rates are poe.ninja mids (~1h lag), mutually reconciled → routes are equal & loops ~0. Type the{" "}
        <span className="text-amber-300">live order-book ratio</span> per pair above and real route/triangular edge
        appears. Mind the 65000:1 exchange cap.
      </p>
    </div>
  );
}

function CcySelect({ value, onChange }: { value: Currency; onChange: (c: Currency) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as Currency)}
      className={`flex-1 rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 ${TONE[value]}`}
    >
      {CURRENCIES.map((c) => (
        <option key={c} value={c} className="text-neutral-100">
          {CCY_UNIT[c]}
        </option>
      ))}
    </select>
  );
}

function Row({ label, badge, badgeTone, out, tone }: { label: string; badge: string; badgeTone: string; out: string; tone: string }) {
  return (
    <div className="flex items-center justify-between rounded bg-neutral-800/40 px-2.5 py-1.5">
      <span className="flex items-center gap-1.5">
        <span className="text-sm font-medium">{label}</span>
        <span className={`rounded px-1.5 py-0.5 text-xs ${badgeTone}`}>{badge}</span>
      </span>
      <span className={`text-lg font-bold tabular-nums ${tone}`}>{out}</span>
    </div>
  );
}
