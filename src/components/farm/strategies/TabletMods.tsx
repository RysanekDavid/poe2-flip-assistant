"use client";

import { Search } from "lucide-react";
import type { TabletView } from "../../../lib/strategiesContract";
import { ClaimBadge } from "../../ui/ClaimBadge";
import { ItemArt } from "../../ui/ItemArt";
import { Tooltip } from "../../ui/Tooltip";
import { evidenceTip, showsBadge } from "./strategiesView";
import { tabletArtSrc } from "./tabletArtImages";

/** One mod with its side, evidence and a trade2 search for `base` with that mod when its stat id is known. */
export function ModRow({ mod, base }: { mod: TabletView["mods"][number]; base: string }) {
  return (
    <li className="flex items-start gap-2 py-0.5 text-sm text-neutral-300">
      {/* A magic tablet holds one prefix and one suffix; a unique's mods are fixed, so no tag. */}
      {mod.side !== "unique" && <span className="mt-0.5 w-12 shrink-0 text-xs text-neutral-400">{mod.side}</span>}
      <span className="min-w-0 flex-1">
        {showsBadge(mod.claim) ? (
          <>
            {mod.text} <ClaimBadge claim={mod.claim} />
          </>
        ) : (
          <Tooltip tip={evidenceTip(mod.claim)} align="start">
            <span tabIndex={0} className="cursor-help">
              {mod.text}
            </span>
          </Tooltip>
        )}
      </span>
      {mod.search_url && (
        <a
          href={mod.search_url}
          target="_blank"
          rel="noreferrer"
          title={`Open a trade2 search: ${base} with this mod (you buy manually)`}
          className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-neutral-700 px-2 text-xs text-neutral-300 hover:border-neutral-500 hover:text-neutral-100"
        >
          <Search aria-hidden className="h-3.5 w-3.5" />
          Search
        </a>
      )}
    </li>
  );
}

function TabletBlock({ tablet }: { tablet: TabletView }) {
  const label = tablet.unique ? `${tablet.unique} (${tablet.type})` : tablet.type;
  return (
    <li className="flex gap-2">
      <ItemArt src={tabletArtSrc(tablet)} size={8} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-neutral-100">
          {label}
          {tablet.count !== null && tablet.count > 1 && <span className="ml-1.5 text-xs text-neutral-400">× {tablet.count}</span>}
        </p>
        <ul aria-label={`${label} mods`}>
          {tablet.mods.map((mod) => (
            <ModRow key={mod.text} mod={mod} base={tablet.type} />
          ))}
        </ul>
      </div>
    </li>
  );
}

/** Tablets to slot, each mod with its evidence grade and a trade2 search when its stat id is known. */
export function TabletMods({ tablets }: { tablets: readonly TabletView[] }) {
  if (tablets.length === 0) return <p className="text-sm text-neutral-400">No tablet in this strategy.</p>;
  return (
    <ul aria-label="Tablets" className="grid gap-3">
      {tablets.map((tablet, index) => (
        // Two runs may slot the same base with different mods, so the position is part of the key.
        <TabletBlock key={`${index}|${tablet.type}|${tablet.unique ?? ""}`} tablet={tablet} />
      ))}
    </ul>
  );
}
