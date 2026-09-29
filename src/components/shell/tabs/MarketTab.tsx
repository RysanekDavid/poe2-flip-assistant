"use client";

import dynamic from "next/dynamic";
import { DemandBoard } from "../../DemandBoard";
import { AutoSnipeBar } from "../../AutoSnipeBar";
import { SnipeTargets } from "../../SnipeTargets";
import { PageHeader } from "../../ui/PageHeader";
import { PanelLoading } from "../PanelLoading";
import { ToolChips } from "../ToolChips";
import { useTabRoute } from "../useTabRoute";

const PriceCheckTool = dynamic(() => import("../../market/pricecheck/PriceCheckTool").then((m) => m.PriceCheckTool), {
  loading: PanelLoading,
});

const PRICE_LEGEND =
  "Exchange items: Currency Exchange mid (else poe.ninja) × your stack, sell route after the gold fee. Uniques: poe2scout daily " +
  "price. Rares: price-book reference of recorded asks. Asks are not sales. The live value spends one trade search with your " +
  "POESESSID, in the default league only.";

function PriceView() {
  return (
    <>
      <PageHeader
        title="Price check"
        purpose="Paste an item: what it is worth, where that number came from, and how to sell it."
        legend={PRICE_LEGEND}
        action={<ToolChips tab="market" />}
      />
      <PriceCheckTool />
    </>
  );
}

function BoardView() {
  return (
    <>
      <PageHeader
        title="Market"
        purpose="What sells on the trade site right now, and listings priced under what they are worth."
        action={<ToolChips tab="market" />}
      />
      <DemandBoard />
      <AutoSnipeBar />
      <SnipeTargets />
    </>
  );
}

/** Trade-site market: price check a pasted item (tool=price) or the demand + snipe board (tool=board). */
export function MarketTab() {
  const { tool } = useTabRoute();
  return tool === "board" ? <BoardView /> : <PriceView />;
}
