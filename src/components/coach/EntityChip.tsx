"use client";

import { ExternalLink } from "lucide-react";
import { ENTITY_KIND_LABEL } from "../../core/entities/schema";
import type { CoachEntity } from "../../lib/coachContract";
import { HoverCard } from "../ui/HoverCard";
import { ItemArt } from "../ui/ItemArt";
import { PriceChip } from "../ui/PriceChip";
import { fmtAgeMin } from "../ui/StaleBadge";

// Amber dotted underline + help cursor: reads as "hover me" without a second accent colour.
const CHIP_CLASS =
  "mx-px inline-flex cursor-help items-baseline gap-1 rounded px-0.5 text-amber-200 underline decoration-amber-500/60 decoration-dotted underline-offset-4 hover:bg-amber-950/40 hover:text-amber-100 focus-visible:outline focus-visible:outline-1 focus-visible:outline-amber-400/70";

function ageMinutes(iso: string | null): number | undefined {
  if (iso === null) return undefined;
  const at = Date.parse(iso);
  return Number.isFinite(at) ? (Date.now() - at) / 60_000 : undefined;
}

function EntityPrice({ entity }: { entity: CoachEntity }) {
  if (entity.price_div === null) return null;
  const age = ageMinutes(entity.price_at);
  return (
    <div className="mt-2 flex items-center gap-2 border-t border-line pt-2 text-xs text-neutral-400">
      <PriceChip div={entity.price_div} exPerDiv={null} source="ninja" ageMin={age} />
      <span>poe.ninja reference{age === undefined ? "" : ` · ${fmtAgeMin(age)} old`}</span>
    </div>
  );
}

export function EntityCard({ entity }: { entity: CoachEntity }) {
  return (
    <div>
      <div className="flex items-start gap-3">
        <ItemArt src={entity.icon_url} size={12} alt={entity.name} />
        <div className="min-w-0">
          <div className="font-semibold text-neutral-50">{entity.name}</div>
          <div className="text-xs uppercase tracking-wider text-neutral-400">{ENTITY_KIND_LABEL[entity.kind]}</div>
        </div>
      </div>
      {entity.summary ? (
        <p className="mt-2 leading-6 text-neutral-200">{entity.summary}</p>
      ) : (
        <p className="mt-2 text-xs text-neutral-400">No in-game description in the game data.</p>
      )}
      {entity.directions && <p className="mt-1.5 text-xs leading-5 text-neutral-400">{entity.directions}</p>}
      <EntityPrice entity={entity} />
      <a
        href={entity.poe2db_url}
        target="_blank"
        rel="noreferrer"
        className="mt-2 inline-flex items-center gap-1 text-xs text-neutral-400 hover:text-amber-200"
      >
        poe2db <ExternalLink className="h-3 w-3" aria-hidden />
      </a>
    </div>
  );
}

/** An item name inside a Coach answer: small art + the exact answer text, with its card on hover/tap. */
export function EntityChip({ entity, text }: { entity: CoachEntity; text: string }) {
  return (
    <HoverCard
      label={`${entity.name} details`}
      triggerClassName={CHIP_CLASS}
      trigger={
        <>
          <span className="self-center">
            <ItemArt src={entity.icon_url} size={4} />
          </span>
          <span>{text}</span>
        </>
      }
    >
      <EntityCard entity={entity} />
    </HoverCard>
  );
}
