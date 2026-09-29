"use client";

import Image, { type StaticImageData } from "next/image";
import { CircleHelp } from "lucide-react";
import iconExchange from "../../assets/Currency_exchange.png";
import iconMarket from "../../assets/Web_market.png";
import { CURRENCY_ART } from "../../lib/currencyArt";
import { PICKUP_RULE_TEXT, type PickupHint, type SellRoute } from "../../lib/learnContract";
import { Tooltip } from "../ui/Tooltip";

const ROUTE: Record<SellRoute, { label: string; tip: string; art: StaticImageData | null }> = {
  cx: {
    label: "Currency Exchange",
    tip: "Stackable: sell it in bulk at the Currency Exchange (Ange, in town). No trade-site listing needed.",
    art: iconExchange,
  },
  trade: {
    label: "Trade site",
    tip: "One-of-a-kind item: list it on the official trade site with a buyout price and wait for a whisper.",
    art: iconMarket,
  },
  unknown: {
    label: "No known route",
    tip: "We have no sell route for this kind of item. Check the trade site before you vendor it.",
    art: null,
  },
};

const CHIP = "inline-flex items-center gap-1.5 rounded-md border border-line bg-neutral-900/60 px-2 py-1 text-sm text-neutral-200";

/** Where a new player sells this — art + label, the how-to on hover. */
export function SellRouteBadge({ route }: { route: SellRoute }) {
  const meta = ROUTE[route];
  return (
    <Tooltip tip={meta.tip} side="bottom" align="start">
      <span tabIndex={0} className={CHIP}>
        {meta.art ? (
          <Image src={meta.art} alt="" className="h-5 w-5 object-contain" />
        ) : (
          <CircleHelp aria-hidden className="h-4 w-4 text-neutral-400" />
        )}
        Sell: {meta.label}
      </span>
    </Tooltip>
  );
}

const HINT: Record<PickupHint, { label: string; tone: string }> = {
  pick_up: { label: "Pick it up", tone: "text-good" },
  low_value: { label: "Probably skip", tone: "text-neutral-300" },
  unknown: { label: "No live price", tone: "text-neutral-400" },
};

/** The "pick up?" rule of thumb, labelled as such so nobody reads it as a verdict. */
export function PickupHintBadge({ hint }: { hint: PickupHint }) {
  const meta = HINT[hint];
  return (
    <Tooltip tip={PICKUP_RULE_TEXT} side="bottom" align="start">
      <span tabIndex={0} className={CHIP}>
        <img src={CURRENCY_ART.ex} alt="" className="h-4 w-4 object-contain" />
        <span className="text-xs uppercase tracking-wider text-neutral-400">Rule of thumb</span>
        <span className={meta.tone}>{meta.label}</span>
      </span>
    </Tooltip>
  );
}
