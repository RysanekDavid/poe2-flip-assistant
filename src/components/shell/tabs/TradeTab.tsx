"use client";

import dynamic from "next/dynamic";
import { PageHeader } from "../../ui/PageHeader";
import { PanelLoading } from "../PanelLoading";
import { TAB_ICONS } from "../tabIcons";
import { useTabRoute } from "../useTabRoute";

const PricesTool = dynamic(() => import("../../market/prices/PricesTool").then((m) => m.PricesTool), {
  loading: PanelLoading,
});

const OpportunitiesTool = dynamic(() => import("../../market/opportunities/OpportunitiesTool").then((m) => m.OpportunitiesTool), {
  loading: PanelLoading,
});

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
        art={TAB_ICONS.trade.src}
      />
      <PriceCheckTool />
    </>
  );
}

/**
 * What things are worth: a price check of a pasted item (tool=price, the default), every exchange
 * item (tool=prices), or what to buy on the trade site now (tool=opportunities).
 */
export function TradeTab() {
  const { tool } = useTabRoute();
  switch (tool) {
    case "opportunities":
      return <OpportunitiesTool />;
    case "price":
      return <PriceView />;
    case "prices":
      return <PricesTool />;
    default:
      throw new Error(`TradeTab: unknown tool ${String(tool)}`);
  }
}
