"use client";

import { useCallback, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { ChevronRight, Search } from "lucide-react";
import type { PlannerPool } from "../../../lib/tools/craftPlannerContract";
import { Drawer } from "../../ui/Drawer";
import { Toggle } from "../../ui/Toggle";
import { familyKey, genericText, type PoolFamily, type Side, type SlotPick } from "./plannerModel";
import { ArtBadge } from "./tooltipParts";
import { TierLadder } from "./TierLadder";

/**
 * The mod picker for one slot: search, the base's families for that side grouped by where they come
 * from (natural rolls, essence-only, the desecrated pool), and per family the full tier ladder to
 * pick the minimum tier from. Up/Down move through the list; Enter opens a family or picks a tier.
 */

const GROUPS: ReadonlyArray<{ source: PoolFamily["source"]; title: string; hint: string }> = [
  { source: "natural", title: "Rolls naturally", hint: "currency can roll these" },
  { source: "essence", title: "Essence only", hint: "only an essence writes these — they take the one crafted slot" },
  { source: "desecrated", title: "Desecrated pool", hint: "a bone + reveal at the Well of Souls — one desecrated mod per item" },
];

interface Props {
  side: Side;
  pool: PlannerPool;
  ilvl: number;
  current: SlotPick | null;
  /** Families already picked: in another slot or in either pool. */
  taken: ReadonlySet<string>;
  onPick: (pick: SlotPick) => void;
  onClose: () => void;
  /** Adding a candidate to a side's pool: ordinary mods only, never fractured. */
  poolMode?: boolean;
}

const best = (f: PoolFamily) => f.tiers[f.tiers.length - 1]!;

function matches(f: PoolFamily, q: string): boolean {
  if (!q) return true;
  const hay = [f.family, ...f.tiers.map((t) => t.text), ...f.essences.map((e) => e.label), f.faction ?? ""].join(" ").toLowerCase();
  return q.split(/\s+/).every((w) => hay.includes(w));
}

/** Up/Down across every focusable row of the list (family headers and tier buttons alike). */
function moveFocus(e: KeyboardEvent<HTMLElement>, list: HTMLElement | null): void {
  if (!list || (e.key !== "ArrowDown" && e.key !== "ArrowUp")) return;
  const rows = [...list.querySelectorAll<HTMLElement>("[data-row]:not([disabled])")];
  const at = rows.findIndex((r) => r === document.activeElement);
  const next = e.key === "ArrowDown" ? rows[at + 1] : at <= 0 ? null : rows[at - 1];
  e.preventDefault();
  if (next) next.focus();
  else if (at <= 0 && e.key === "ArrowUp") list.closest("[role=dialog]")?.querySelector<HTMLInputElement>("input[type=search]")?.focus();
}

function FamilyBadges({ f, pool }: { f: PoolFamily; pool: PlannerPool }) {
  return (
    <span className="flex shrink-0 items-center gap-1">
      {f.essences.map((e) => (
        <ArtBadge key={e.id} src={e.icon} label={`${e.label} writes ${f.tiers.find((t) => t.modId === e.modId)?.text ?? e.modId}`} />
      ))}
      {f.source === "desecrated" && <ArtBadge src={pool.bone.icon} label={`${pool.bone.label} — desecrated pool`} />}
      {f.faction && <span className="rounded border border-purple-900 px-1 text-xs capitalize text-[#c9a0ff]">{f.faction}</span>}
    </span>
  );
}

interface RowProps {
  f: PoolFamily;
  pool: PlannerPool;
  ilvl: number;
  open: boolean;
  taken: boolean;
  current: SlotPick | null;
  onToggle: () => void;
  onTier: (modId: string) => void;
}

function FamilyRow({ f, pool, ilvl, open, taken, current, onToggle, onTier }: RowProps) {
  const top = best(f);
  return (
    <li className={`rounded-md border ${open ? "border-amber-700/50 bg-neutral-900" : "border-transparent"}`}>
      <button
        type="button"
        data-row
        disabled={taken}
        aria-expanded={open}
        onClick={onToggle}
        title={taken ? "already picked: in another slot or a pool" : undefined}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-white/5 focus-visible:outline focus-visible:outline-1 focus-visible:outline-amber-400 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <ChevronRight aria-hidden className={`h-3.5 w-3.5 shrink-0 text-neutral-500 transition-transform ${open ? "rotate-90" : ""}`} />
        <span className="min-w-0 flex-1">
          <span className="block text-sm text-[#8888ff]">{genericText(top.text)}</span>
          <span className="block text-xs text-neutral-500">
            {f.tiers.length} {f.tiers.length === 1 ? "tier" : "tiers"} · best needs ilvl {top.level}
            {taken ? " · already picked" : ""}
          </span>
        </span>
        <FamilyBadges f={f} pool={pool} />
      </button>
      {open && <TierLadder family={f} ilvl={ilvl} current={current?.minModId ?? null} onPick={onTier} />}
    </li>
  );
}

function usePickerState(props: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(props.current ? familyKey(props.current) : null);
  const [fractured, setFractured] = useState(props.current?.fractured ?? false);
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const mine = props.pool.families.filter((f) => f.side === props.side && matches(f, q) && (!props.poolMode || f.source === "natural"));
    return GROUPS.map((g) => ({ ...g, families: mine.filter((f) => f.source === g.source) })).filter((g) => g.families.length > 0);
  }, [props.pool, props.side, props.poolMode, query]);
  return { query, setQuery, open, setOpen, fractured, setFractured, groups };
}

