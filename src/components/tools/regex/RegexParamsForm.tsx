"use client";

import type { ReactNode } from "react";
import { CATEGORIES } from "../../../api/types";
import { categoryColor } from "../../../lib/tableStyle";
import type { PricePresetParams } from "../../../lib/tools/regexContract";

const CATEGORY_IDS = CATEGORIES.map((c) => c.type);

// The slider is logarithmic: 0.01 → 100 Div spans the whole useful range in one drag.
const SLIDER_MIN_LOG = -2;
const SLIDER_STEPS_PER_DECADE = 25;
const toSlider = (div: number): number =>
  Math.min(100, Math.max(0, (Math.log10(Math.max(div, 0.01)) - SLIDER_MIN_LOG) * SLIDER_STEPS_PER_DECADE));
const fromSlider = (pos: number): number => Number((10 ** (pos / SLIDER_STEPS_PER_DECADE + SLIDER_MIN_LOG)).toPrecision(2));

function Chip({ on, onClick, tone, title, children }: {
  on: boolean;
  onClick: () => void;
  tone: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={on}
      className={`rounded px-2 py-1 text-xs font-medium transition-opacity ${tone} ${on ? "opacity-100 ring-1 ring-current" : "opacity-40 hover:opacity-70"}`}
    >
      {children}
    </button>
  );
}

function CategoryChips({ params, onChange }: { params: PricePresetParams; onChange: (p: PricePresetParams) => void }) {
  const selected = new Set(params.categories);
  const toggle = (c: string) =>
    onChange({ ...params, categories: selected.has(c) ? params.categories.filter((x) => x !== c) : [...params.categories, c] });
  const allOn = CATEGORY_IDS.every((c) => selected.has(c));
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {CATEGORY_IDS.map((c) => (
        <Chip key={c} on={selected.has(c)} onClick={() => toggle(c)} tone={categoryColor(c)} title={`poe.ninja ${c}`}>
          {c}
        </Chip>
      ))}
      <Chip
        on={params.includeUniques}
        onClick={() => onChange({ ...params, includeUniques: !params.includeUniques })}
        tone="bg-orange-700/20 text-orange-300"
        title="uniques priced by poe2scout (refreshed every ~6h)"
      >
        Uniques
      </Chip>
      <button
        type="button"
        onClick={() => onChange({ ...params, categories: allOn ? [] : [...CATEGORY_IDS] })}
        className="px-1.5 text-xs text-neutral-500 hover:text-neutral-300"
      >
        {allOn ? "none" : "all"}
      </button>
    </div>
  );
}

function ModeToggle({ params, onChange }: { params: PricePresetParams; onChange: (p: PricePresetParams) => void }) {
  const opt = (mode: PricePresetParams["mode"], label: string, title: string) => (
    <button
      type="button"
      onClick={() => onChange({ ...params, mode })}
      title={title}
      aria-pressed={params.mode === mode}
      className={`px-3 py-1 text-xs font-semibold ${params.mode === mode ? "bg-neutral-700 text-neutral-100" : "text-neutral-500 hover:text-neutral-300"}`}
    >
      {label}
    </button>
  );
  return (
    <div className="inline-flex overflow-hidden rounded-md border border-neutral-700">
      {opt("keep", "Keep ≥", "highlight items worth at least the threshold")}
      {opt("trash", "Trash <", "highlight everything EXCEPT items worth the threshold — for vendoring")}
    </div>
  );
}

function Threshold({ params, onChange }: { params: PricePresetParams; onChange: (p: PricePresetParams) => void }) {
  const set = (minDiv: number) => onChange({ ...params, minDiv: Number.isFinite(minDiv) && minDiv >= 0 ? minDiv : 0 });
  return (
    <label className="flex items-center gap-2 text-xs text-neutral-400" title="Divine value per unit">
      <input
        type="number"
        min={0}
        step="any"
        value={params.minDiv}
        onChange={(e) => set(Number(e.target.value))}
        className="w-20 rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-right tabular-nums text-neutral-100"
      />
      Div
      <input
        type="range"
        min={0}
        max={100}
        value={toSlider(params.minDiv)}
        onChange={(e) => set(fromSlider(Number(e.target.value)))}
        className="w-40 accent-amber-500"
        aria-label="threshold (log scale)"
      />
    </label>
  );
}

export function RegexParamsForm({ params, onChange }: { params: PricePresetParams; onChange: (p: PricePresetParams) => void }) {
  return (
    <div className="flex flex-col gap-3">
      <CategoryChips params={params} onChange={onChange} />
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <ModeToggle params={params} onChange={onChange} />
        <Threshold params={params} onChange={onChange} />
      </div>
    </div>
  );
}
