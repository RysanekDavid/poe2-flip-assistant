"use client";

import type { ReactNode } from "react";
import Image, { type StaticImageData } from "next/image";
import { POOL_HEADERS, type PoolHeader } from "../../../core/tools/regex/pools/headers";
import type { PoolTab, RegexPool } from "../../../core/tools/regex/pools/schema";
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
import { InfoTip } from "../../ui/Tooltip";
import artWaystone from "../../../assets/items/waystone.png";
import artTablet from "../../../assets/items/precursor-tablet.png";
import artRelic from "../../../assets/items/coffer-relic.png";
import artJewel from "../../../assets/items/emerald-jewel.png";
import { ChipToggle, Field, RarityChips, VerifyMarker } from "./controls";
import { headerName } from "./describe";
import { NumberField, RangeFields } from "./numberFields";
import { Segmented, type SegmentOption } from "./Segmented";
import { setProp, tierOf } from "./selectionOps";

export const POOL_ART: Record<PoolTab, StaticImageData> = { waystone: artWaystone, tablet: artTablet, relic: artRelic, jewel: artJewel };
const ITEM_TITLE: Record<PoolTab, string> = { waystone: "Waystone", tablet: "Tablet", relic: "Relic", jewel: "Jewel" };

export const MATCH_OPTIONS: readonly SegmentOption<MatchMode>[] = [
  { value: "any", label: "Any", title: "an item lights up when it has at least one wanted mod" },
  { value: "all", label: "All", title: "an item lights up only when it has every wanted mod" },
];

const CORRUPTED: readonly SegmentOption<CorruptedFilter>[] = [
  { value: "any", label: "Either", title: "corruption does not matter" },
  { value: "only", label: "Only", title: "only corrupted items" },
  { value: "exclude", label: "Exclude", title: "only items that are not corrupted" },
];

const TIER_BOUNDS = { lo: WAYSTONE_TIER_MIN, hi: WAYSTONE_TIER_MAX };
const TIER_QUICK = [
  { label: "T1–5", min: 1, max: 5 },
  { label: "T6–10", min: 6, max: 10 },
  { label: "T11–15", min: 11, max: 15 },
  { label: "T16", min: 16, max: 16 },
] as const;

/** One titled filter card (poeregex.cz's grouping): small-caps title, optional art and tooltip. */
export function FilterCard({ title, art, tip, children }: { title: string; art?: StaticImageData; tip?: ReactNode; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-3 rounded-lg border border-line bg-surface/60 p-4">
      <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-neutral-300">
        {art && <Image src={art} alt="" className="h-4 w-4 object-contain" />}
        {title}
        {tip && <InfoTip tip={tip} label={`about ${title}`} />}
      </h3>
      {children}
    </section>
  );
}

/** Any / All plus the one line that says what it means (vendor properties reuse it). */
export function MatchField({ value, onChange, noun, one }: { value: MatchMode; onChange: (m: MatchMode) => void; noun: string; one: string }) {
  return (
    <Field label={`Wanted ${noun} combine`}>
      <Segmented options={MATCH_OPTIONS} value={value} onChange={onChange} label={`how wanted ${noun} combine`} />
      <span className="text-xs text-neutral-500">{value === "any" ? `Lights an item with at least one wanted ${one}.` : `Lights an item only with every wanted ${one}.`}</span>
    </Field>
  );
}

function TierField({ selection, onChange }: { selection: WaystoneSelection; onChange: (s: WaystoneSelection) => void }) {
  const tier = selection.tier;
  return (
    <Field label="Tier from – to">
      <RangeFields label="waystone tier" min={tier?.min ?? null} max={tier?.max ?? null} bounds={TIER_BOUNDS} onCommit={(min, max) => onChange({ ...selection, tier: tierOf(min, max) })} />
      <div className="flex flex-wrap gap-1.5">
        {TIER_QUICK.map((q) => {
          const on = tier?.min === q.min && tier.max === q.max;
          return (
            <ChipToggle key={q.label} on={on} onClick={() => onChange({ ...selection, tier: on ? null : { min: q.min, max: q.max } })}>
              {q.label}
            </ChipToggle>
          );
        })}
      </div>
    </Field>
  );
}

