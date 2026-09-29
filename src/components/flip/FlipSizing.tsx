"use client";

import { useEffect, useState } from "react";
import { z } from "zod";
import type { ExchangeRates } from "../../core/priceEngine";
import { planSizing, type PlanInput } from "./flipActions";
import { fmtMid } from "./flipTypes";

const SummarySchema = z.object({ netWorthDiv: z.number().nullable() });

/** The Wealth tracker's latest net worth — and, when there is none, which kind of "none". */
export type NetWorth =
  | { kind: "loading" }
  | { kind: "value"; div: number }
  | { kind: "never" } // no snapshot recorded yet
  | { kind: "error"; reason: string }; // the summary route failed

export function useNetWorth(): NetWorth {
  const [netWorth, setNetWorth] = useState<NetWorth>({ kind: "loading" });
  useEffect(() => {
    const grab = () =>
      fetch("/api/balance/summary")
        .then(async (r) => {
          if (!r.ok) throw new Error(`/api/balance/summary → ${r.status}`);
          const div = SummarySchema.parse(await r.json()).netWorthDiv;
          setNetWorth(div != null && div > 0 ? { kind: "value", div } : { kind: "never" });
        })
        .catch((e: unknown) => {
          console.error("[flip-plan] net worth for sizing", e);
          setNetWorth({ kind: "error", reason: e instanceof Error ? e.message : String(e) });
        });
    grab();
    window.addEventListener("flips-changed", grab);
    return () => window.removeEventListener("flips-changed", grab);
  }, []);
  return netWorth;
}

/** "% of net worth", or a muted note saying why there is no percentage. */
function ShareOfNetWorth({ committedDiv, netWorth }: { committedDiv: number; netWorth: NetWorth }) {
  switch (netWorth.kind) {
    case "loading":
      return null;
    case "value":
      return <span>{((committedDiv / netWorth.div) * 100).toFixed(1)}% of net worth</span>;
    case "never":
      return <span className="text-neutral-500">% of net worth: none recorded yet (Wealth tab)</span>;
    case "error":
      return <span className="text-neutral-500" title={netWorth.reason}>% of net worth: unavailable</span>;
  }
}

/** Capital tied up, expected result and your margin vs the market edge for the typed plan. */
export function SizingLine({ input, rates, netWorth, marketEdgePct }: { input: PlanInput; rates: ExchangeRates | null; netWorth: NetWorth; marketEdgePct: number }) {
  if (!rates) return null;
  const s = planSizing(input, rates);
  if (!s) return null;
  const vsMarket = s.marginPct == null ? null : s.marginPct - marketEdgePct;
  return (
    <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-2 text-xs text-neutral-400">
      <span>
        commit <span className="font-semibold tabular-nums text-neutral-100">{fmtMid(s.committedDiv)} Div</span>
      </span>
      <ShareOfNetWorth committedDiv={s.committedDiv} netWorth={netWorth} />
      {s.profitDiv != null && (
        <span className={s.profitDiv >= 0 ? "text-good" : "text-bad"}>
          expect {s.profitDiv >= 0 ? "+" : ""}<span className="font-semibold tabular-nums">{fmtMid(s.profitDiv)} Div</span>
        </span>
      )}
      {vsMarket != null && (
        <span title="your margin on these prices minus the market edge">
          {vsMarket >= 0 ? "+" : ""}{vsMarket.toFixed(1)}% vs market
        </span>
      )}
    </p>
  );
}
