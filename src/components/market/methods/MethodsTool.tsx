"use client";

import { KindBoard } from "../../farm/strategies/KindBoard";
import { TAB_ICONS } from "../../shell/tabIcons";

const KINDS = ["trade"] as const;

const LEGEND =
  "Each card turns items into other items. Where every leg trades on the exchange, the EV is today's poe.ninja price of the output minus " +
  "the inputs — a gross margin before the gold fee and the buy/sell spread. A leg without a price shows '—' and is named on hover. " +
  "Random outcomes get no EV; community odds are graded as community.";

/** Trade › Methods: ways to turn items into more value — bench ladders, corruption gambles, collections. */
export function MethodsTool() {
  return (
    <KindBoard
      kinds={KINDS}
      label="trade methods"
      title="Methods"
      purpose="Ways to turn items into more value, with the live margin wherever every leg has an exchange price."
      legend={LEGEND}
      art={TAB_ICONS.trade.src}
      noun="method"
    />
  );
}
