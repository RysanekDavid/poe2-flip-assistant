"use client";

import { memo } from "react";
import { CircleAlert, TriangleAlert } from "lucide-react";
import type { PoolMod } from "../../../core/tools/regex/pools/schema";
import { thresholdKey, type ModState, type ValueRange } from "../../../lib/tools/regexPoolContract";
import { Tooltip } from "../../ui/Tooltip";
import type { ModTokenInfo } from "./modView";
import { RangeFields } from "./numberFields";
import { rangeOf } from "./selectionOps";

export interface ModCardProps {
  mod: PoolMod;
  /** Mod text with roll ranges inlined (inlineRollText). */
  text: string;
  /** "Destructive · prefix · T11–15, T16" (modMeta). */
  meta: string;
  state: ModState | undefined;
  thresholds: Readonly<Record<string, ValueRange>>;
  info: ModTokenInfo | undefined;
  masked: boolean;
  uncovered: boolean;
  /** Applies the current brush to this mod (add / remove / move). */
  onToggle: (modId: string) => void;
  onThreshold: (key: string, range: ValueRange | null) => void;
}

// Avoid = red, Want = green; the badge text carries the meaning for colour-blind players.
const TONE: Record<ModState | "none", string> = {
  none: "border-line bg-neutral-900/60 hover:border-neutral-600",
  avoid: "border-bad/50 bg-bad/10",
  want: "border-good/50 bg-good/10",
};
const BADGE: Record<ModState, string> = { avoid: "bg-bad/20 text-red-200", want: "bg-good/20 text-green-200" };

/** Min/max per rolled number of a wanted mod (integer lines only — a digit range cannot do decimals). */
function Thresholds({ mod, thresholds, onThreshold }: Pick<ModCardProps, "mod" | "thresholds" | "onThreshold">) {
  const slots = mod.lines.flatMap((line, i) =>
    line.numeric.decimals > 0 ? [] : Array.from({ length: line.numeric.count }, (_, slot) => ({ line: i, slot, template: line.template })),
  );
  if (slots.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 pb-2 text-xs text-neutral-400">
      roll
      {slots.map(({ line, slot, template }) => {
        const key = thresholdKey(mod.id, line, slot);
        const range = thresholds[key] ?? null;
        const name = slots.length > 1 ? `#${slot + 1} of "${template}"` : `"${template}"`;
        return (
          <span key={key} className="inline-flex items-center gap-1">
            {slots.length > 1 && <span>#{slot + 1}</span>}
            <RangeFields compact label={name} min={range?.min ?? null} max={range?.max ?? null} onCommit={(min, max) => onThreshold(key, rangeOf(min, max))} />
          </span>
        );
      })}
    </div>
  );
}

/** Masked / not in any string / also-matches: one icon, the reasons in its tooltip. */
function ProblemFlag({ info, masked, uncovered }: Pick<ModCardProps, "info" | "masked" | "uncovered">) {
  const also = info?.alsoMatches ?? [];
  const reasons = [
    masked && "An Avoid mark also matches this mod, so it can never light up.",
    uncovered && "Too long to fit next to the filters — raise max characters (gear icon).",
    also.length > 0 && `Its search text also lights: ${also.join(" · ")}.`,
    ...(also.length > 0 ? (info?.notes ?? []) : []),
  ].filter((r): r is string => typeof r === "string" && r.length > 0);
  if (reasons.length === 0) return null;
  const severe = masked || uncovered;
  const Icon = severe ? CircleAlert : TriangleAlert;
  return (
    <span className="shrink-0 pr-2 pt-2">
      <Tooltip tip={reasons.join(" ")} align="end">
        <button type="button" aria-label={severe ? "problem with this mod" : "this mod's search text also matches other mods"} className={`inline-flex rounded ${severe ? "text-bad" : "text-warn"}`}>
          <Icon aria-hidden className="h-4 w-4" />
        </button>
      </Tooltip>
    </span>
  );
}

/**
 * One mod as a clickable card: the whole text is the button (the brush decides Avoid or Want). A
 * wanted mod shows its roll limits under the button, so typing in them never toggles the card.
 */
export const ModCard = memo(function ModCard(props: ModCardProps) {
  const { mod, text, meta, state, info, onToggle } = props;
  const search = info?.tokens.map((t) => t.text).join(" · ");
  const notes = info && info.alsoMatches.length === 0 ? info.notes : [];
  const title = [search && `search text: ${search}`, ...notes].filter(Boolean).join(" · ") || undefined;
  return (
    <li className={`flex min-w-0 rounded-md border transition-colors ${TONE[state ?? "none"]}`}>
      <div className="min-w-0 flex-1">
        <button
          type="button"
          aria-pressed={state !== undefined}
          onClick={() => onToggle(mod.id)}
          title={title}
          className="flex w-full items-start gap-2 rounded-md px-3 py-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-amber-300"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-sm text-neutral-100">{text}</span>
            {meta && <span className="block text-xs text-neutral-500">{meta}</span>}
          </span>
          {state && <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold ${BADGE[state]}`}>{state === "want" ? "Want" : "Avoid"}</span>}
        </button>
        {state === "want" && <Thresholds mod={mod} thresholds={props.thresholds} onThreshold={props.onThreshold} />}
      </div>
      <ProblemFlag info={info} masked={props.masked} uncovered={props.uncovered} />
    </li>
  );
});
