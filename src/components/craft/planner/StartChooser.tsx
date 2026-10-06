"use client";

import { useEffect, useState } from "react";
import type { PlannerPool } from "../../../lib/tools/craftPlannerContract";
import { Toggle } from "../../ui/Toggle";
import { InfoTip } from "../../ui/Tooltip";
import { findFamily, genericText, tierOf, type CarriedPick, type PlannerInput, type SlotPick, type StartInput, type StartMode } from "./plannerModel";
import { poolReady } from "./plannerModel";
import { carriedLabel } from "./plannerStartModel";

/**
 * "Start from": let the planner compare a clean base with a bought one (the default), only a clean
 * base, or a base the player buys carrying chosen wanted mods (fractured or not). The planner never
 * assumes a purchase on its own; the base's price is the player's to enter.
 */

const MODES: ReadonlyArray<{ mode: StartMode; label: string; tip: string }> = [
  { mode: "compare", label: "let the planner compare", tip: "Two plans side by side: from a clean base, and from a base you buy with one wanted mod already fractured (the planner picks which)." },
  { mode: "clean", label: "a clean base", tip: "Only plans that start from a plain base you craft everything on." },
  { mode: "bought", label: "a base I buy with…", tip: "You buy a base that already has the mods you pick below; the plan crafts the rest." },
];

const FIELD = "h-8 w-20 rounded-md border border-neutral-700 bg-neutral-900 px-2 text-sm tabular-nums text-neutral-100 focus:border-amber-400 focus:outline-none";

/** A price in Divine (decimals allowed); empty = not entered. */
export function AskField({ value, onChange, label }: { value: number | null; onChange: (v: number | null) => void; label: string }) {
  const [draft, setDraft] = useState(value == null ? "" : String(value));
  useEffect(() => setDraft(value == null ? "" : String(value)), [value]);
  const n = Number(draft);
  const valid = draft.trim() === "" || (Number.isFinite(n) && n > 0 && n <= 100_000);
  return (
    <label className="inline-flex items-center gap-1 text-sm text-neutral-300">
      <input
        type="number"
        inputMode="decimal"
        min={0}
        step="any"
        value={draft}
        aria-label={label}
        aria-invalid={!valid}
        placeholder="price"
        onChange={(e) => {
          setDraft(e.target.value);
          const next = Number(e.target.value);
          if (e.target.value.trim() === "") onChange(null);
          else if (Number.isFinite(next) && next > 0 && next <= 100_000) onChange(next);
        }}
        className={`${FIELD} ${valid ? "" : "border-red-500/70"}`}
      />
      div
    </label>
  );
}

interface Props {
  input: PlannerInput;
  pool: PlannerPool | null;
  onChange: (patch: Partial<StartInput>) => void;
}

const sameCarried = (a: CarriedPick, b: CarriedPick): boolean => a.kind === b.kind && a.side === b.side && (a.kind === "pool" || (b.kind === "slot" && a.slot === b.slot));

/** The chips a bought base can carry: every ordinary single pick and every pool. */
function choices(input: PlannerInput): CarriedPick[] {
  const out: CarriedPick[] = [];
  for (const side of ["prefix", "suffix"] as const) {
    input.slots[side].forEach((p, slot) => {
      if (p && p.source === "natural") out.push({ kind: "slot", side, slot });
    });
    if (poolReady(input.pools[side])) out.push({ kind: "pool", side });
  }
  return out;
}

/** Toggle a chip: a fractured base carries one mod; a magic one at most one per side. */
function toggled(s: StartInput, c: CarriedPick): CarriedPick[] {
  if (s.carried.some((x) => sameCarried(x, c))) return s.carried.filter((x) => !sameCarried(x, c));
  if (s.fractured) return [c];
  return [...s.carried.filter((x) => x.side !== c.side), c];
}

function CarriedChips({ input, pool, onChange }: Props) {
  const s = input.start;
  const text = (p: SlotPick) => {
    const fam = pool ? findFamily(pool, p) : null;
    const t = fam ? tierOf(fam, p.minModId) : null;
    return `${genericText((t?.tier.text ?? p.minModId).split("\n")[0] ?? p.minModId)}${t ? ` ${t.k}+` : ""}`;
  };
  const list = choices(input);
  if (list.length === 0) return <p className="text-xs text-neutral-400">Add an ordinary mod or a pool to the item first.</p>;
  return (
    <ul aria-label="mods the bought base carries" className="flex flex-wrap gap-1">
      {list.map((c) => {
        const on = s.carried.some((x) => sameCarried(x, c));
        return (
          <li key={`${c.kind}-${c.side}-${c.kind === "slot" ? c.slot : "pool"}`}>
            <button type="button" aria-pressed={on} onClick={() => onChange({ carried: toggled(s, c) })} className={`rounded border px-1.5 py-0.5 text-xs ${on ? "border-amber-400/70 bg-amber-950/40 text-amber-200" : "border-neutral-700 text-neutral-300 hover:border-amber-500/60"}`}>
              {carriedLabel(input.slots, input.pools, c, text)}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function BoughtFields(props: Props) {
  const s = props.input.start;
  return (
    <div className="space-y-2 rounded-md border border-neutral-800 bg-neutral-950/40 p-2">
      <CarriedChips {...props} />
      {s.note && (
        <p role="status" className="text-xs text-amber-200">
          {s.note}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Toggle checked={s.fractured} onChange={(v) => props.onChange({ fractured: v, carried: v ? s.carried.slice(0, 1) : s.carried })} label="fractured" />
        <span className="inline-flex items-center gap-1.5 text-sm text-neutral-300">
          base price <AskField value={s.askDiv} onChange={(v) => props.onChange({ askDiv: v })} label="your price for the bought base" />
        </span>
      </div>
      <p className="text-xs text-neutral-400">{s.carried.length === 0 ? "No mod picked: the planner chooses which wanted mod the base carries fractured." : s.fractured ? "A rare base with this mod fractured." : "A magic base with just these mods (one prefix, one suffix)."}</p>
    </div>
  );
}

export function StartChooser(props: Props) {
  const s = props.input.start;
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1 text-sm text-neutral-300">Start from</legend>
      <div role="radiogroup" aria-label="start from" className="flex flex-wrap gap-1.5">
        {MODES.map((m) => (
          <span key={m.mode} className="inline-flex items-center gap-1">
            <button type="button" role="radio" aria-checked={s.mode === m.mode} onClick={() => props.onChange({ mode: m.mode })} className={`rounded-md border px-2 py-1 text-sm ${s.mode === m.mode ? "border-amber-400/70 bg-amber-950/40 text-amber-200" : "border-neutral-700 text-neutral-300 hover:border-amber-500/60"}`}>
              {m.label}
            </button>
            <InfoTip tip={m.tip} label={`about: ${m.label}`} />
          </span>
        ))}
      </div>
      {s.mode === "bought" && <BoughtFields {...props} />}
      {s.mode === "compare" && (
        <span className="inline-flex items-center gap-1.5 text-sm text-neutral-300">
          bought base price <AskField value={s.askDiv} onChange={(v) => props.onChange({ askDiv: v })} label="your price for the bought base" />
          <InfoTip tip="The price of a base with the planner's pick already fractured — check the trade link on the bought plan. Without it, the bought plan's total waits for the price." />
        </span>
      )}
    </fieldset>
  );
}

