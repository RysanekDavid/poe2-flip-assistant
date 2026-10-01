"use client";

import type { AnyStrategyView, LiquidateView, PricedRef, RollSellView, TradeMethodView } from "../../../lib/strategiesContract";
import { ItemArt } from "../../ui/ItemArt";
import { CardFrame } from "./CardFrame";
import { ClaimBadge } from "../../ui/ClaimBadge";
import { ConversionRow, NotePill, ProfitPill, RefChip, rollBaseArt } from "./KindParts";
import { ladderSummary, profitHeadline, RARITY_LABEL, rankConversions, SELL_UNIT_LABEL, SELL_UNIT_TIP } from "./kindHelpers";
import { ModRow } from "./TabletMods";
import { StatusBadge } from "./StrategyBits";
import { MECHANIC_LABEL } from "./strategiesView";

interface KindCardProps<V> {
  strategy: V;
  exPerDiv: number | null;
  onOpen: (id: string) => void;
}

const CHIP = "inline-flex h-7 items-center rounded-md border border-line px-2 text-xs text-neutral-300";

function kindLabel(mechanics: readonly AnyStrategyView["mechanics"][number][], fallback: string): string {
  return mechanics.length > 0 ? mechanics.map((m) => MECHANIC_LABEL[m]).join(" · ") : fallback;
}

/** Each distinct currency the roll steps spend, as art in step order. */
function rollCurrencies(strategy: RollSellView): PricedRef[] {
  return [...new Map(strategy.roll_steps.flatMap((s) => s.currencies).map((c) => [c.id, c])).values()];
}

const ROLL_UNPRICED = "No live price: rolled tablets sell on the trade site, where asks are not sales. Use the Search link on a mod.";

function RollHeadline({ strategy, exPerDiv }: { strategy: RollSellView; exPerDiv: number | null }) {
  return <ProfitPill headline={profitHeadline(strategy.price_refs, exPerDiv, ROLL_UNPRICED)} />;
}

/** Craft › Roll & sell card: what to roll, the mods that sell (with a trade search), how it is listed. */
export function RollSellCard({ strategy, exPerDiv, onOpen }: KindCardProps<RollSellView>) {
  return (
    <CardFrame
      id={strategy.id}
      title={strategy.title}
      art={rollBaseArt(strategy.target.base)}
      label={kindLabel(strategy.mechanics, strategy.target.base)}
      headline={<RollHeadline strategy={strategy} exPerDiv={exPerDiv} />}
      meters={strategy}
      footer={
        <span className="flex min-w-0 flex-wrap items-center gap-1.5">
          {rollCurrencies(strategy).map((c) => (
            <span key={c.id} title={c.name} className="inline-flex">
              <ItemArt src={c.icon_url} size={5} alt={c.name} />
            </span>
          ))}
          <StatusBadge strategy={strategy} />
        </span>
      }
      cta="How to roll it"
      onOpen={onOpen}
    >
      {strategy.target_mods.length > 0 && (
        <ul aria-label="Target mods" onClick={(e) => e.stopPropagation()}>
          {strategy.target_mods.slice(0, 2).map((mod) => (
            <ModRow key={mod.text} mod={mod} base={strategy.target.base} />
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={CHIP} title="rarity the method rolls">
          {strategy.target.rarity.map((r) => RARITY_LABEL[r]).join(" / ")}
        </span>
        <span className={CHIP} title={SELL_UNIT_TIP[strategy.sell_unit]}>
          {SELL_UNIT_LABEL[strategy.sell_unit]}
        </span>
        {strategy.sell_ref && <RefChip item={strategy.sell_ref} exPerDiv={exPerDiv} />}
      </div>
    </CardFrame>
  );
}

function TradeHeadline({ strategy, exPerDiv }: { strategy: TradeMethodView; exPerDiv: number | null }) {
  const unpriced = "No live EV: the results of this method do not trade on the currency exchange.";
  return <ProfitPill headline={profitHeadline(strategy.price_refs, exPerDiv, unpriced)} />;
}

/** Inputs → outputs as art where the legs are catalog items, else the first leg's words. */
function LegStrip({ strategy, exPerDiv }: { strategy: TradeMethodView; exPerDiv: number | null }) {
  const priced = [...strategy.inputs, ...strategy.outputs].flatMap((leg) => (leg.ref ? [leg.ref] : []));
  const loss = strategy.odds.loss_chance;
  return (
    <div className="grid gap-1.5">
      {priced.length === 0 ? (
        <p className="text-sm text-neutral-300">{strategy.inputs[0]?.text}</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {priced.slice(0, 3).map((ref) => (
            <RefChip key={ref.id} item={ref} exPerDiv={exPerDiv} />
          ))}
        </div>
      )}
      {loss !== null && loss > 0 && (
        <p className="flex flex-wrap items-center gap-1.5 text-xs text-neutral-400">
          {`${Math.round(loss * 100)}% of attempts lose the item`} <ClaimBadge claim={strategy.odds.claim} />
        </p>
      )}
    </div>
  );
}

/** Trade › Methods card: inputs → outputs and, where every leg is priced, the best live EV. */
export function TradeMethodCard({ strategy, exPerDiv, onOpen }: KindCardProps<TradeMethodView>) {
  const ranked = rankConversions(strategy.price_refs);
  const summary = ladderSummary(strategy.price_refs);
  const art = [...strategy.outputs, ...strategy.inputs].find((leg) => leg.ref?.icon_url)?.ref?.icon_url ?? ranked[0]?.outputs[0]?.ref.icon_url ?? null;
  return (
    <CardFrame
      id={strategy.id}
      title={strategy.title}
      art={art}
      label={kindLabel(strategy.mechanics, "Trade method")}
      headline={<TradeHeadline strategy={strategy} exPerDiv={exPerDiv} />}
      meters={strategy}
      footer={
        <span className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-neutral-400">
          {summary}
          <StatusBadge strategy={strategy} />
        </span>
      }
      cta="How it works"
      onOpen={onOpen}
    >
      {ranked.length > 0 ? (
        <ul aria-label="Best conversions today" className="divide-y divide-line/60">
          {ranked.slice(0, 2).map((c) => (
            <ConversionRow key={`${c.inputs[0]?.ref.id}>${c.outputs[0]?.ref.id}`} conversion={c} exPerDiv={exPerDiv} />
          ))}
        </ul>
      ) : (
        <LegStrip strategy={strategy} exPerDiv={exPerDiv} />
      )}
    </CardFrame>
  );
}

/** A liquidation list: what to sell, where. */
export function LiquidateCard({ strategy, exPerDiv, onOpen }: KindCardProps<LiquidateView>) {
  const refs = strategy.items.flatMap((leg) => (leg.ref ? [leg.ref] : []));
  return (
    <CardFrame
      id={strategy.id}
      title={strategy.title}
      art={refs[0]?.icon_url ?? null}
      label={kindLabel(strategy.mechanics, "Liquidate")}
      headline={<NotePill text={`${strategy.items.length} items`} tip={strategy.sell_route} />}
      meters={strategy}
      footer={<StatusBadge strategy={strategy} />}
      cta="What to sell"
      onOpen={onOpen}
    >
      <div className="flex flex-wrap gap-1.5">
        {refs.slice(0, 3).map((ref) => (
          <RefChip key={ref.id} item={ref} exPerDiv={exPerDiv} />
        ))}
      </div>
    </CardFrame>
  );
}
