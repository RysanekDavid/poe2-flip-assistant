"use client";

import { useCallback, useState } from "react";
import { Wallet } from "lucide-react";
import { opportunitiesResponseSchema, type Budget, type OpportunitiesResponse } from "../../../lib/opportunitiesContract";
import { useVisiblePoll } from "../../../lib/useVisiblePoll";
import { requestJson } from "../../craft/moves/craftMovesClient";
import { PageHeader } from "../../ui/PageHeader";
import { SkeletonRows } from "../prices/pricesBits";
import { RisingSection } from "./RisingSection";
import { SnipeSection } from "./SnipeSection";
import { fmtDiv } from "./opportunityFormat";

// Stored data only (alerts, the scan report, scout's cached fill): a minute keeps a new snipe card
// from waiting long without re-reading anything expensive.
const POLL_MS = 60_000;

type Load = { kind: "loading" } | { kind: "error"; error: string } | { kind: "done"; data: OpportunitiesResponse };

function useOpportunities(): Load {
  const [state, setState] = useState<Load>({ kind: "loading" });
  const load = useCallback(() => {
    requestJson("/api/market/opportunities", { method: "GET" }, opportunitiesResponseSchema)
      .then((r) => setState(r.ok ? { kind: "done", data: r.data } : { kind: "error", error: r.error }))
      .catch((e: unknown) => {
        console.error("[opportunities] load failed", e);
        setState({ kind: "error", error: e instanceof Error ? e.message : String(e) });
      });
  }, []);
  useVisiblePoll(load, POLL_MS);
  return state;
}

const LEGEND =
  "Under value now: snipes the background scanner alerted that are still fresh (under 2 h old and not seen gone), plus the " +
  "closest near-misses. Rising uniques: worth 1 Div or more, price up and listings down across poe2scout's recent points; " +
  "listings leaving is not the same as sales. Opening a row spends one trade search with your POESESSID: 10 per hour, shared with Mod pool live values.";

/** The automatic budget: a share of your latest net worth, or an honest "no net worth yet". */
function budgetText(b: Budget): { label: string; tip: string } {
  if (b.capDiv === null || b.netWorthDiv === null) {
    return { label: "no budget: no net worth yet", tip: "No net worth on record yet (Wealth › Net worth), so nothing is filtered by budget." };
  }
  return {
    label: `budget ≤ ${fmtDiv(b.capDiv)} Div`,
    tip: `${b.sharePct}% of your latest net worth (${fmtDiv(b.netWorthDiv)} Div, read ${b.netWorthAt ?? "?"} UTC). Anything dearer is hidden.`,
  };
}

function BudgetChip({ budget }: { budget: Budget }) {
  const { label, tip } = budgetText(budget);
  return (
    <span title={tip} className="inline-flex h-7 items-center gap-1.5 rounded-md border border-line bg-neutral-900/60 px-2.5 text-xs tabular-nums text-neutral-300">
      <Wallet aria-hidden className="h-3.5 w-3.5 text-neutral-400" />
      {label}
    </span>
  );
}

/** Market › Opportunities: what to buy on the trade site now, each item with art, numbers and one action. */
export function OpportunitiesTool() {
  const state = useOpportunities();
  return (
    <div className="space-y-4">
      <PageHeader
        title="Opportunities"
        purpose="What to buy on the trade site now."
        legend={LEGEND}
        action={state.kind === "done" ? <BudgetChip budget={state.data.budget} /> : undefined}
      />
      {state.kind === "loading" && <SkeletonRows label="loading opportunities" />}
      {state.kind === "error" && (
        <p role="alert" className="text-sm text-bad">
          opportunities unavailable: {state.error}
        </p>
      )}
      {state.kind === "done" && (
        <>
          {state.data.league.toLowerCase() !== state.data.viewerLeague.toLowerCase() && (
            <p className="text-xs text-amber-200" title="the scanner, poe2scout and trade searches run in the app's default league only">
              Opportunities are in {state.data.league}, not your pinned {state.data.viewerLeague}.
            </p>
          )}
          <SnipeSection section={state.data.snipes} budget={state.data.budget} />
          <RisingSection section={state.data.rising} budget={state.data.budget} />
        </>
      )}
    </div>
  );
}
