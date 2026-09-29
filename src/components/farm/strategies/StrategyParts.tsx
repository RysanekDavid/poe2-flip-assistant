"use client";

import { ExternalLink } from "lucide-react";
import waystoneArt from "../../../assets/items/waystone.png";
import { isUnsettledClaim } from "../../../lib/claim";
import { MASTER_LABEL } from "../../../core/strategies/masters";
import type { StrategyView } from "../../../lib/strategiesContract";
import { ClaimBadge } from "../../ui/ClaimBadge";
import { ItemArt } from "../../ui/ItemArt";
import { InfoTip, Tooltip } from "../../ui/Tooltip";
import { evidenceTip, showsBadge, WAYSTONE_LABEL } from "./strategiesView";

const CHIP = "inline-flex h-7 items-center rounded-md border border-line bg-neutral-900/60 px-2 text-xs text-neutral-200";

/**
 * "T2 · Mysterious Gifts" chips; the effect is in the tooltip. A node's own grade shows only when it
 * is unsettled — settled nodes share the master's badge, which cites the same poe2db page.
 */
export function MasterChips({ master }: { master: StrategyView["atlas_master"] }) {
  return (
    <div className="grid gap-1.5">
      <p className="flex flex-wrap items-center gap-2 text-sm text-neutral-100">
        <span className="font-medium">{MASTER_LABEL[master.master]}</span>
        <ClaimBadge claim={master.claim} />
      </p>
      {master.nodes.length > 0 && (
        <ul aria-label={`${MASTER_LABEL[master.master]} nodes`} className="flex flex-wrap gap-1.5">
          {[...master.nodes]
            .sort((a, b) => a.tier - b.tier)
            .map((node) => (
              <li key={node.name} className="inline-flex items-center gap-1">
                <Tooltip tip={node.effect} align="start">
                  <span tabIndex={0} className={`${CHIP} cursor-help`}>
                    T{node.tier} · {node.name}
                  </span>
                </Tooltip>
                {isUnsettledClaim(node.claim.v) && <ClaimBadge claim={node.claim} />}
              </li>
            ))}
        </ul>
      )}
      {master.alt && <p className="text-xs text-neutral-400">Alternative: {master.alt}</p>}
    </div>
  );
}

const PRIORITY_CLASS: Record<StrategyView["atlas_passives"][number]["priority"], string> = {
  core: "border-neutral-500 text-neutral-200",
  recommended: "border-line text-neutral-300",
  optional: "border-line text-neutral-400",
};

/** Atlas notables: name links to poe2db, effect in the tooltip, priority and evidence inline. */
export function NotableList({ passives }: { passives: StrategyView["atlas_passives"] }) {
  if (passives.length === 0) return <p className="text-sm text-neutral-400">No specific notable.</p>;
  return (
    <ul aria-label="Atlas notables" className="grid gap-1">
      {passives.map((p) => (
        <li key={p.name} className="flex flex-wrap items-center gap-2 text-sm">
          <a href={p.poe2db_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-neutral-100 hover:text-amber-200">
            {p.name} <ExternalLink aria-hidden className="h-3 w-3 text-neutral-500" />
          </a>
          {/* The link is the main source; every source and note (e.g. a 0.5.5 change) rides in the tip. */}
          <InfoTip tip={`${p.effect} — ${evidenceTip(p.claim)}`} label={`${p.name} effect`} />
          <span className="text-xs text-neutral-400">{p.tree}</span>
          <span className={`rounded border px-1.5 text-xs ${PRIORITY_CLASS[p.priority]}`}>{p.priority}</span>
          {showsBadge(p.claim) && <ClaimBadge claim={p.claim} />}
        </li>
      ))}
    </ul>
  );
}

/** Waystone totals to roll for, with the reasoning in a tooltip. */
export function WaystoneChips({ waystone }: { waystone: StrategyView["waystone"] }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ItemArt src={waystoneArt.src} size={8} />
      {waystone.prefer.length === 0 ? (
        <span className="text-sm text-neutral-400">No preference</span>
      ) : (
        <ul aria-label="Preferred waystone totals" className="flex flex-wrap gap-1.5">
          {waystone.prefer.map((total, i) => (
            <li key={total} className={CHIP}>
              {i + 1}. {WAYSTONE_LABEL[total]}
            </li>
          ))}
        </ul>
      )}
      <InfoTip tip={waystone.notes} label="Waystone notes" />
      <ClaimBadge claim={waystone.claim} />
    </div>
  );
}
