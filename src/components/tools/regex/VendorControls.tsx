"use client";

import type { ReactNode } from "react";
import { VENDOR_HEADERS, type PoolHeader } from "../../../core/tools/regex/pools/headers";
import { RESISTANCES, type ValueRange, type VendorSelection } from "../../../lib/tools/regexPoolContract";
import artGold from "../../../assets/items/gold.png";
import { ChipToggle, Field, RarityChips, VerifyMarker } from "./controls";
import { FilterCard, MatchField } from "./FilterCards";
import { NumberField, RangeFields } from "./numberFields";
import { rangeOf, type Bounds } from "./selectionOps";

interface Props {
  classes: readonly string[];
  selection: VendorSelection;
  onChange: (next: VendorSelection) => void;
}

const header = (id: string) => VENDOR_HEADERS.find((h) => h.id === id);
// Class names are matched on the clipboard-only "Item Class:" line (buildVendorNamespace), which the tooltip may not print.
const CLASS_LINE: PoolHeader = { id: "class", template: "Item Class: …", kind: "class", verified: "unverified", note: "the tooltip may not print the item class" };

const SOCKET_BOUNDS = { lo: 1, hi: 6 };
const EMPTY_NEVER_FILTERS = "An empty field never filters.";

function MinRow({ label, unit, value, onChange, extra, bounds }: { label: string; unit: string; value: number | null; onChange: (v: number | null) => void; extra?: ReactNode; bounds?: Bounds }) {
  return (
    <span className="flex items-center gap-2 text-sm text-neutral-300">
      <span className="min-w-0 flex-1">{label}</span>
      {extra}
      <NumberField label={label} placeholder="e.g. 25" value={value} onChange={onChange} bounds={bounds} />
      <span className="w-3 text-xs text-neutral-500">{unit}</span>
    </span>
  );
}

function RangeRow({ label, value, onChange, extra }: { label: string; value: ValueRange | null; onChange: (r: ValueRange | null) => void; extra?: ReactNode }) {
  return (
    <span className="flex flex-wrap items-center gap-2 text-sm text-neutral-300">
      <span className="min-w-0 flex-1">{label}</span>
      {extra}
      <RangeFields label={label} min={value?.min ?? null} max={value?.max ?? null} onCommit={(min, max) => onChange(rangeOf(min, max))} />
    </span>
  );
}

/** What a good vendor item has — combined by Any / All like wanted mods. */
function WantedCard({ selection: s, onChange }: Pick<Props, "selection" | "onChange">) {
  return (
    <FilterCard title="Worth picking up (at least)" art={artGold} tip={EMPTY_NEVER_FILTERS}>
      <MatchField value={s.match} onChange={(match) => onChange({ ...s, match })} noun="properties" one="property" />
      <div className="flex flex-col gap-1.5">
        <MinRow label="Quality" unit="%" value={s.quality} onChange={(quality) => onChange({ ...s, quality })} extra={<VerifyMarker header={header("quality")} align="end" />} />
        <MinRow label="Movement speed" unit="%" value={s.movementSpeed} onChange={(movementSpeed) => onChange({ ...s, movementSpeed })} />
        {RESISTANCES.map((r) => (
          <MinRow key={r} label={`${r[0]?.toUpperCase()}${r.slice(1)} resistance`} unit="%" value={s.resistances[r]} onChange={(v) => onChange({ ...s, resistances: { ...s.resistances, [r]: v } })} />
        ))}
        <MinRow label="+ level of skills (any +skills line)" unit="" value={s.plusSkills} onChange={(plusSkills) => onChange({ ...s, plusSkills })} />
        <MinRow label="Sockets" unit="" value={s.sockets} bounds={SOCKET_BOUNDS} onChange={(sockets) => onChange({ ...s, sockets })} extra={<VerifyMarker header={header("sockets")} align="end" />} />
      </div>
    </FilterCard>
  );
}

function ClassCard({ classes, selection, onChange }: Props) {
  const toggle = (c: string) =>
    onChange({ ...selection, classes: selection.classes.includes(c) ? selection.classes.filter((x) => x !== c) : classes.filter((x) => x === c || selection.classes.includes(x)) });
  return (
    <FilterCard title="Item class" tip="None selected = every class.">
      <Field label={selection.classes.length > 0 ? `${selection.classes.length} selected` : "Any class"} extra={selection.classes.length > 0 && <VerifyMarker header={CLASS_LINE} align="end" />}>
        <div className="flex flex-wrap gap-1.5">
          {classes.map((c) => (
            <ChipToggle key={c} on={selection.classes.includes(c)} onClick={() => toggle(c)}>
              {c}
            </ChipToggle>
          ))}
        </div>
      </Field>
    </FilterCard>
  );
}

/** Vendor tab filter cards: what makes an item worth it, its level and rarity, its class. */
export function VendorControls({ classes, selection, onChange }: Props) {
  return (
    <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
      <WantedCard selection={selection} onChange={onChange} />
      <FilterCard title="Item" tip={EMPTY_NEVER_FILTERS}>
        <RarityChips value={selection.rarity} onChange={(rarity) => onChange({ ...selection, rarity })} headers={VENDOR_HEADERS} />
        <div className="flex flex-col gap-1.5">
          <RangeRow label="Item level" value={selection.itemLevel} onChange={(itemLevel) => onChange({ ...selection, itemLevel })} />
          <RangeRow label="Required level" value={selection.requiredLevel} onChange={(requiredLevel) => onChange({ ...selection, requiredLevel })} extra={<VerifyMarker header={header("requiredLevel")} align="end" />} />
        </div>
      </FilterCard>
      <ClassCard classes={classes} selection={selection} onChange={onChange} />
    </div>
  );
}
