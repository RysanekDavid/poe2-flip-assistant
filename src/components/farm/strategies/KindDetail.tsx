"use client";

import { useId, useState, type ReactNode } from "react";
import type { RollSellView, StrategiesResponse, TradeMethodView } from "../../../lib/strategiesContract";
import { fmtDivOrEx } from "../../../lib/format";
import { ClaimBadge } from "../../ui/ClaimBadge";
import { ItemArt } from "../../ui/ItemArt";
import { PriceChip } from "../../ui/PriceChip";
import { ProvenanceChip } from "../../ui/ProvenanceChip";
import { ConversionList, LegList, RefChip, rollBaseArt } from "./KindParts";
import { attemptCost, breakEvenResult, RARITY_LABEL, rankConversions, SELL_UNIT_LABEL, SELL_UNIT_TIP } from "./kindHelpers";
import { DurabilityNote } from "./Durability";
import { StatusBadge, StrategyMeters } from "./StrategyBits";
import { RatingReasons, Section } from "./StrategyDetail";
import { leagueMismatch } from "./strategiesView";
import { ModRow } from "./TabletMods";

type Board = Pick<StrategiesResponse, "computedLeague" | "exPerDiv" | "pricesFetchedAt">;
type Shared = Pick<RollSellView, "summary" | "budget" | "ratings" | "durability" | "status" | "patch" | "risks">;

function Overview({ strategy, league }: { strategy: Shared; league: string }) {
  const mismatch = leagueMismatch(strategy.patch.leagues, league);
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge strategy={strategy} />
        {mismatch && <span className="inline-flex h-6 items-center rounded border border-amber-400/40 px-1.5 text-xs text-amber-300">{mismatch}</span>}
      </div>
      <p className="text-sm text-neutral-300">{strategy.summary}</p>
      <StrategyMeters strategy={strategy} />
      <RatingReasons strategy={strategy} />
      <Section title="Why it keeps working" tip="The game mechanic behind the method, and what would end it. Profit itself is only what live prices show.">
        <DurabilityNote durability={strategy.durability} />
      </Section>
    </div>
  );
}

function Closing({ strategy, children }: { strategy: Shared; children?: ReactNode }) {
  return (
    <>
      {children}
      <Section title="When it goes wrong">
        <ul className="list-disc space-y-1 pl-5 text-sm text-neutral-300">
          {strategy.risks.length === 0 ? <li>No specific risk recorded.</li> : strategy.risks.map((risk) => <li key={risk}>{risk}</li>)}
        </ul>
      </Section>
      <p className="text-xs text-neutral-400">
        Facts checked against {strategy.patch.verified_against} on {strategy.patch.stamped_at}. Unmarked facts come from poe2db or the trade site; a grade chip marks the rest, and amber means test it in game first.
      </p>
    </>
  );
}

function PriceProvenance({ data }: { data: Board }) {
  return <ProvenanceChip label="Price" source="poe.ninja (GGG exchange)" at={data.pricesFetchedAt} warnAfterMin={180} title={`league ${data.computedLeague}`} />;
}

const EV_TIP = "Gross margin per craft at today's exchange prices: the gold fee and the buy/sell spread are not taken off. '—' names the leg with no price.";

