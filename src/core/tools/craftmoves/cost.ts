import type { CraftMove, MoveMaterial } from "./ruleTypes";

/**
 * Price a move's materials from the latest ninja snapshots. An unlisted or unpriced material is
 * NULL, never 0 — a free-looking step is the most expensive lie a craft tool can tell — and one
 * null material makes the whole move's total null.
 */

export interface SnapshotPrice {
  priceDiv: number;
  icon: string | null;
  ageMin: number;
}

export interface PricedMaterial extends MoveMaterial {
  unitDiv: number | null;
  totalDiv: number | null;
  icon: string | null;
  ageMin: number | null;
}

export interface PricedMove extends Omit<CraftMove, "materials"> {
  materials: PricedMaterial[];
  totalDiv: number | null;
  totalEx: number | null;
}

const usable = (div: number | undefined): div is number => div != null && Number.isFinite(div) && div > 0;

function priceMaterial(m: MoveMaterial, prices: ReadonlyMap<string, SnapshotPrice>): PricedMaterial {
  const p = m.ninjaId ? prices.get(m.ninjaId) : undefined;
  const unit = usable(p?.priceDiv) ? p!.priceDiv : null;
  return { ...m, unitDiv: unit, totalDiv: unit == null ? null : unit * m.qty, icon: p?.icon ?? null, ageMin: p?.ageMin ?? null };
}

/** `exaltPerDivine` null = rates unavailable: Exalt figures stay null, Divine figures are unaffected. */
export function priceMoves(
  moves: readonly CraftMove[],
  prices: ReadonlyMap<string, SnapshotPrice>,
  rates: { exaltPerDivine: number } | null,
): PricedMove[] {
  return moves.map((move) => {
    const materials = move.materials.map((m) => priceMaterial(m, prices));
    const complete = materials.length > 0 && materials.every((m) => m.totalDiv != null);
    const totalDiv = complete ? materials.reduce((sum, m) => sum + m.totalDiv!, 0) : null;
    const exPer = rates && rates.exaltPerDivine > 0 ? rates.exaltPerDivine : null;
    return { ...move, materials, totalDiv, totalEx: totalDiv != null && exPer != null ? totalDiv * exPer : null };
  });
}

/** Every ninja id a move list needs priced (one DB query). */
export function ninjaIdsOf(moves: readonly CraftMove[]): string[] {
  return [...new Set(moves.flatMap((m) => m.materials.map((x) => x.ninjaId).filter((id): id is string => id != null)))];
}
