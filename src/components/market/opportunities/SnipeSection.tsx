"use client";

import { ExternalLink, Radar } from "lucide-react";
import { fmtDivOrEx } from "../../../lib/format";
import type { Budget, SnipeSection as Section } from "../../../lib/opportunitiesContract";
import type { NearMiss } from "../../../lib/snipeScanContract";
import { SnipeCardView } from "../../alerts/SnipeCardView";
import { EmptyState } from "../../ui/EmptyState";
import { ItemArt } from "../../ui/ItemArt";
import { Panel } from "../../ui/Panel";
import { InfoTip } from "../../ui/Tooltip";
import { ageSince, fmtDiv } from "./opportunityFormat";

const ABOUT =
  "Snipes: listings the background scanner valued on comparable asks and found far under value. A card stays while the " +
  "listing is under 2 h old and no re-check saw it gone. Near-misses: under value, but not by enough, or on too few " +
  "comparables. Buy by hand on the trade site; nothing here trades for you.";

function nearMissTip(n: NearMiss): string {
  const basis = n.basis === "book" ? "price book (recorded asks)" : "live comparable search";
  return [
    `${n.archetype} · valued ${fmtDivOrEx(n.valueDiv, n.exaltPerDivine)} from the ${basis}, ${n.samples} sample${n.samples === 1 ? "" : "s"}`,
    `not a snipe: ${n.detail}`,
    `listed ${n.listedAt ? ageSince(n.listedAt) : "?"} ago`,
  ].join("\n");
}

function NearMissRow({ n }: { n: NearMiss }) {
  return (
    <li className="flex items-center gap-3 rounded-lg border border-line bg-neutral-950/40 px-3 py-2">
      <ItemArt src={n.icon} size={8} />
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate text-sm font-medium text-neutral-100">{n.name}</span>
        <span className="block truncate text-xs text-neutral-400">{n.baseType}</span>
      </span>
      <span className="shrink-0 text-right text-sm tabular-nums leading-tight" title={nearMissTip(n)}>
        <span className="block text-neutral-100">
          {fmtDivOrEx(n.priceDiv, n.exaltPerDivine)} <span className="text-neutral-400">→ ~{fmtDivOrEx(n.valueDiv, n.exaltPerDivine)}</span>
        </span>
        <span className="block text-xs text-neutral-300">
          −{Math.round(n.marginPct)}% · {n.reason === "thin-reference" ? "few comps" : "near-miss"}
        </span>
      </span>
      <a href={n.tradeUrl} target="_blank" rel="noopener noreferrer" aria-label={`open ${n.name} on the trade site`} className="shrink-0 text-sky-400 hover:text-sky-300">
        <ExternalLink aria-hidden className="h-4 w-4" />
      </a>
    </li>
  );
}

function emptySentence(section: Section, budget: Budget): string {
  if (!section.scannerEnabled) return "The scheduled snipe scan is switched off; only scans the owner starts by hand still look for snipes.";
  if (section.overBudget > 0) {
    const cap = budget.capDiv === null ? "" : ` (≤ ${fmtDiv(budget.capDiv)} Div)`;
    return `${section.overBudget} under-value listing${section.overBudget === 1 ? " costs" : "s cost"} more than your budget${cap}.`;
  }
  return "Nothing is under value right now. The scanner keeps looking, and new snipes also arrive in Alerts.";
}

/** Still-live snipe cards, then up to three near-misses; one honest line when there is neither. */
export function SnipeSection({ section, budget }: { section: Section; budget: Budget }) {
  const empty = section.cards.length === 0 && section.nearMisses.length === 0;
  const right = (
    <>
      {section.overBudget > 0 && !empty && (
        <span className="text-xs text-neutral-400" title="hidden because they cost more than your budget">
          +{section.overBudget} over budget
        </span>
      )}
      <InfoTip tip={ABOUT} label="About under-value listings" side="bottom" align="end" />
    </>
  );
  return (
    <Panel title="Under value now" right={right}>
      {section.reportError && (
        <p role="alert" className="mb-2 text-xs text-warn">
          last scan report unreadable: {section.reportError}
        </p>
      )}
      {empty && <EmptyState icon={<Radar className="h-5 w-5" />} sentence={emptySentence(section, budget)} />}
      {section.cards.length > 0 && (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {section.cards.map((s) => (
            <SnipeCardView key={s.alertId} alert={{ seen: s.seen, created_at: s.createdAt, foreign_league: s.foreignLeague }} card={s.card} />
          ))}
        </div>
      )}
      {section.nearMisses.length > 0 && (
        <ul className={`grid gap-2 ${section.cards.length > 0 ? "mt-3" : ""}`} aria-label="near-misses">
          {section.nearMisses.map((n) => (
            <NearMissRow key={n.listingId} n={n} />
          ))}
        </ul>
      )}
    </Panel>
  );
}
