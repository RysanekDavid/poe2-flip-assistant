"use client";

import type { ReactNode } from "react";
import { VENDOR_HEADERS, type PoolHeader } from "../../../core/tools/regex/pools/headers";
import { RESISTANCES, type ValueRange, type VendorSelection } from "../../../lib/tools/regexPoolContract";
import { ChipToggle, Field, MaxCharsInput, RarityChips, VerifyMarker } from "./controls";
import { NumberField, RangeFields } from "./numberFields";
import { MATCH_OPTIONS } from "./PoolControls";
import { Segmented } from "./Segmented";
import { rangeOf, type Bounds } from "./selectionOps";

interface Props {
  classes: readonly string[];
  selection: VendorSelection;
  onChange: (next: VendorSelection) => void;
  maxChars: number;
  onMaxChars: (n: number) => void;
}

const header = (id: string) => VENDOR_HEADERS.find((h) => h.id === id);
// Class names are matched on the clipboard-only "Item Class:" line (buildVendorNamespace), which the tooltip may not print.
const CLASS_LINE: PoolHeader = { id: "class", template: "Item Class: …", kind: "class", verified: "unverified", note: "the tooltip may not print the item class" };

const SOCKET_BOUNDS = { lo: 1, hi: 6 };

function MinRow({ label, value, onChange, extra, bounds }: { label: string; value: number | null; onChange: (v: number | null) => void; extra?: ReactNode; bounds?: Bounds }) {
  return (
    <span className="flex items-center gap-2 text-sm text-neutral-300">
      <NumberField label={label} value={value} onChange={onChange} bounds={bounds} />
      <span className="min-w-0 flex-1">{label}</span>
      {extra}
    </span>
  );
}

function RangeRow({ label, value, onChange, extra }: { label: string; value: ValueRange | null; onChange: (r: ValueRange | null) => void; extra?: ReactNode }) {
  return (
    <span className="flex items-center gap-2 text-sm text-neutral-300">
      <RangeFields label={label} min={value?.min ?? null} max={value?.max ?? null} onCommit={(min, max) => onChange(rangeOf(min, max))} />
      <span className="min-w-0 flex-1">{label}</span>
      {extra}
    </span>
  );
}

/** What a good vendor item has — combined by Any / All like wanted mods. */
function Wanted({ selection: s, onChange }: Pick<Props, "selection" | "onChange">) {
  return (
    <Field label="Worth picking up">
      <div className="flex flex-col gap-1.5">
        <MinRow label="% quality" value={s.quality} onChange={(quality) => onChange({ ...s, quality })} extra={<VerifyMarker header={header("quality")} align="end" />} />
        <MinRow label="% movement speed" value={s.movementSpeed} onChange={(movementSpeed) => onChange({ ...s, movementSpeed })} />
        {RESISTANCES.map((r) => (
          <MinRow key={r} label={`% ${r} resistance`} value={s.resistances[r]} onChange={(v) => onChange({ ...s, resistances: { ...s.resistances, [r]: v } })} />
        ))}
        <MinRow label="to level of skills (any +skills line)" value={s.plusSkills} onChange={(plusSkills) => onChange({ ...s, plusSkills })} />
        <MinRow
          label="sockets"
          value={s.sockets}
          bounds={SOCKET_BOUNDS}
          onChange={(sockets) => onChange({ ...s, sockets })}
          extra={<VerifyMarker header={header("sockets")} align="end" />}
        />
      </div>
    </Field>
  );
}

function ClassChips({ classes, selection, onChange }: Pick<Props, "classes" | "selection" | "onChange">) {
  const toggle = (c: string) =>
    onChange({ ...selection, classes: selection.classes.includes(c) ? selection.classes.filter((x) => x !== c) : classes.filter((x) => x === c || selection.classes.includes(x)) });
  return (
    <Field label="Item class" extra={selection.classes.length > 0 && <VerifyMarker header={CLASS_LINE} align="end" />}>
      <div className="flex flex-wrap gap-1.5">
        {classes.map((c) => (
          <ChipToggle key={c} on={selection.classes.includes(c)} onClick={() => toggle(c)}>
            {c}
          </ChipToggle>
        ))}
      </div>
    </Field>
  );
}

/** Vendor tab controls: wanted properties on the left, filters every string repeats on the right. */
export function VendorControls({ classes, selection, onChange, maxChars, onMaxChars }: Props) {
  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <section aria-label="vendor properties" className="flex flex-col gap-4 rounded-lg border border-line bg-surface/60 p-4">
        <Field label="Combine">
          <Segmented options={MATCH_OPTIONS} value={selection.match} onChange={(match) => onChange({ ...selection, match })} label="how the properties combine" />
        </Field>
        <Wanted selection={selection} onChange={onChange} />
      </section>
      <aside aria-label="vendor filters" className="flex flex-col gap-4 rounded-lg border border-line bg-surface/60 p-4">
        <RarityChips value={selection.rarity} onChange={(rarity) => onChange({ ...selection, rarity })} headers={VENDOR_HEADERS} />
        <Field label="Levels">
          <div className="flex flex-col gap-1.5">
            <RangeRow label="item level" value={selection.itemLevel} onChange={(itemLevel) => onChange({ ...selection, itemLevel })} />
            <RangeRow label="required level" value={selection.requiredLevel} onChange={(requiredLevel) => onChange({ ...selection, requiredLevel })} extra={<VerifyMarker header={header("requiredLevel")} align="end" />} />
          </div>
        </Field>
        <ClassChips classes={classes} selection={selection} onChange={onChange} />
        <MaxCharsInput value={maxChars} onChange={onMaxChars} />
      </aside>
    </div>
  );
}
