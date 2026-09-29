"use client";

import type { Confidence } from "../../core/tools/bossEv/schema";
import type { Tone } from "../../core/tools/bossEv/headline";
import { Tooltip } from "../ui/Tooltip";

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
const CONFIDENCE_HINT: Record<Confidence, string> = {
  confirmed: "confirmed — official patch notes, or two or more independent sources agree (on the rate too, when one is shown)",
  "single-source": "single source — one guide or one community sample backs the drop or its rate",
  unverified: "unverified — contradicted between sources, a guess, or no sourced rate at all",
};

const CONFIDENCE_LABEL: Record<Confidence, string> = {
  confirmed: "confirmed",
  "single-source": "1 source",
  unverified: "unverified",
};

/** One neutral chip: the confidence is a caveat to weigh, never a colour-coded verdict. */
export function ConfidenceChip({ confidence }: { confidence: Confidence }) {
  return (
    <Tooltip tip={CONFIDENCE_HINT[confidence]}>
      <span className="rounded border border-line px-1.5 text-xs text-neutral-400">{CONFIDENCE_LABEL[confidence]}</span>
    </Tooltip>
  );
}

/** "3 unpriced (2 lineage gems)": lines no market prices, so EV leaves them out — never counted as 0. */
export function UnpricedChip({ names, lineage }: { names: readonly string[]; lineage: number }) {
  if (names.length === 0) return null;
  const label = lineage > 0 ? `${names.length} unpriced (${lineage === names.length ? "lineage gems" : `${lineage} lineage`})` : `${names.length} unpriced`;
  return (
    <Tooltip tip={`no market price — left out of EV, not counted as 0: ${names.join(", ")}`}>
      <span className="rounded border border-line px-1.5 text-xs text-neutral-400">{label}</span>
    </Tooltip>
  );
}
