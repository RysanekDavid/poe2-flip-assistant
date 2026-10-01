"use client";

import type { RecipeDurability } from "../../core/craftProvenance/schema";
import { DurabilityNote as StrategyDurabilityNote } from "../farm/strategies/Durability";

/** The strategies' durability section in a craft-card frame: why the recipe works and what ends it. */
export function RecipeDurabilityNote({ d }: { d: RecipeDurability }) {
  return (
    <div className="space-y-1.5 rounded-md border border-neutral-800 bg-neutral-950/40 px-3 py-2">
      <div className="text-xs uppercase tracking-wide text-neutral-500">Why it works</div>
      <StrategyDurabilityNote durability={d} />
    </div>
  );
}
