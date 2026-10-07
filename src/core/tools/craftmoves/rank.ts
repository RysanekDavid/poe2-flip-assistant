import type { FamilyGateView, ItemStateView, PricedMoveView, RankedMoveView } from "../../../lib/tools/craftMovesContract";

/*
 * "Next best move": the top three legal moves as deterministic cards — NO probabilities (PoE2 mod
 * weights are not public), only an order a crafter would agree with:
 *   tier 1 — fills an open slot on the side you are aiming at (Sinistral/Dextral Exaltation, a
 *            Lesser/regular/Greater essence taking a magic item to rare);
 *   tier 2 — adds one random mod (Exalt, Regal, Augmentation, Transmutation, Alchemy, Greater
 *            Exaltation);
 *   tier 3 — frees a slot (Annulment, Erasure-steered or plain Chaos, Perfect Essence, Alloy).
 * A move with a red warning (Whittling, Putrefaction, Fracture…) or one not backed by the verified
 * KB never makes the cards — it stays in the full legal list. Within a tier the cheapest priced move
 * leads (unpriced last), and Greater/Perfect variants collapse onto their cheapest sibling so three
 * cards are three different decisions.
 */

type Tier = 1 | 2 | 3;
type Side = "prefix" | "suffix";

/** Side-steered adds: tier 1 when they aim at the target's side (or nothing is targeted). */
const SIDE_ADDS: Record<string, Side | "any"> = {
  "omen-sinistral-exaltation": "prefix",
  "omen-dextral-exaltation": "suffix",
  "omen-sinistral-greater-exaltation": "prefix",
  "omen-dextral-greater-exaltation": "suffix",
  essence: "any",
  "essence-greater": "any",
};

/** exalt-greater / chaos-perfect → exalt / chaos: currency tiers are one decision (and one card).
 *  Lesser/regular and Greater essences both upgrade a magic item, so they collapse too; a Perfect
 *  Essence replaces a mod on a rare instead (currency-core §4), so it keeps its own id. */
const variantKey = (id: string): string =>
  id.replace(/^(exalt|regal|aug|transmute|chaos)-(greater|perfect)$/, "$1").replace(/^essence-greater$/, "essence");

// matched against variantKey(id), so every currency tier classifies exactly like its base orb
const RANDOM_ADD = /^(exalt|regal|aug|transmute|alchemy|omen-greater-exaltation)$/;
const REMOVAL = /^(annul|chaos|essence-perfect|alloy|omen-(sinistral|dextral)-(erasure|annulment|crystallisation))$/;

/** Card tier of one move (null: never a card), given the family being aimed at. */
export function tierOf(move: PricedMoveView, target: FamilyGateView | null): Tier | null {
  const side = SIDE_ADDS[move.id];
  if (side === "any" || (side != null && (target == null || target.side === side))) return 1;
  const key = variantKey(move.id);
  if (side != null || RANDOM_ADD.test(key)) return 2;
  if (REMOVAL.test(key)) return 3;
  return null;
}

function openOn(state: ItemStateView, side: Side): boolean {
  const open = side === "prefix" ? state.openPrefixes : state.openSuffixes;
  return open != null && open > 0;
}

/**
 * The family worth aiming at: not on the item, reachable at this item level, on a side with a
 * provably open slot. KB-cross-checked families first (the verified gate examples are the chase
 * mods), then the deeper tier ladders, then name for a stable order.
 */
export function targetFamily(gates: readonly FamilyGateView[], state: ItemStateView, side?: Side): FamilyGateView | null {
  const candidates = gates.filter((g) => !g.present && g.topReachable != null && openOn(state, g.side) && (side == null || g.side === side));
  const sorted = [...candidates].sort(
    (a, b) => Number(b.kbRow != null) - Number(a.kbRow != null) || b.tiers - a.tiers || b.reachable - a.reachable || a.family.localeCompare(b.family),
  );
  return sorted[0] ?? null;
}

/** "+(41-45)% to Fire Resistance" → "Fire Resistance"-ish label for one line of prose. */
export function familyLabel(g: FamilyGateView): string {
  return (g.topReachable ?? g.best).text.split("\n").join(" / ");
}

function whyOf(move: PricedMoveView, tier: Tier, aim: FamilyGateView | null): string {
  if (tier === 3) return `frees a slot: ${move.effect}`;
  const side = SIDE_ADDS[move.id];
  if (side === "any") return `writes the essence's mod into an open slot${aim ? ` — aim: ${familyLabel(aim)}` : ""}`;
  if (side != null) return `adds a ${side} into your open ${side} slot${aim ? ` — aim: ${familyLabel(aim)}` : ""}`;
  return `adds one random mod to an open slot${aim ? ` — could roll ${familyLabel(aim)}` : ""}`;
}


const byCost = (a: PricedMoveView, b: PricedMoveView): number =>
  (a.totalDiv ?? Number.POSITIVE_INFINITY) - (b.totalDiv ?? Number.POSITIVE_INFINITY) || a.id.localeCompare(b.id);

/** Top three moves for the cards, best first. Empty when nothing qualifies (e.g. a corrupted item). */
export function rankMoves(moves: readonly PricedMoveView[], state: ItemStateView, gates: readonly FamilyGateView[], limit = 3): RankedMoveView[] {
  const target = targetFamily(gates, state);
  const eligible = moves
    .filter((m) => m.verified && m.warnings.length === 0)
    .flatMap((m) => {
      const tier = tierOf(m, target);
      return tier == null ? [] : [{ m, tier }];
    })
    .sort((a, b) => a.tier - b.tier || byCost(a.m, b.m));
  const seen = new Set<string>();
  const out: RankedMoveView[] = [];
  for (const { m, tier } of eligible) {
    const key = variantKey(m.id);
    if (seen.has(key)) continue;
    seen.add(key);
    const side = SIDE_ADDS[m.id];
    const aim = tier === 3 ? null : side === "prefix" || side === "suffix" ? targetFamily(gates, state, side) : target;
    out.push({ move: m, tier, targetFamily: aim, why: whyOf(m, tier, aim) });
    if (out.length === limit) break;
  }
  return out;
}
