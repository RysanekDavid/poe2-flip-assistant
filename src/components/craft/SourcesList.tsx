"use client";

import { ExternalLink } from "lucide-react";
import type { ProvenanceView, RecipeSource, SourceTier } from "../../core/craftProvenance/schema";
import { Tooltip } from "../ui/Tooltip";
import { StatusChip, staleText } from "./ProvenanceChips";

const TIER_TIP: Record<SourceTier, string> = {
  primary: "The creator's own demonstration or our in-game test.",
  secondary: "A write-up or database page summarising the mechanic.",
  anecdote: "Unlocated: named in chat or notes, no link to check.",
};

const KB_PATH = "docs/research/poe2-crafting-knowledge.md";

function SourceRow({ s }: { s: RecipeSource }) {
  const who = s.creator ?? (s.kind === "in_game" ? "own test" : "unknown creator");
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <Tooltip tip={TIER_TIP[s.tier]}>
        <span className={`cursor-help rounded border px-1 text-xs ${s.tier === "anecdote" ? "border-amber-400/40 text-amber-300" : "border-line text-neutral-400"}`}>{s.tier}</span>
      </Tooltip>
      <span className="text-neutral-200">{who}</span>
      {s.url ? (
        <a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-neutral-300 hover:text-amber-200">
          {s.title} <ExternalLink aria-hidden className="h-3 w-3 shrink-0" />
        </a>
      ) : (
        <span className="text-neutral-400">{s.title}</span>
      )}
      <span className="text-neutral-500">{s.date ?? "date unknown"}</span>
    </li>
  );
}

/** Where the recipe came from, the KB sections it leans on, and why it may be stale. */
export function SourcesList({ p }: { p: ProvenanceView }) {
  return (
    <div className="space-y-1.5 rounded-md border border-neutral-800 bg-neutral-950/40 px-3 py-2 text-xs">
      <div className="flex flex-wrap items-center gap-2 text-neutral-400">
        <span className="uppercase tracking-wide text-neutral-500">Sources</span>
        <StatusChip p={p} />
        <Tooltip tip={`Sections of ${KB_PATH} this recipe relies on.`}>
          <span className="cursor-help">KB {p.kbRuleRefs.join(" ")}</span>
        </Tooltip>
      </div>
      <ul className="space-y-1">
        {p.sources.map((s) => (
          <SourceRow key={`${s.title}-${s.url ?? s.ref ?? ""}`} s={s} />
        ))}
      </ul>
      {p.stale.length > 0 && (
        <ul className="space-y-0.5 text-amber-300">
          {p.stale.map((r) => (
            <li key={staleText(r)}>{staleText(r)}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
