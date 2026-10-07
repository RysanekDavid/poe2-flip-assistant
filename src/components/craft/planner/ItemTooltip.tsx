"use client";

import { Minus, Plus, X } from "lucide-react";
import type { FeasibilityIssueView, PlannerPool } from "../../../lib/tools/craftPlannerContract";
import { IssueLine } from "./IssueLine";
import { NumberField } from "./NumberField";
import { findFamily, tierOf, type CatalogBase, type Pools, type Side, type SidePool, type SlotPick, type Slots } from "./plannerModel";
import { PoolRows } from "./PoolRows";
import { ArtBadge, MOD_TONE, Separator, SideChip, TooltipFrame } from "./tooltipParts";

/**
 * The input: an in-game item tooltip you build. Base header + implicits, then one row per affix
 * slot — empty slots are dashed buttons that open the mod picker, filled ones read like the
 * advanced tooltip (side, tier, blue mod text). Server reasons for a refused plan sit on the slot
 * they concern.
 */

interface Props {
  base: CatalogBase;
  art: string | null;
  ilvl: number;
  onIlvl: (n: number) => void;
  slots: Slots;
  /** null while the base's pool loads: slot rows render as placeholders. */
  pool: PlannerPool | null;
  qualityLine: string | null;
  issuesFor: (side: Side, slot: number) => FeasibilityIssueView[];
  onOpen: (side: Side, slot: number) => void;
  onClear: (side: Side, slot: number) => void;
  /** Mod pools per side and their editing (pool mode: "any k of these"). */
  pools: Pools;
  poolIssues: (side: Side) => FeasibilityIssueView[];
  onPoolMode: (side: Side, on: boolean) => void;
  onPoolAdd: (side: Side) => void;
  onPoolChange: (side: Side, pool: SidePool) => void;
}

function SideHeader({ side, pooled, onPoolMode }: { side: Side; pooled: boolean; onPoolMode: (on: boolean) => void }) {
  return (
    <div className="mb-1 flex items-center justify-between gap-2 text-xs text-neutral-400">
      <span className="uppercase tracking-wide">{side}es</span>
      <button
        type="button"
        aria-pressed={pooled}
        onClick={() => onPoolMode(!pooled)}
        title={pooled ? "back to one mod per slot" : "put several mods in a pool and say how many must land — any combination is fine"}
        className={`rounded border px-1.5 py-0.5 ${pooled ? "border-amber-400/60 text-amber-200" : "border-neutral-700 text-neutral-300 hover:border-amber-500/60 hover:text-amber-200"}`}
      >
        {pooled ? "pool on" : "any of… (pool)"}
      </button>
    </div>
  );
}

function SideSlots({ side, props }: { side: Side; props: Props }) {
  const pool = props.pools[side];
  const cap = side === "prefix" ? props.base.caps.p : props.base.caps.s;
  return (
    <div>
      <SideHeader side={side} pooled={pool != null} onPoolMode={(on) => props.onPoolMode(side, on)} />
      {pool && props.pool && (
        <PoolRows
          side={side}
          pool={pool}
          data={props.pool}
          cap={cap}
          issues={props.poolIssues(side)}
          onAdd={() => props.onPoolAdd(side)}
          onRemove={(i) => props.onPoolChange(side, { ...pool, candidates: pool.candidates.filter((_, k) => k !== i) })}
          onNeed={(k) => props.onPoolChange(side, { ...pool, need: k })}
        />
      )}
      <SlotList side={side} props={props} />
    </div>
  );
}

const STEP_BTN = "inline-flex h-6 w-6 items-center justify-center rounded border border-neutral-700 text-neutral-300 hover:border-amber-500/60 hover:text-amber-200 disabled:opacity-40";

function IlvlStepper({ ilvl, onIlvl }: { ilvl: number; onIlvl: (n: number) => void }) {
  const set = (n: number) => onIlvl(Math.min(100, Math.max(1, Math.round(n))));
  return (
    <div className="flex items-center justify-center gap-2 text-sm text-neutral-400">
      <span>Item Level:</span>
      <button type="button" aria-label="lower item level" className={STEP_BTN} disabled={ilvl <= 1} onClick={() => set(ilvl - 1)}>
        <Minus aria-hidden className="h-3 w-3" />
      </button>
      <NumberField
        value={ilvl}
        min={1}
        max={100}
        onCommit={set}
        label="item level"
        title="item level gates the tiers the base can roll"
        className="h-6 w-12 rounded border border-neutral-700 bg-neutral-950 text-center text-sm tabular-nums text-neutral-100 focus:border-amber-400 focus:outline-none"
      />
      <button type="button" aria-label="raise item level" className={STEP_BTN} disabled={ilvl >= 100} onClick={() => set(ilvl + 1)}>
        <Plus aria-hidden className="h-3 w-3" />
      </button>
    </div>
  );
}

