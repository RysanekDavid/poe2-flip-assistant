"use client";

import type { ReactNode } from "react";
import type { PoolHeader } from "../../../core/tools/regex/pools/headers";
import { RARITIES, rarityHeaderId, type Rarity } from "../../../core/tools/regex/pools/headers";
import { REGEX_MAX_CHARS_DEFAULT, REGEX_MAX_CHARS_MAX, REGEX_MAX_CHARS_MIN } from "../../../lib/tools/regexContract";
import { Tooltip } from "../../ui/Tooltip";
import { parseMin } from "./selectionOps";

/** Pressed/unpressed chip for multi-select filters (tablet types, rarity, item classes). */
export function ChipToggle({ on, onClick, children, title }: { on: boolean; onClick: () => void; children: ReactNode; title?: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      title={title}
      className={`h-7 rounded-md border px-2.5 text-xs font-medium transition-colors ${
        on ? "border-amber-400/60 bg-amber-400/15 text-amber-100" : "border-neutral-700 bg-neutral-900/60 text-neutral-400 hover:text-neutral-100"
      }`}
    >
      {children}
    </button>
  );
}

/** Marks a header line whose spelling is not proven by a clipboard sample (headers.ts `verified`). */
export function VerifyMarker({ header }: { header: PoolHeader | undefined }) {
  if (!header || header.verified === "corpus") return null;
  const source = header.verified === "poe2.re" ? "Spelling taken from poe2.re's working strings, not our own paste." : "Spelling not yet seen in a clipboard paste.";
  return (
    <Tooltip tip={`"${header.template}" — ${source}${header.note ? ` ${header.note}.` : ""} Check the string lights the right items in-game.`}>
      <span className="rounded bg-warn/15 px-1.5 text-xs font-semibold text-warn">verify in-game</span>
    </Tooltip>
  );
}

/** Labelled block in the controls column. */
export function Field({ label, children, extra }: { label: string; children: ReactNode; extra?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-neutral-400">
        {label}
        {extra}
      </span>
      {children}
    </div>
  );
}

export function NumberField({ label, value, onChange, min = 0, max, placeholder = "any" }: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  min?: number;
  max?: number;
  placeholder?: string;
}) {
  return (
    <input
      type="number"
      inputMode="numeric"
      aria-label={label}
      min={min}
      max={max}
      placeholder={placeholder}
      value={value ?? ""}
      onChange={(e) => onChange(parseMin(e.target.value))}
      className="h-8 w-20 rounded-md border border-neutral-700 bg-neutral-950 px-2 text-right text-sm tabular-nums text-neutral-100 placeholder:text-neutral-500"
    />
  );
}

const RARITY_LABEL: Record<Rarity, string> = { normal: "Normal", magic: "Magic", rare: "Rare", unique: "Unique" };

/** Empty = any rarity; the headers tell which rarity lines still need an in-game check. */
export function RarityChips({ value, onChange, headers }: { value: readonly Rarity[]; onChange: (r: Rarity[]) => void; headers: readonly PoolHeader[] }) {
  const flagged = headers.find((h) => h.kind === "rarity" && h.verified !== "corpus" && value.some((r) => h.id === rarityHeaderId(r)));
  const toggle = (r: Rarity) => onChange(value.includes(r) ? value.filter((x) => x !== r) : RARITIES.filter((x) => x === r || value.includes(x)));
  return (
    <Field label="Rarity" extra={<VerifyMarker header={flagged} />}>
      <div className="flex flex-wrap gap-1.5">
        {RARITIES.map((r) => (
          <ChipToggle key={r} on={value.includes(r)} onClick={() => toggle(r)}>
            {RARITY_LABEL[r]}
          </ChipToggle>
        ))}
      </div>
    </Field>
  );
}

/** Stash-search character limit (per browser); lower it if the game cuts strings short. */
export function MaxCharsInput({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const valid = validMaxChars(value) !== null;
  return (
    <Field label="Max chars">
      <span className="flex items-center gap-2">
        <input
          type="number"
          aria-label="stash search character limit"
          min={REGEX_MAX_CHARS_MIN}
          max={REGEX_MAX_CHARS_MAX}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className={`h-8 w-20 rounded-md border bg-neutral-950 px-2 text-right text-sm tabular-nums text-neutral-100 ${valid ? "border-neutral-700" : "border-bad"}`}
        />
        {value !== REGEX_MAX_CHARS_DEFAULT && (
          <button type="button" onClick={() => onChange(REGEX_MAX_CHARS_DEFAULT)} className="text-xs text-neutral-400 hover:text-neutral-100">
            reset to {REGEX_MAX_CHARS_DEFAULT}
          </button>
        )}
      </span>
      {!valid && <span className="text-xs text-bad">between {REGEX_MAX_CHARS_MIN} and {REGEX_MAX_CHARS_MAX}</span>}
    </Field>
  );
}

/** A usable limit or null while the field holds an out-of-range value. */
export const validMaxChars = (n: number): number | null =>
  Number.isInteger(n) && n >= REGEX_MAX_CHARS_MIN && n <= REGEX_MAX_CHARS_MAX ? n : null;
