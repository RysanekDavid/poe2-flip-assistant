"use client";

import { POOL_HEADERS, type PoolHeader } from "../../../core/tools/regex/pools/headers";
import type { RegexPool } from "../../../core/tools/regex/pools/schema";
import { slotCount } from "../../../core/tools/regex/pools/template";
import {
  TABLET_TYPES,
  WAYSTONE_TIER_MAX,
  WAYSTONE_TIER_MIN,
  type CorruptedFilter,
  type MatchMode,
  type PoolTabSelection,
  type TabletSelection,
  type WaystoneSelection,
} from "../../../lib/tools/regexPoolContract";
import { ChipToggle, Field, MaxCharsInput, RarityChips, VerifyMarker } from "./controls";
import { NumberField, RangeFields } from "./numberFields";
import { Segmented, type SegmentOption } from "./Segmented";
import { setProp, tierOf } from "./selectionOps";

interface ControlsProps {
  pool: RegexPool;
  selection: PoolTabSelection;
  onChange: (next: PoolTabSelection) => void;
  maxChars: number;
  onMaxChars: (n: number) => void;
}

const MATCH: readonly SegmentOption<MatchMode>[] = [
  { value: "any", label: "Any", title: "an item lights up when it has at least one wanted mod" },
  { value: "all", label: "All", title: "an item lights up only when it has every wanted mod" },
];

const CORRUPTED: readonly SegmentOption<CorruptedFilter>[] = [
  { value: "any", label: "Either", title: "corruption does not matter" },
  { value: "only", label: "Only", title: "only corrupted items" },
  { value: "exclude", label: "Exclude", title: "only items that are not corrupted" },
];

export const MATCH_OPTIONS = MATCH;

const TIER_BOUNDS = { lo: WAYSTONE_TIER_MIN, hi: WAYSTONE_TIER_MAX };

function TierRange({ selection, onChange }: { selection: WaystoneSelection; onChange: (s: WaystoneSelection) => void }) {
  return (
    <Field label="Waystone tier">
      <RangeFields
        label="waystone tier"
        min={selection.tier?.min ?? null}
        max={selection.tier?.max ?? null}
        bounds={TIER_BOUNDS}
        onCommit={(min, max) => onChange({ ...selection, tier: tierOf(min, max) })}
      />
    </Field>
  );
}

function TabletTypes({ pool, selection, onChange }: { pool: RegexPool; selection: TabletSelection; onChange: (s: TabletSelection) => void }) {
  const label = (id: string) => pool.bands.find((b) => b.id === id)?.label ?? id;
  const toggle = (t: (typeof TABLET_TYPES)[number]) =>
    onChange({ ...selection, types: selection.types.includes(t) ? selection.types.filter((x) => x !== t) : TABLET_TYPES.filter((x) => x === t || selection.types.includes(x)) });
  return (
    <Field label="Tablet type">
      <div className="flex flex-wrap gap-1.5">
        {TABLET_TYPES.map((t) => (
          <ChipToggle key={t} on={selection.types.includes(t)} onClick={() => toggle(t)}>
            {label(t)}
          </ChipToggle>
        ))}
      </div>
    </Field>
  );
}

/** Minimums on header properties (Item Rarity, Pack Size…), each flagged when its spelling is unverified. */
function PropertyMins({ headers, selection, onChange }: { headers: readonly PoolHeader[]; selection: PoolTabSelection; onChange: (s: PoolTabSelection) => void }) {
  const props = headers.filter((h) => h.kind === "property" && slotCount(h.template) === 1);
  if (props.length === 0) return null;
  return (
    <Field label="At least">
      <div className="flex flex-col gap-1.5">
        {props.map((h) => (
          <span key={h.id} className="flex items-center gap-2 text-sm text-neutral-300">
            <NumberField label={h.template} value={selection.props[h.id]?.min ?? null} onChange={(v) => onChange(setProp(selection, h.id, v))} />
            <span className="min-w-0 flex-1 truncate" title={h.template}>{h.template.replace(/:? ?[+-]?#%?$/, "")}</span>
            <VerifyMarker header={h} align="end" />
          </span>
        ))}
      </div>
    </Field>
  );
}

/** Right column: how wanted mods combine, and the filters every string repeats. */
export function PoolControls({ pool, selection, onChange, maxChars, onMaxChars }: ControlsProps) {
  const headers = POOL_HEADERS[pool.tab];
  const corruptedHeader = headers.find((h) => h.id === "corrupted");
  return (
    <aside aria-label="filters" className="flex flex-col gap-4 rounded-lg border border-line bg-surface/60 p-4">
      <Field label="Wanted mods">
        <Segmented options={MATCH} value={selection.match} onChange={(match) => onChange({ ...selection, match })} label="how wanted mods combine" />
      </Field>
      {selection.tab === "waystone" && <TierRange selection={selection} onChange={onChange} />}
      {selection.tab === "tablet" && <TabletTypes pool={pool} selection={selection} onChange={onChange} />}
      <RarityChips value={selection.rarity} onChange={(rarity) => onChange({ ...selection, rarity })} headers={headers} />
      <Field label="Corrupted" extra={selection.corrupted !== "any" && <VerifyMarker header={corruptedHeader} align="end" />}>
        <Segmented options={CORRUPTED} value={selection.corrupted} onChange={(corrupted) => onChange({ ...selection, corrupted })} label="corrupted items" />
      </Field>
      <PropertyMins headers={headers} selection={selection} onChange={onChange} />
      <MaxCharsInput value={maxChars} onChange={onMaxChars} />
    </aside>
  );
}
