import { MATS, type MaterialKey } from "../../craftMaterials";
import type { ItemState } from "./classify";

/** Shared vocabulary of the rules engine and its rule tables (kept apart to avoid an import cycle). */

export const MOVE_FAMILIES = ["currency", "omen", "bone", "essence", "catalyst", "liquid"] as const;
export type MoveFamily = (typeof MOVE_FAMILIES)[number];

/** The verified KB every `verified: true` rule cites. */
export const KB = "poe2-crafting-knowledge.md";
/** Secondary corpus: cited for provenance, never enough for `verified: true`. */
export const KB_CURRENCY_CORE = "docs/kb/currency-core.md";

export interface MoveMaterial {
  key: string;
  label: string;
  /** poe.ninja item id, or null when ninja does not list it (never priced). */
  ninjaId: string | null;
  qty: number;
}

export interface CraftMove {
  id: string;
  label: string;
  family: MoveFamily;
  materials: MoveMaterial[];
  requires: string;
  effect: string;
  /** Red warnings: wallet-killers and irreversible outcomes. */
  warnings: string[];
  /** Grey context: soft-floor wording, which facts are unverified, what to pick. */
  notes: string[];
  /** Minimum modifier level this move rolls (a SOFT floor, KB §1); null = no floor. */
  floor: number | null;
  source: string;
  verified: boolean;
}

export interface BlockedMove {
  id: string;
  label: string;
  family: MoveFamily;
  reason: string;
  source: string;
  verified: boolean;
}

/** A material not in MATS because poe.ninja does not list it — shown, never priced. */
export interface UnlistedMaterial {
  key: string;
  label: string;
}

export type MaterialSpec = MaterialKey | UnlistedMaterial | ((s: ItemState) => MoveMaterial);

export type Verdict =
  | null // rule does not apply to this kind of item — hidden
  | { block: string; unverifiedBecause?: string } // unverifiedBecause: the refusal itself is inferred
  | { pass: true; warnings?: string[]; notes?: string[]; unverifiedBecause?: string; label?: string };

export interface MoveRule {
  id: string;
  label: string;
  family: MoveFamily;
  materials: MaterialSpec[];
  requires: string;
  effect: string;
  warnings?: string[];
  notes?: string[];
  floor?: number;
  source: string;
  verified: boolean;
  check: (s: ItemState) => Verdict;
}

export function mat(key: MaterialKey, qty = 1): MoveMaterial {
  const m = MATS[key];
  return { key, label: m.label, ninjaId: m.id, qty };
}