function RollSteps({ strategy, exPerDiv }: { strategy: RollSellView; exPerDiv: number | null }) {
  return (
    <ol className="grid list-decimal gap-2 pl-5 text-sm text-neutral-300">
      {strategy.roll_steps.map((step) => (
        <li key={step.action}>
          <span>{step.action}</span> <ClaimBadge claim={step.claim} />
          {step.currencies.length > 0 && (
            <span className="mt-1 flex flex-wrap gap-1.5">
              {step.currencies.map((c) => (
                <RefChip key={c.id} item={c} exPerDiv={exPerDiv} />
              ))}
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}

/** The Roll & sell drawer: target base and mods (with searches), the roll, any bench EV, and how it sells. */
export function RollSellDetail({ strategy, data }: { strategy: RollSellView; data: Board }) {
  return (
    <div className="grid gap-6">
      <Overview strategy={strategy} league={data.computedLeague} />
      <Section title="Target" tip="Search opens the official trade site with this base and that mod; nothing is bought for you.">
        <p className="flex flex-wrap items-center gap-2 text-sm text-neutral-100">
          <ItemArt src={rollBaseArt(strategy.target.base)} size={8} />
          {strategy.target.base} · {strategy.target.rarity.map((r) => RARITY_LABEL[r]).join(" / ")}
          <ClaimBadge claim={strategy.target.claim} />
        </p>
        {strategy.target_mods.length > 0 && (
          <ul aria-label="Target mods">
            {strategy.target_mods.map((mod) => (
              <ModRow key={mod.text} mod={mod} base={strategy.target.base} />
            ))}
          </ul>
        )}
      </Section>
      <Section title="How to roll it" right={<PriceProvenance data={data} />}>
        <RollSteps strategy={strategy} exPerDiv={data.exPerDiv} />
      </Section>
      {strategy.price_refs.length > 0 && (
        <Section title="Bench EV" tip={EV_TIP}>
          <ConversionList conversions={rankConversions(strategy.price_refs)} exPerDiv={data.exPerDiv} />
        </Section>
      )}
      <Section title="Selling it" tip={SELL_UNIT_TIP[strategy.sell_unit]}>
        <p className="flex flex-wrap items-center gap-2 text-sm text-neutral-200">
          {SELL_UNIT_LABEL[strategy.sell_unit]}
          {strategy.sell_ref && <RefChip item={strategy.sell_ref} exPerDiv={data.exPerDiv} />}
        </p>
        <p className="text-sm text-neutral-300">
          {strategy.demand.why} <ClaimBadge claim={strategy.demand.claim} />
        </p>
      </Section>
      <Closing strategy={strategy} />
    </div>
  );
}

/** What the calculator says under its input, or why it says nothing yet. */
function calculatorHint(raw: string, itemDiv: number, unpriced: readonly string[]): string | null {
  if (raw.trim() === "") return null;
  if (!(itemDiv > 0)) return "enter a value above 0";
  return unpriced.length > 0 ? `no exchange price for ${unpriced.join(", ")}` : null;
}

/**
 * For a gamble with a known loss chance: the player types what their item is worth. The expected
 * cost of one attempt is the priced consumables plus that chance of losing the item; the result
 * only pays when it survives, so its break-even price is that cost over the survival chance.
 */
function LossCalculator({ strategy, exPerDiv }: { strategy: TradeMethodView; exPerDiv: number | null }) {
  const inputId = useId();
  const [raw, setRaw] = useState("");
  const loss = strategy.odds.loss_chance;
  if (loss === null || loss === 0) return null;
  const consumables = strategy.inputs.flatMap((leg) => (leg.ref ? [leg.ref] : []));
  const itemDiv = Number(raw);
  const prices = consumables.map((ref) => ref.price?.div ?? null);
  const cost = raw.trim() === "" ? null : attemptCost(loss, itemDiv, prices);
  const floor = raw.trim() === "" ? null : breakEvenResult(loss, itemDiv, prices);
  const hint = calculatorHint(raw, itemDiv, consumables.filter((ref) => !ref.price).map((ref) => ref.name));
  return (
    <Section title="Cost per attempt" tip={`Consumables at today's exchange prices plus a ${Math.round(loss * 100)}% chance (the graded odds above) of losing your item.`}>
      <label htmlFor={inputId} className="flex flex-wrap items-center gap-2 text-sm text-neutral-300">
        Your item is worth
        <input
          id={inputId}
          type="number"
          min={0}
          step="any"
          inputMode="decimal"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder="div"
          className="h-7 w-24 rounded-md border border-neutral-700 bg-neutral-900 px-2 text-sm text-neutral-100 placeholder:text-neutral-500"
        />
        div
      </label>
      <p className="flex flex-wrap items-center gap-2 text-sm text-neutral-200">
        Expected cost of one attempt:
        {cost !== null ? <PriceChip div={cost} exPerDiv={exPerDiv} /> : <span className="text-neutral-400">—</span>}
        {cost === null && hint && <span className="text-xs text-neutral-400">{hint}</span>}
      </p>
      {cost !== null && floor !== null && (
        <p className="text-xs text-neutral-400">
          Only worth trying if the result you want sells for at least {fmtDivOrEx(floor, exPerDiv ?? 0)} ({fmtDivOrEx(floor - itemDiv, exPerDiv ?? 0)} more than your item), since it only pays when the item survives — and the real bar is higher, as not every surviving attempt hits that result.
        </p>
      )}
    </Section>
  );
}

/** The Methods drawer: what goes in and comes out, the graded odds, the live EV where every leg is priced. */
export function TradeMethodDetail({ strategy, data }: { strategy: TradeMethodView; data: Board }) {
  return (
    <div className="grid gap-6">
      <Overview strategy={strategy} league={data.computedLeague} />
      <div className="grid gap-4 md:grid-cols-2">
        <Section title="You put in" right={<PriceProvenance data={data} />}>
          <LegList legs={strategy.inputs} exPerDiv={data.exPerDiv} label="Inputs" />
        </Section>
        <Section title="You get">
          <LegList legs={strategy.outputs} exPerDiv={data.exPerDiv} label="Outputs" />
        </Section>
      </div>
      <Section title="Odds">
        <p className="text-sm text-neutral-300">
          {strategy.odds.text} <ClaimBadge claim={strategy.odds.claim} />
        </p>
      </Section>
      <LossCalculator strategy={strategy} exPerDiv={data.exPerDiv} />
      {strategy.price_refs.length > 0 && (
        <Section title="Live EV, best first" tip={EV_TIP}>
          <ConversionList conversions={rankConversions(strategy.price_refs)} exPerDiv={data.exPerDiv} />
        </Section>
      )}
      <Closing strategy={strategy}>
        <Section title="Steps">
          <ol className="list-decimal space-y-1 pl-5 text-sm text-neutral-300">
            {strategy.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </Section>
      </Closing>
    </div>
  );
}