/** The search box; it takes focus once the Drawer has mounted (the Drawer focuses its close button first). */
function PickerSearch({ side, query, onQuery, list }: { side: Side; query: string; onQuery: (q: string) => void; list: RefObject<HTMLDivElement | null> }) {
  const focusOnMount = useCallback((el: HTMLInputElement | null) => {
    if (el) requestAnimationFrame(() => el.focus());
  }, []);
  return (
    <label className="flex items-center gap-2 rounded-md border border-neutral-700 bg-neutral-900 px-2 focus-within:border-amber-400">
      <Search aria-hidden className="h-4 w-4 text-neutral-500" />
      <input
        ref={focusOnMount}
        type="search"
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        onKeyDown={(e) => e.key === "ArrowDown" && moveFocus(e, list.current)}
        placeholder={`search ${side}es — "mana", "fire res", "essence"…`}
        aria-label={`search ${side}es`}
        className="h-9 min-w-0 flex-1 bg-transparent text-sm text-neutral-100 placeholder:text-neutral-500 focus:outline-none"
      />
    </label>
  );
}

type PickerState = ReturnType<typeof usePickerState>;

function FamilyGroups({ props, s, onPick }: { props: Props; s: PickerState; onPick: (f: PoolFamily, modId: string) => void }) {
  return (
    <>
      {s.groups.length === 0 && <p className="text-sm text-neutral-400">No {props.side} on this base matches “{s.query}”.</p>}
      {s.groups.map((g) => (
        <section key={g.source} aria-label={g.title}>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-400" title={g.hint}>
            {g.title} <span className="font-normal normal-case text-neutral-500">· {g.hint}</span>
          </h3>
          <ul className="space-y-0.5">
            {g.families.map((f) => {
              const key = familyKey(f);
              return (
                <FamilyRow
                  key={key}
                  f={f}
                  pool={props.pool}
                  ilvl={props.ilvl}
                  open={s.open === key}
                  taken={props.taken.has(key)}
                  current={props.current}
                  onToggle={() => s.setOpen(s.open === key ? null : key)}
                  onTier={(modId) => onPick(f, modId)}
                />
              );
            })}
          </ul>
        </section>
      ))}
    </>
  );
}

export function ModPicker(props: Props) {
  const s = usePickerState(props);
  const list = useRef<HTMLDivElement>(null);
  const openDesecrated = s.open?.split("|")[1] === "desecrated";
  const pick = (f: PoolFamily, modId: string) =>
    props.onPick({ family: f.family, side: f.side, source: f.source, minModId: modId, fractured: !props.poolMode && s.fractured && f.source !== "desecrated" });
  return (
    <Drawer title={props.poolMode ? `Add a mod to the ${props.side} pool` : `Choose a ${props.side}`} onClose={props.onClose}>
      <div className="space-y-3">
        <PickerSearch side={props.side} query={s.query} onQuery={s.setQuery} list={list} />
        {props.poolMode ? (
          <p className="text-xs text-neutral-400">Pick the lowest tier you&apos;d accept. Any combination of the pool&apos;s mods counts.</p>
        ) : (
          <Toggle
            checked={s.fractured && !openDesecrated}
            onChange={s.setFractured}
            label="must be fractured on the finished item"
            disabled={openDesecrated}
            disabledReason="a desecrated mod can't be fractured"
          />
        )}
        <div ref={list} onKeyDown={(e) => moveFocus(e, list.current)} className="space-y-4">
          <FamilyGroups props={props} s={s} onPick={pick} />
        </div>
      </div>
    </Drawer>
  );
}