function TabletTypes({ pool, selection, onChange }: { pool: RegexPool; selection: TabletSelection; onChange: (s: TabletSelection) => void }) {
  const label = (id: string) => pool.bands.find((b) => b.id === id)?.label ?? id;
  const toggle = (t: (typeof TABLET_TYPES)[number]) =>
    onChange({ ...selection, types: selection.types.includes(t) ? selection.types.filter((x) => x !== t) : TABLET_TYPES.filter((x) => x === t || selection.types.includes(x)) });
  return (
    <Field label="Type (none = every tablet)">
      <div className="flex flex-wrap gap-1.5">
        {TABLET_TYPES.map((t) => (
          <ChipToggle key={t} size="md" on={selection.types.includes(t)} onClick={() => toggle(t)} title={`${label(t)} Tablet`}>
            {label(t)}
          </ChipToggle>
        ))}
      </div>
    </Field>
  );
}

/** Minimums on header properties (Item Rarity, Pack Size…), each flagged when its spelling is unverified. */
function PropertyCard({ tab, headers, selection, onChange }: { tab: PoolTab; headers: readonly PoolHeader[]; selection: PoolTabSelection; onChange: (s: PoolTabSelection) => void }) {
  const props = headers.filter((h) => h.kind === "property" && slotCount(h.template) === 1);
  if (props.length === 0) return null;
  return (
    <FilterCard title={tab === "waystone" ? "Map properties (at least)" : "Properties (at least)"} tip="Minimums are matched on the item's own lines. An empty field never filters.">
      <div className="flex flex-col gap-1.5">
        {props.map((h) => (
          <span key={h.id} className="flex items-center gap-2 text-sm text-neutral-300">
            <span className="min-w-0 flex-1 truncate" title={h.template}>{headerName(h)}</span>
            <VerifyMarker header={h} align="end" />
            <NumberField label={h.template} placeholder="e.g. 30" value={selection.props[h.id]?.min ?? null} onChange={(v) => onChange(setProp(selection, h.id, v))} />
            <span className="w-3 text-xs text-neutral-500">{h.template.endsWith("%") ? "%" : ""}</span>
          </span>
        ))}
      </div>
    </FilterCard>
  );
}

interface CardsProps {
  pool: RegexPool;
  selection: PoolTabSelection;
  onChange: (next: PoolTabSelection) => void;
}

/** Filter cards above the mod picker: the item itself, its properties, its state. */
export function FilterCards({ pool, selection, onChange }: CardsProps) {
  const headers = POOL_HEADERS[pool.tab];
  const corruptedHeader = headers.find((h) => h.id === "corrupted");
  return (
    <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
      <FilterCard title={ITEM_TITLE[pool.tab]} art={POOL_ART[pool.tab]}>
        {selection.tab === "waystone" && <TierField selection={selection} onChange={onChange} />}
        {selection.tab === "tablet" && <TabletTypes pool={pool} selection={selection} onChange={onChange} />}
        <MatchField value={selection.match} onChange={(match) => onChange({ ...selection, match })} noun="mods" one="mod" />
      </FilterCard>
      <PropertyCard tab={pool.tab} headers={headers} selection={selection} onChange={onChange} />
      <FilterCard title="State">
        <Field label="Corrupted" extra={selection.corrupted !== "any" && <VerifyMarker header={corruptedHeader} align="end" />}>
          <Segmented options={CORRUPTED} value={selection.corrupted} onChange={(corrupted) => onChange({ ...selection, corrupted })} label="corrupted items" />
        </Field>
        <RarityChips value={selection.rarity} onChange={(rarity) => onChange({ ...selection, rarity })} headers={headers} />
      </FilterCard>
    </div>
  );
}
