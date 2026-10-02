"use client";

import { useRef, type KeyboardEvent } from "react";
import type { PlannerCatalog } from "../../../lib/tools/craftPlannerContract";
import { ItemArt } from "../../ui/ItemArt";
import { BASE_ART } from "./baseArtMap";
import type { CatalogBase, ItemClass } from "./plannerModel";

/**
 * Class → base, as art: a row of class pills and a grid of base tiles with each base's implicit
 * on hover and its slot caps when they differ from 3 + 3. Arrow keys move across the grid.
 */

const CLASS_ART_BASE: Record<ItemClass, string> = { Rings: "Ruby Ring", Amulets: "Gold Amulet", Belts: "Heavy Belt", Jewels: "Emerald" };

/** Self-hosted base art; a base the CDN had no art for falls back to its class's picture. */
export function baseArt(itemClass: ItemClass, base: string): string | null {
  return BASE_ART[base] ?? BASE_ART[CLASS_ART_BASE[itemClass]] ?? null;
}

const FRAME_ON = "border-amber-500/50 bg-gradient-to-b from-amber-950/40 to-neutral-900/90 shadow-[inset_0_-2px_0_theme(colors.accent)]";
const FRAME_OFF = "border-neutral-800 bg-neutral-900/50 hover:border-neutral-600 hover:bg-neutral-900";

interface Props {
  catalog: PlannerCatalog;
  itemClass: ItemClass;
  base: string;
  onPick: (itemClass: ItemClass, base: string) => void;
}

function ClassPills({ catalog, itemClass, onPick }: Omit<Props, "base">) {
  return (
    <div role="radiogroup" aria-label="item class" className="flex flex-wrap gap-1.5">
      {catalog.classes.map((c) => {
        const on = c.itemClass === itemClass;
        const first = c.bases.find((b) => b.name === CLASS_ART_BASE[c.itemClass]) ?? c.bases[0];
        return (
          <button
            key={c.itemClass}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => first && onPick(c.itemClass, first.name)}
            className={`inline-flex items-center gap-1.5 rounded-md border py-1 pl-1 pr-2.5 text-sm font-semibold transition-colors ${on ? `${FRAME_ON} text-brand-bone` : `${FRAME_OFF} text-neutral-300`}`}
          >
            <ItemArt src={baseArt(c.itemClass, CLASS_ART_BASE[c.itemClass])} size={6} />
            {c.itemClass}
          </button>
        );
      })}
    </div>
  );
}

const capsLabel = (b: CatalogBase): string | null => (b.caps.p === 3 && b.caps.s === 3 ? null : `${b.caps.p}P · ${b.caps.s}S`);

/** Grid arrow keys: left/right step, up/down jump a row (the row width is read from the layout). */
function onGridKey(e: KeyboardEvent<HTMLDivElement>, grid: HTMLDivElement | null): void {
  if (!grid || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
  const tiles = [...grid.querySelectorAll<HTMLButtonElement>("button[data-tile]")];
  const at = tiles.findIndex((t) => t === document.activeElement);
  if (at < 0) return;
  const top = tiles[0]?.offsetTop ?? 0;
  const perRow = Math.max(1, tiles.filter((t) => t.offsetTop === top).length);
  const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -perRow, ArrowDown: perRow }[e.key] ?? 0;
  const next = tiles[at + step];
  if (next) {
    e.preventDefault();
    next.focus();
  }
}

function BaseTile({ itemClass, b, on, onPick }: { itemClass: ItemClass; b: CatalogBase; on: boolean; onPick: () => void }) {
  const caps = capsLabel(b);
  const implicit = b.implicits.join(" · ");
  return (
    <button
      type="button"
      data-tile
      role="radio"
      aria-checked={on}
      tabIndex={on ? 0 : -1}
      onClick={onPick}
      title={[b.name, implicit || "no implicit", caps ? `${caps} slots` : null].filter(Boolean).join(" — ")}
      className={`relative flex flex-col items-center gap-1 rounded-md border px-1 pb-1.5 pt-2 text-center transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-neutral-300 ${on ? FRAME_ON : FRAME_OFF}`}
    >
      <span className="drop-shadow-[0_2px_3px_rgba(0,0,0,.8)]">
        <ItemArt src={baseArt(itemClass, b.name)} size={12} />
      </span>
      <span className={`line-clamp-2 text-xs leading-tight ${on ? "text-brand-bone" : "text-neutral-300"}`}>{b.name}</span>
      {caps && <span className="absolute right-1 top-1 rounded bg-amber-400/15 px-1 text-xs tabular-nums text-amber-200">{caps}</span>}
    </button>
  );
}

export function BaseChooser({ catalog, itemClass, base, onPick }: Props) {
  const grid = useRef<HTMLDivElement>(null);
  const bases = catalog.classes.find((c) => c.itemClass === itemClass)?.bases ?? [];
  return (
    <div className="space-y-3">
      <ClassPills catalog={catalog} itemClass={itemClass} onPick={onPick} />
      <div
        ref={grid}
        role="radiogroup"
        aria-label={`${itemClass} base`}
        onKeyDown={(e) => onGridKey(e, grid.current)}
        className="grid grid-cols-4 gap-1.5 sm:grid-cols-6 lg:grid-cols-5 xl:grid-cols-6"
      >
        {bases.map((b) => (
          <BaseTile key={b.name} itemClass={itemClass} b={b} on={b.name === base} onPick={() => onPick(itemClass, b.name)} />
        ))}
      </div>
    </div>
  );
}
