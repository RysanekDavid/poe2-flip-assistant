import { mat, type CraftMove, type BlockedMove, type MaterialSpec, type MoveMaterial, type MoveRule, type Verdict } from "./ruleTypes";
import type { ItemState } from "./classify";
import { CURRENCY_RULES } from "./ruleTableCurrency";
import { OMEN_RULES } from "./ruleTableOmens";
import { ABYSS_RULES } from "./ruleTableAbyss";
import { INSTILL_RULES } from "./ruleTableInstill";

/**
 * A small VERIFIED-rules engine — not a simulator. Every rule encodes one precondition set from
 * docs/research/poe2-crafting-knowledge.md (the 0.5.x KB) and carries that section as `source`.
 * Rules whose facts come from anywhere else ship `verified: false` and render an "unverified" badge.
 * No rule states a probability: modifier weights are not public.
 */

export * from "./ruleTypes";

function resolveMaterial(spec: MaterialSpec, s: ItemState): MoveMaterial {
  if (typeof spec === "function") return spec(s);
  if (typeof spec === "string") return mat(spec);
  return { key: spec.key, label: spec.label, ninjaId: null, qty: 1 };
}

/** Why no rule may run at all, or null when the item is craftable. */
export function lockReason(s: ItemState): string | null {
  if (s.corrupted) return "corrupted — currency and omens can no longer modify it";
  if (s.mirrored) return "mirrored — a mirrored copy cannot be modified";
  if (s.unidentified) return "unidentified — identify it first";
  if (!["Normal", "Magic", "Rare"].includes(s.rarity)) return `${s.rarity} items are out of scope — the KB covers normal/magic/rare crafting`;
  if (s.itemClass == null || s.baseType == null) return "base not recognised — paste the full Ctrl+C text of a gear item or jewel";
  if (s.flags.some((f) => f.code === "unknown-class" || f.code === "unknown-base")) return "item class / base not in the craft catalog";
  return null;
}

export const ALL_RULES: readonly MoveRule[] = [...CURRENCY_RULES, ...OMEN_RULES, ...ABYSS_RULES, ...INSTILL_RULES];

export interface RuleEvaluation {
  moves: CraftMove[];
  blocked: BlockedMove[];
  locked: string | null;
}

function toMove(rule: MoveRule, s: ItemState, v: Exclude<Verdict, null | { block: string }>): CraftMove {
  const notes = [...(rule.notes ?? []), ...(v.notes ?? [])];
  if (v.unverifiedBecause) notes.push(`unverified: ${v.unverifiedBecause}`);
  return {
    id: rule.id,
    label: v.label ?? rule.label,
    family: rule.family,
    materials: rule.materials.map((m) => resolveMaterial(m, s)),
    requires: rule.requires,
    effect: rule.effect,
    warnings: [...(rule.warnings ?? []), ...(v.warnings ?? [])],
    notes,
    floor: rule.floor ?? null,
    source: rule.source,
    verified: rule.verified && v.unverifiedBecause == null,
  };
}

/** Run every rule: legal moves, blocked moves with the reason, or one lock for the whole item. */
export function evaluateRules(s: ItemState, rules: readonly MoveRule[] = ALL_RULES): RuleEvaluation {
  const locked = lockReason(s);
  if (locked) return { moves: [], blocked: [], locked };
  const moves: CraftMove[] = [];
  const blocked: BlockedMove[] = [];
  for (const rule of rules) {
    const v = rule.check(s);
    if (v == null) continue;
    if ("block" in v) {
      const reason = v.unverifiedBecause ? `${v.block} — unverified: ${v.unverifiedBecause}` : v.block;
      blocked.push({ id: rule.id, label: rule.label, family: rule.family, reason, source: rule.source, verified: rule.verified && v.unverifiedBecause == null });
    } else moves.push(toMove(rule, s, v));
  }
  return { moves, blocked, locked: null };
}

/** The legal next moves for an item (empty when corrupted, mirrored, unidentified or unsupported). */
export function legalMoves(s: ItemState): CraftMove[] {
  return evaluateRules(s).moves;
}
