"use client";

import dynamic from "next/dynamic";
import { BalancePanel } from "../../BalancePanel";
import { PageHeader } from "../../ui/PageHeader";
import { PanelLoading } from "../PanelLoading";
import { ToolChips } from "../ToolChips";
import { useTabRoute } from "../useTabRoute";

const LiquidateTool = dynamic(() => import("../../tools/liquidate/LiquidateTool").then((m) => m.LiquidateTool), {
  loading: PanelLoading,
});

/*
 * Interim Wealth tab: net worth (tool=worth) and the Liquidate planner (tool=sell), unchanged,
 * until stream B replaces the sell side with Sell/Hold/Reprice.
 */
export function WealthTab() {
  const { tool } = useTabRoute();
  return (
    <>
      <PageHeader
        title="Wealth"
        purpose="What your stash is worth over time, and what in it to sell first."
        action={<ToolChips tab="wealth" />}
      />
      {tool === "sell" ? <LiquidateTool /> : <BalancePanel />}
    </>
  );
}