function sourceBadge(pick: SlotPick, pool: PlannerPool) {
  const fam = findFamily(pool, pick);
  if (pick.source === "desecrated") return <ArtBadge src={pool.bone.icon} label={`desecrated pool${fam?.faction ? ` · ${fam.faction}` : ""} — ${pool.bone.label}`} />;
  const ess = fam?.essences[0];
  if (pick.source === "essence" && ess) return <ArtBadge src={ess.icon} label={`crafted-only: ${ess.label}`} />;
  return null;
}

function FilledRow({ pick, pool, onOpen, onClear }: { pick: SlotPick; pool: PlannerPool; onOpen: () => void; onClear: () => void }) {
  const fam = findFamily(pool, pick);
  const t = fam ? tierOf(fam, pick.minModId) : null;
  const tone = pick.fractured ? MOD_TONE.fractured : pick.source === "essence" ? MOD_TONE.crafted : pick.source === "desecrated" ? MOD_TONE.desecrated : MOD_TONE.explicit;
  const tierTip = t ? `tier ${t.k} of ${t.n} or better · level ${t.tier.level} · ${t.tier.text}` : "tier not in this base's pool";
  return (
    <div className="group flex items-center gap-2">
      <button type="button" onClick={onOpen} title={`${tierTip} — click to change`} className="flex min-w-0 flex-1 items-center gap-2 rounded px-1 py-0.5 text-left hover:bg-white/5 focus-visible:outline focus-visible:outline-1 focus-visible:outline-amber-400">
        <SideChip side={pick.side} tier={t ? `${t.k}+` : "?"} />
        <span className={`min-w-0 flex-1 text-sm sm:text-base ${tone}`}>
          {t?.tier.text ?? pick.minModId}
          {pick.fractured && <span className="ml-1.5 text-xs uppercase tracking-wide text-[#c4b17a]/80">fractured</span>}
        </span>
        {sourceBadge(pick, pool)}
      </button>
      <button type="button" onClick={onClear} aria-label={`remove ${t?.tier.text ?? pick.family}`} className="rounded p-1 text-neutral-500 hover:bg-white/5 hover:text-neutral-200">
        <X aria-hidden className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function EmptyRow({ side, onOpen }: { side: Side; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-2 rounded border border-dashed border-neutral-700 px-1 py-1 text-left text-sm text-neutral-500 transition-colors hover:border-amber-500/60 hover:bg-amber-950/20 hover:text-amber-200 focus-visible:outline focus-visible:outline-1 focus-visible:outline-amber-400"
    >
      <SideChip side={side} />
      <span className="flex-1">+ choose a {side}</span>
    </button>
  );
}

function SlotList({ side, props }: { side: Side; props: Props }) {
  const list = props.slots[side];
  return (
    <ul aria-label={`${side}es`} className="space-y-1">
      {list.map((pick, i) => (
        <li key={`${side}-${i}`}>
          {props.pool == null ? (
            <div aria-hidden className="h-7 animate-pulse rounded bg-neutral-800/50" />
          ) : pick ? (
            <FilledRow pick={pick} pool={props.pool} onOpen={() => props.onOpen(side, i)} onClear={() => props.onClear(side, i)} />
          ) : (
            <EmptyRow side={side} onOpen={() => props.onOpen(side, i)} />
          )}
          {props.issuesFor(side, i).map((issue) => (
            <IssueLine key={issue.rule + issue.message} issue={issue} compact />
          ))}
        </li>
      ))}
    </ul>
  );
}

export function ItemTooltip(props: Props) {
  const { base } = props;
  return (
    <TooltipFrame title={base.name} subtitle={`Rare · ${base.caps.p} prefix + ${base.caps.s} suffix slots`} art={props.art}>
      <IlvlStepper ilvl={props.ilvl} onIlvl={props.onIlvl} />
      {props.qualityLine && <p className="mt-1 text-center text-sm text-neutral-400">{props.qualityLine}</p>}
      {base.implicits.length > 0 && (
        <>
          <Separator />
          {base.implicits.map((line) => (
            <p key={line} className={`text-center text-sm ${MOD_TONE.implicit}`}>
              {line}
            </p>
          ))}
        </>
      )}
      <Separator />
      <SideSlots side="prefix" props={props} />
      <div className="h-2" />
      <SideSlots side="suffix" props={props} />
    </TooltipFrame>
  );
}
