"use client";

import type { Confidence } from "../../core/tools/bossEv/schema";
import type { Tone } from "../../core/tools/bossEv/headline";

/** Headline colours. Amber is the ceiling for anything resting on an unconfirmed rate (headline.ts). */
export const TONE_CLASS: Record<Tone, string> = {
  good: "text-good",
  warn: "text-amber-300",
  bad: "text-bad",
  neutral: "text-neutral-200",
  muted: "text-neutral-400",
};

/** "84%", "<1%", "0%" — a probability as a player reads it. */
export function fmtPct(p: number): string {
  if (p <= 0) return "0%";
  if (p < 0.01) return "<1%";
  return `${Math.round(p * 100)}%`;
}

/** "1 in 23" for a kills-per-drop count. */
export function fmtOneIn(n: number): string {
  return `1 in ${n >= 10 ? Math.round(n).toLocaleString("en-US") : n.toFixed(1)}`;
}

// A label is the weaker of "does the boss drop it" and, when a rate is given, "how is that rate
// sourced". With the rate unknown it vouches only for the drop's presence, never for how often.
export const CONFIDENCE_HINT: Record<Confidence, string> = {
  confirmed: "confirmed — official patch notes, or two or more independent sources agree (on the rate too, when one is shown)",
  "single-source": "single source — one guide or one community sample backs the drop or its rate",
  conflicting: "conflicting — two sources give different rates for this drop; the shown one is the sampled figure",
  unverified: "unverified — a guess, or no sourced rate at all",
};

/** A lineage support gem. Native title, not a Tooltip: a loot table must not gain a tab stop per row. */
export function LineageBadge() {
  return (
    <span className="rounded border border-amber-400/40 px-1.5 text-xs text-amber-200" title="Lineage support gem — priced from poe2scout's lineage-gem list">
      lineage
    </span>
  );
}
