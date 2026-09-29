"use client";

import { memo } from "react";
import type { PoolMod } from "../../../core/tools/regex/pools/schema";
import { thresholdKey, type ModState, type ValueRange } from "../../../lib/tools/regexPoolContract";
import { Tooltip } from "../../ui/Tooltip";
import { modLabel, rollSummary, type ModTokenInfo } from "./modView";
import { Segmented, type SegmentOption } from "./Segmented";
import { parseMin, type ModChoice } from "./selectionOps";

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

function RangeInput({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number | null) => void }) {
  return (
    <input
      type="number"
      min={0}
      inputMode="numeric"
      aria-label={label}
      placeholder={label.endsWith("max") ? "max" : "min"}
      value={value ?? ""}
      onChange={(e) => onChange(parseMin(e.target.value))}
      className="h-7 w-16 rounded border border-neutral-700 bg-neutral-950 px-1.5 text-right text-xs tabular-nums text-neutral-100 placeholder:text-neutral-500"
    />
  );
}

/** Min/max per rolled number of a wanted mod (integer lines only — a digit range cannot do decimals). */
function Thresholds({ mod, thresholds, onThreshold }: Pick<ModRowProps, "mod" | "thresholds" | "onThreshold">) {
  const slots = mod.lines.flatMap((line, i) =>
    line.numeric.decimals > 0 ? [] : Array.from({ length: line.numeric.count }, (_, slot) => ({ line: i, slot, template: line.template })),
  );
  if (slots.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pl-2">
      <span className="text-xs text-neutral-400">roll at least</span>
      {slots.map(({ line, slot, template }) => {
        const key = thresholdKey(mod.id, line, slot);
        const range = thresholds[key] ?? null;
        const set = (min: number | null, max: number | null) =>
          onThreshold(key, min === null && max === null ? null : { min: min ?? 0, max: max !== null && max < (min ?? 0) ? min : max });
        const name = slots.length > 1 ? `#${slot + 1} of "${template}"` : `"${template}"`;
        return (
          <span key={key} className="inline-flex items-center gap-1 text-xs text-neutral-400">
            {slots.length > 1 && <span>#{slot + 1}</span>}
            <RangeInput label={`${name} min`} value={range?.min ?? null} onChange={(v) => set(v, range?.max ?? null)} />
            –
            <RangeInput label={`${name} max`} value={range?.max ?? null} onChange={(v) => set(range?.min ?? null, v)} />
          </span>
        );
      })}
    </div>
  );
}

function ModFlags({ mod, info, masked, uncovered }: Pick<ModRowProps, "mod" | "info" | "masked" | "uncovered">) {
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
    </span>
  );
}

/** One mod: 3-state control, its text, roll range, the token that stands for it, and thresholds when wanted. */
export const ModRow = memo(function ModRow(props: ModRowProps) {
  const { mod, state, onState } = props;
  const label = modLabel(mod);
  return (
    <li className="flex flex-col gap-1 border-b border-line/60 py-2 last:border-b-0">
      <div className="flex items-start gap-3">
        <Segmented options={CHOICES} value={state ?? "ignore"} onChange={(c) => onState(mod.id, c)} label={label} compact />
        <div className="min-w-0 flex-1">
          <p className={`text-sm ${state === "want" ? "text-green-100" : state === "avoid" ? "text-red-100" : "text-neutral-200"}`}>{label}</p>
          <ModFlags mod={mod} info={props.info} masked={props.masked} uncovered={props.uncovered} />
        </div>
      </div>
      {state === "want" && <Thresholds mod={mod} thresholds={props.thresholds} onThreshold={props.onThreshold} />}
    </li>
  );
});
