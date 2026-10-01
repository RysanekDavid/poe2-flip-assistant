"use client";

import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import waystoneArt from "../../../assets/items/waystone.png";
import { RATING_LABEL } from "../../../core/strategies/ratings";
import type { RatingKey } from "../../../core/strategies/schema";
import type { StrategiesResponse, StrategyView } from "../../../lib/strategiesContract";
import { ClaimBadge } from "../../ui/ClaimBadge";
import { ItemArt } from "../../ui/ItemArt";
import { ProvenanceChip } from "../../ui/ProvenanceChip";
import { InfoTip } from "../../ui/Tooltip";
import { StatusBadge, StrategyMeters, TrendPill, WaystoneRegexLink } from "./StrategyBits";
import { MasterChips, NotableList, WaystoneChips } from "./StrategyParts";
import { leagueMismatch, MECHANIC_LABEL } from "./strategiesView";
import { tabletArtSrc } from "./tabletArtImages";
import { TabletMods } from "./TabletMods";
import { YieldBasket } from "./YieldBasket";

function Section({ title, tip, right, children }: { title: string; tip?: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="grid content-start gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-400">
          {title}
          {tip && <InfoTip tip={tip} label={`About ${title}`} />}
        </h3>
        {right}
      </div>
      {children}
    </section>
  );
}

/** Why each bar sits where it does, with its evidence grade: the ratings are curated, so they show their work. */
function RatingReasons({ strategy }: { strategy: StrategyView }) {
  const rows: { label: string; why: string; claim: StrategyView["budget"]["claim"] }[] = [
    { label: "Budget", why: strategy.budget.why, claim: strategy.budget.claim },
    ...(["build", "complexity"] as const satisfies readonly RatingKey[]).map((key) => ({
      label: RATING_LABEL[key],
      why: strategy.ratings[key].why,
      claim: strategy.ratings[key].claim,
    })),
  ];
  return (
    <dl className="grid gap-1 text-sm">
      {rows.map((row) => (
        <div key={row.label} className="flex flex-wrap items-baseline gap-x-2">
          <dt className="w-24 shrink-0 text-xs uppercase tracking-wide text-neutral-400">{row.label}</dt>
          <dd className="min-w-0 flex-1 text-neutral-300">
            {row.why} <ClaimBadge claim={row.claim} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Overview({ strategy, league }: { strategy: StrategyView; league: string }) {
  const mismatch = leagueMismatch(strategy.patch.leagues, league);
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {strategy.mechanics.map((m) => (
          <span key={m} className="inline-flex h-6 items-center rounded border border-line px-1.5 text-xs text-neutral-300">
            {MECHANIC_LABEL[m]}
          </span>
        ))}
        <StatusBadge strategy={strategy} />
        {mismatch && <span className="inline-flex h-6 items-center rounded border border-amber-400/40 px-1.5 text-xs text-amber-300">{mismatch}</span>}
        <span className="ml-auto">
          <TrendPill trend={strategy.trend} />
        </span>
      </div>
      <p className="text-sm text-neutral-300">{strategy.summary}</p>
      <StrategyMeters strategy={strategy} />
      <RatingReasons strategy={strategy} />
    </div>
  );
}

/** Bring → do → payout, Juice-Box style: what goes into the map, the steps, what comes out. */
function HowItRuns({ strategy }: { strategy: StrategyView }) {
  return (
    <Section title="How it runs">
      <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-400">
        <span>Bring</span>
        {strategy.tablets.map((t, i) => (
          <span key={`${i}|${t.type}|${t.unique ?? ""}`} title={t.unique ? `${t.unique} (${t.type})` : t.type} className="inline-flex items-center gap-0.5 text-neutral-300">
            <ItemArt src={tabletArtSrc(t)} size={6} alt={t.unique ?? t.type} />
            {t.count !== null && t.count > 1 && `×${t.count}`}
          </span>
        ))}
        {strategy.waystone.prefer.length > 0 && <ItemArt src={waystoneArt.src} size={6} alt="Waystone" />}
        <ArrowRight aria-hidden className="h-4 w-4" />
        <span>Payout</span>
        {strategy.yields.slice(0, 5).map((y) => (
          <span key={y.ref.id} title={y.ref.name} className="inline-flex">
            <ItemArt src={y.icon_url} size={6} alt={y.ref.name} />
          </span>
        ))}
      </div>
      <ol className="list-decimal space-y-1 pl-5 text-sm text-neutral-300">
        {strategy.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
    </Section>
  );
}

function SetUp({ strategy }: { strategy: StrategyView }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Section title="Atlas master" tip="Four master nodes are active at a time; hover a node for its effect.">
        <MasterChips master={strategy.atlas_master} />
      </Section>
      <Section title="Waystone" tip="Roll for these totals, in this order." right={<WaystoneRegexLink waystone={strategy.waystone} />}>
        <WaystoneChips waystone={strategy.waystone} />
      </Section>
      <Section title="Atlas notables">
        <NotableList passives={strategy.atlas_passives} />
      </Section>
      <Section title="Tablets" tip="Search opens the official trade site with the tablet base and that mod; nothing is bought for you.">
        <TabletMods tablets={strategy.tablets} />
      </Section>
    </div>
  );
}

interface DetailProps {
  strategy: StrategyView;
  data: Pick<StrategiesResponse, "computedLeague" | "exPerDiv" | "pricesFetchedAt">;
}

/** The drawer body: overview and ratings, the run, the full setup, the priced loot and what can go wrong. */
export function StrategyDetail({ strategy, data }: DetailProps) {
  const loot = (
    <>
      <ProvenanceChip label="Price" source="poe.ninja (GGG exchange)" at={data.pricesFetchedAt} warnAfterMin={180} title={`league ${data.computedLeague}`} />
      <ProvenanceChip label="Drop pool" source="game data (poe2db)" title="which items the mechanic can drop, from poe2db unless a row's grade chip says otherwise; how often is unknown" />
    </>
  );
  return (
    <div className="grid gap-6">
      <Overview strategy={strategy} league={data.computedLeague} />
      <HowItRuns strategy={strategy} />
      <SetUp strategy={strategy} />
      <Section title="Loot" tip="Unit prices only: drop rates are unknown, so no total or Div/hour is claimed." right={loot}>
        <YieldBasket yields={strategy.yields} exPerDiv={data.exPerDiv} />
      </Section>
      <Section title="When it goes wrong">
        <ul className="list-disc space-y-1 pl-5 text-sm text-neutral-300">
          {strategy.risks.length === 0 ? <li>No specific risk recorded.</li> : strategy.risks.map((risk) => <li key={risk}>{risk}</li>)}
        </ul>
      </Section>
      <p className="text-xs text-neutral-400">
        Facts checked against {strategy.patch.verified_against} on {strategy.patch.stamped_at}. Unmarked facts come from poe2db or the trade site; a grade chip marks the rest, and amber means test it in game first.
      </p>
    </div>
  );
}
