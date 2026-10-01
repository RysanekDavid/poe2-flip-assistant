"use client";

import { KindBoard } from "../../farm/strategies/KindBoard";
import { TAB_ICONS } from "../../shell/tabIcons";

const KINDS = ["roll_and_sell"] as const;

const LEGEND =
  "Each card is an item worth rolling for one mod and selling: the target base, the mods buyers search for (Search opens the trade site " +
  "with that mod), the currency each step spends at today's exchange price, and how it is listed. Rolled items are priced on the trade " +
  "site, so a card shows a live EV only for a deterministic bench step. Creator methods are graded as such; amber means test it first.";

/** Craft › Roll & sell: items you roll for a mod buyers pay for, and how to sell them. */
export function RollSellTool() {
  return (
    <KindBoard
      kinds={KINDS}
      label="craft roll & sell"
      title="Roll & sell"
      purpose="Roll a tablet or waystone for the mod buyers pay for, then sell it the way they buy it."
      legend={LEGEND}
      art={TAB_ICONS.craft.src}
      noun="method"
    />
  );
}
