"use client";

import { memo, type ReactNode } from "react";
import type { PoolMod } from "../../../core/tools/regex/pools/schema";
import { thresholdKey, type ModState, type ValueRange } from "../../../lib/tools/regexPoolContract";
import { Tooltip } from "../../ui/Tooltip";
import { modLabel, rollSummary, type ModTokenInfo } from "./modView";
import { Segmented, type SegmentOption } from "./Segmented";
import { RangeFields } from "./numberFields";
import { rangeOf, type ModChoice } from "./selectionOps";

// Want = green, Avoid = red, Ignore = neutral; the text label carries the meaning for colour-blind players.
const CHOICES: readonly SegmentOption<ModChoice>[] = [
  { value: "want", label: "Want", activeClass: "bg-good/25 text-green-100", title: "highlight items with this mod" },
  { value: "avoid", label: "Avoid", activeClass: "bg-bad/25 text-red-100", title: "hide items with this mod" },
  { value: "ignore", label: "Ignore", activeClass: "bg-neutral-700 text-neutral-100", title: "this mod does not matter" },
];

export interface ModRowProps {
  mod: PoolMod;
  state: ModState | undefined;
  thresholds: Readonly<Record<string, ValueRange>>;
  info: ModTokenInfo | undefined;
  masked: boolean;
  uncovered: boolean;
  onState: (modId: string, choice: ModChoice) => void;
  onThreshold: (key: string, range: ValueRange | null) => void;
}

/** Min/max per rolled number of a wanted mod (integer lines only — a digit range cannot do decimals). */
function Thresholds({ mod, thresholds, onThreshold }: Pick<ModRowProps, "mod" | "thresholds" | "onThreshold">) {
  const slots = mod.lines.flatMap((line, i) =>
    line.numeric.decimals > 0 ? [] : Array.from({ length: line.numeric.count }, (_, slot) => ({ line: i, slot, template: line.template })),
  );
  if (slots.length === 0) return null;
  return (
    <span className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-400">
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
    </span>
  );
}

function ModFlags({ mod, info, masked, uncovered, children }: Pick<ModRowProps, "mod" | "info" | "masked" | "uncovered"> & { children?: ReactNode }) {
  const also = info?.alsoMatches ?? [];
  const tokenText = info?.tokens.map((t) => t.text).join(" · ");
  return (
    <span className="flex flex-wrap items-center gap-1.5 text-xs text-neutral-400">
      {rollSummary(mod) && <span className="tabular-nums">{rollSummary(mod)}</span>}
      <span>{mod.side}{mod.name ? ` · ${mod.name}` : ""}</span>
      {mod.desecrated && <span className="rounded bg-purple-500/15 px-1.5 text-purple-200">desecrated</span>}
      {tokenText && <code className="rounded bg-neutral-900 px-1.5 font-mono text-amber-200" title="the search text used for this mod">{tokenText}</code>}
      {also.length > 0 && (
        <Tooltip tip={<>Also lights: {also.join(" · ")}{info?.notes.length ? <><br />{info.notes.join("; ")}</> : null}</>}>
          <span className="rounded bg-warn/15 px-1.5 font-semibold text-warn">also matches {also.length}</span>
        </Tooltip>
      )}
      {also.length === 0 && info && info.notes.length > 0 && (
        <Tooltip tip={info.notes.join("; ")}>
          <span className="rounded bg-neutral-800 px-1.5 text-neutral-300">note</span>
        </Tooltip>
      )}
      {masked && <span className="rounded bg-bad/15 px-1.5 font-semibold text-bad" title="an Avoid mark also matches this mod, so it can never light up">masked by Avoid</span>}
      {uncovered && <span className="rounded bg-bad/15 px-1.5 font-semibold text-bad" title="too long to fit next to the filters — raise max chars">not in any string</span>}
      {children}
    </span>
  );
}

/** One mod: 3-state control, its text, roll range, the token that stands for it, and thresholds when wanted. */
export const ModRow = memo(function ModRow(props: ModRowProps) {
  const { mod, state, onState } = props;
  const label = modLabel(mod);
  return (
    <li className="flex items-start gap-3 border-b border-line/60 py-2 last:border-b-0">
      <Segmented options={CHOICES} value={state ?? "ignore"} onChange={(c) => onState(mod.id, c)} label={label} compact />
      <div className="min-w-0 flex-1">
        <p className={`text-sm ${state === "want" ? "text-green-100" : state === "avoid" ? "text-red-100" : "text-neutral-200"}`}>{label}</p>
        <ModFlags mod={mod} info={props.info} masked={props.masked} uncovered={props.uncovered}>
          {state === "want" && <Thresholds mod={mod} thresholds={props.thresholds} onThreshold={props.onThreshold} />}
        </ModFlags>
      </div>
    </li>
  );
});
