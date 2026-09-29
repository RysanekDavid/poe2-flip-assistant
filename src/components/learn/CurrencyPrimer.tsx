"use client";

import { useState } from "react";
import { Coins, ExternalLink, Loader2 } from "lucide-react";
import { ENTITY_KIND_LABEL } from "../../core/entities/schema";
import type { PickupAdvice } from "../../core/learn/schema";
import { PICKUP_RULE_TEXT, primerResponseSchema, type PrimerCard } from "../../lib/learnContract";
import { ClaimBadge } from "../ui/ClaimBadge";
import { EmptyState } from "../ui/EmptyState";
import { ItemArt } from "../ui/ItemArt";
import { PriceChip } from "../ui/PriceChip";
import { Tooltip } from "../ui/Tooltip";
import { useLearnGet } from "./useLearnApi";

// "always" is exactly the lookup's pickup rule (testLearn checks every entry), so it quotes that text.
const PICKUP: Record<PickupAdvice, { label: string; tip: string; tone: string }> = {
  always: { label: "Always pick up", tip: PICKUP_RULE_TEXT, tone: "border-good/40 text-good" },
  stack: { label: "Pick up & stack", tip: "Under the line one at a time, but it adds up: keep a stack to use or sell in bulk.", tone: "border-line text-neutral-200" },
  skip_low: { label: "Skip early", tip: "Under the line and rarely worth a slot — leave it (or let your loot filter hide it) until you need it.", tone: "border-line text-neutral-400" },
};

type Filter = PickupAdvice | "all";
const FILTERS: ReadonlyArray<{ id: Filter; label: string }> = [
  { id: "all", label: "All" },
  { id: "always", label: PICKUP.always.label },
  { id: "stack", label: PICKUP.stack.label },
  { id: "skip_low", label: PICKUP.skip_low.label },
];

function ageMinutes(iso: string): number {
  return (Date.now() - Date.parse(iso)) / 60_000;
}

function PrimerTile({ card, exPerDiv }: { card: PrimerCard; exPerDiv: number | null }) {
  const { entity } = card;
  const pickup = PICKUP[card.pickup];
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-line bg-surface/60 p-3">
      <div className="flex items-start gap-3">
        <ItemArt src={entity.icon_url} size={12} alt={entity.name} />
        <div className="min-w-0 flex-1">
          <a href={entity.poe2db_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-neutral-50 hover:text-amber-200">
            {entity.name} <ExternalLink aria-hidden className="h-3 w-3 text-neutral-500" />
          </a>
          <div className="text-xs uppercase tracking-wider text-neutral-400">{ENTITY_KIND_LABEL[entity.kind]}</div>
        </div>
        <PriceChip div={entity.price?.div ?? null} exPerDiv={exPerDiv} source={entity.price?.source} ageMin={entity.price ? ageMinutes(entity.price.at) : undefined} />
      </div>
      {entity.summary && <p className="text-sm leading-5 text-neutral-300">{entity.summary}</p>}
      <p className="text-sm leading-5 text-neutral-400">{card.who_uses}</p>
      <div className="mt-auto flex flex-wrap items-center gap-2">
        <Tooltip tip={pickup.tip} side="top" align="start">
          <span tabIndex={0} className={`rounded border px-1.5 text-xs ${pickup.tone}`}>{pickup.label}</span>
        </Tooltip>
        <ClaimBadge claim={card.claim} />
      </div>
    </li>
  );
}

function FilterChips({ value, onChange, counts }: { value: Filter; onChange: (f: Filter) => void; counts: Record<Filter, number> }) {
  return (
    <div role="group" aria-label="Filter by pickup advice" className="flex flex-wrap gap-1.5">
      {FILTERS.map((f) => (
        <button
          key={f.id}
          type="button"
          aria-pressed={value === f.id}
          onClick={() => onChange(f.id)}
          className={`h-7 rounded-md border px-2.5 text-xs font-medium ${
            value === f.id ? "border-amber-400/50 bg-amber-400/10 text-amber-100" : "border-neutral-800 text-neutral-400 hover:text-neutral-200"
          }`}
        >
          {f.label} <span className="tabular-nums text-neutral-500">{counts[f.id]}</span>
        </button>
      ))}
    </div>
  );
}

/** Learn › Currency primer: the core currencies a new player meets, what they do, and whether to pick them up. */
export function CurrencyPrimer() {
  const primer = useLearnGet("/api/learn/primer", primerResponseSchema);
  const [filter, setFilter] = useState<Filter>("all");
  if (primer.kind === "error") return <EmptyState icon={<Coins className="h-5 w-5" />} title="Primer unavailable" sentence={primer.message} />;
  if (primer.kind !== "ok") return <EmptyState icon={<Loader2 className="h-5 w-5 animate-spin" />} sentence="Loading the currency primer…" />;
  const { cards, ex_per_div: exPerDiv, verified_against: patch } = primer.data;
  const counts: Record<Filter, number> = { all: cards.length, always: 0, stack: 0, skip_low: 0 };
  for (const card of cards) counts[card.pickup] += 1;
  const shown = filter === "all" ? cards : cards.filter((c) => c.pickup === filter);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <FilterChips value={filter} onChange={setFilter} counts={counts} />
        <span className="text-xs text-neutral-400">Checked against patch {patch} · live prices from your league</span>
      </div>
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {shown.map((card) => (
          <PrimerTile key={card.entity.id} card={card} exPerDiv={exPerDiv} />
        ))}
      </ul>
    </div>
  );
}
