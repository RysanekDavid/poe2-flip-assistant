"use client";

import { MatIcon, priceLabel } from "../../craft/craftView";
import {
  MOVE_FAMILY_ORDER,
  type BlockedMoveView,
  type MoveFamilyView,
  type PricedMoveView,
} from "../../../lib/tools/craftMovesContract";

const FAMILY_LABEL: Record<MoveFamilyView, string> = {
  currency: "Currency",
  omen: "Omens",
  bone: "Abyssal bones",
  essence: "Essences",
  catalyst: "Catalysts",
  liquid: "Liquid emotions",
};

function UnverifiedBadge({ source }: { source: string }) {
  return (
    <span
      title={`not backed by the verified 0.5.x KB — source: ${source}`}
      className="rounded border border-amber-800 px-1 text-[9px] uppercase tracking-wider text-amber-500"
    >
      unverified
    </span>
  );
}

function costTitle(m: PricedMoveView): string {
  return m.materials
    .map((x) => `${x.qty}× ${x.label}: ${x.unitDiv == null ? (x.ninjaId ? "no ninja price" : "not listed on poe.ninja") : `${x.unitDiv.toPrecision(3)} div`}`)
    .join("\n");
}

function MoveRow({ m, ex }: { m: PricedMoveView; ex: number | null }) {
  const tip = [`requires: ${m.requires}`, `effect: ${m.effect}`, ...m.notes, `source: ${m.source}`].join("\n");
  return (
    <li className="py-1.5">
      <div className="flex items-center gap-2">
        <span className="flex shrink-0 -space-x-1">
          {m.materials.map((x) => (
            <span key={x.key} title={x.label}>
              <MatIcon icon={x.icon} size={5} />
            </span>
          ))}
        </span>
        <span className="min-w-0 flex-1 truncate text-neutral-200" title={tip}>
          {m.label}
        </span>
        {m.floor != null && (
          <span className="rounded bg-neutral-800 px-1 text-[10px] tabular-nums text-neutral-400" title={`cannot roll tiers below modifier level ${m.floor} (soft floor)`}>
            ≥{m.floor}
          </span>
        )}
        {!m.verified && <UnverifiedBadge source={m.source} />}
        <span className={`w-20 text-right text-sm tabular-nums ${m.totalDiv == null ? "text-neutral-600" : "text-neutral-300"}`} title={costTitle(m)}>
          {m.totalDiv == null ? "unpriced" : priceLabel(m.totalDiv, ex)}
        </span>
      </div>
      {m.warnings.map((w) => (
        <p key={w} className="ml-7 mt-0.5 text-xs text-red-400">
          {w}
        </p>
      ))}
    </li>
  );
}

function BlockedList({ blocked }: { blocked: BlockedMoveView[] }) {
  if (blocked.length === 0) return null;
  return (
    <details className="mt-2 text-xs text-neutral-500">
      <summary className="cursor-pointer select-none">{blocked.length} move(s) not available — why</summary>
      <ul className="mt-1 space-y-0.5">
        {blocked.map((b) => (
          <li key={b.id} title={`source: ${b.source}`}>
            <span className="text-neutral-400">{b.label}</span> — {b.reason}
          </li>
        ))}
      </ul>
    </details>
  );
}

/** Legal next moves grouped by family, with live material cost, unverified badges and red warnings. */
export function MovesTable({ moves, blocked, locked, ex }: { moves: PricedMoveView[]; blocked: BlockedMoveView[]; locked: string | null; ex: number | null }) {
  if (locked) {
    return <p className="rounded-lg border border-red-900/60 bg-red-950/20 px-3 py-2 text-sm text-red-300">No moves: {locked}</p>;
  }
  const groups = MOVE_FAMILY_ORDER.map((f) => ({ f, list: moves.filter((m) => m.family === f) })).filter((g) => g.list.length > 0);
  return (
    <section className="rounded-lg border border-neutral-800 bg-neutral-950/60 p-3">
      <h3 className="text-sm font-semibold text-neutral-200" title="legal by the verified rules — no odds: PoE2 mod weights are not public">
        Next moves
      </h3>
      {groups.length === 0 && <p className="mt-1 text-sm text-neutral-500">No legal move for this item state.</p>}
      {groups.map(({ f, list }) => (
        <div key={f} className="mt-2">
          <h4 className="text-[10px] uppercase tracking-wider text-neutral-500">{FAMILY_LABEL[f]}</h4>
          <ul className="divide-y divide-neutral-800/60">
            {list.map((m) => <MoveRow key={m.id} m={m} ex={ex} />)}
          </ul>
        </div>
      ))}
      <BlockedList blocked={blocked} />
    </section>
  );
}
