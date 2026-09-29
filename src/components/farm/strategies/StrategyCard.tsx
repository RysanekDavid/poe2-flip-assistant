"use client";

import type { ReactNode } from "react";
import type { StrategyView } from "../../../lib/strategiesContract";
import { ClaimBadge } from "../../ui/ClaimBadge";
import { Panel } from "../../ui/Panel";
import { InfoTip } from "../../ui/Tooltip";
import { MasterChips, NotableList, WaystoneChips } from "./StrategyParts";
import { TabletMods } from "./TabletMods";
import { YieldBasket } from "./YieldBasket";
import { BUDGET_LABEL, MECHANIC_LABEL, pricedCount } from "./strategiesView";

function Section({ title, tip, children }: { title: string; tip?: string; children: ReactNode }) {
  return (
    <section className="grid content-start gap-1.5">
      <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-400">
        {title}
        {tip && <InfoTip tip={tip} label={`About ${title}`} />}
      </h4>
      {children}
    </section>
  );
}

function CardHeader({ strategy }: { strategy: StrategyView }) {
  return (
    <header className="grid gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-lg font-semibold text-neutral-100">{strategy.title}</h3>
        {strategy.mechanics.map((m) => (
          <span key={m} className="rounded border border-line px-1.5 text-xs text-neutral-400">
            {MECHANIC_LABEL[m]}
          </span>
        ))}
        <span className="inline-flex items-center gap-1 rounded border border-line px-1.5 text-xs text-neutral-300" title={strategy.budget.build_needs}>
          budget: {BUDGET_LABEL[strategy.budget.tier]}
        </span>
        <ClaimBadge claim={strategy.budget.claim} />
        <span
          className="rounded border border-line px-1.5 text-xs text-neutral-400"
          title={`status ${strategy.status}; facts checked against ${strategy.patch.verified_against} on ${strategy.patch.stamped_at} (${strategy.patch.leagues.join(", ")})`}
        >
          {strategy.status} · {strategy.patch.verified_against}
        </span>
      </div>
      <p className="text-sm text-neutral-300">{strategy.summary}</p>
    </header>
  );
}

function StepsAndRisks({ strategy }: { strategy: StrategyView }) {
  return (
    <Panel title="Steps and risks" collapsible defaultOpen={false}>
      <div className="grid gap-3 md:grid-cols-2">
        <ol className="list-decimal space-y-1 pl-5 text-sm text-neutral-300">
          {strategy.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <ul className="list-disc space-y-1 pl-5 text-sm text-neutral-400">
          {strategy.risks.length === 0 ? <li>No specific risk recorded.</li> : strategy.risks.map((risk) => <li key={risk}>{risk}</li>)}
        </ul>
      </div>
    </Panel>
  );
}

/** One strategy: master nodes, notables, tablets, waystone totals and the live-priced yield basket. */
export function StrategyCard({ strategy, exPerDiv }: { strategy: StrategyView; exPerDiv: number | null }) {
  const { priced, total } = pricedCount(strategy);
  return (
    <article aria-label={strategy.title} className="grid gap-4 rounded-lg border border-line bg-surface/60 p-4">
      <CardHeader strategy={strategy} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Atlas master" tip="Four master nodes are active at a time; hover a node for its effect.">
          <MasterChips master={strategy.atlas_master} />
        </Section>
        <Section title="Waystone" tip="0.5 waystone mods bundle difficulty with reward; roll for these totals, in this order.">
          <WaystoneChips waystone={strategy.waystone} />
        </Section>
        <Section title="Atlas notables">
          <NotableList passives={strategy.atlas_passives} />
        </Section>
        <Section title="Tablets" tip="Search opens the official trade site with the tablet base and that mod; nothing is bought for you.">
          <TabletMods tablets={strategy.tablets} />
        </Section>
      </div>
      <Section title={`Yield basket · ${priced}/${total} priced`} tip="Live poe.ninja exchange price per item. Unit prices only: drop rates are unknown, so no basket total or Div/hour is claimed.">
        <YieldBasket yields={strategy.yields} exPerDiv={exPerDiv} />
      </Section>
      <StepsAndRisks strategy={strategy} />
    </article>
  );
}
