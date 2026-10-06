import type { AffixSide } from "../craftmoves/catalog";
import { estimate, estimateWithin, familyGroups } from "./odds";
import { acceptedMods, presentModGroups } from "./state";
import type { Estimate, PlanCtx, PlanState, ResolvedTarget } from "./types";

/**
 * Reveal odds at the Well of Souls. A desecrated mod is revealed by choosing one of three options
 * (patch notes 0.3.0); the options may include the base's ordinary mods (poe2db: "Reveal desecrated
 * modifiers may include base modifiers"; creators reveal attack flats on rings on screen) as well as
 * the faction-exclusive ones. The model:
 *   pool   = every family of the side the Well can draw: ordinary families plus the desecrated
 *            (faction) ones, minus mod groups already on the item, each with a tier the item level
 *            reaches (Ancient bones: modifier level 40+ only);
 *   draws  = the options; at item level 65+ AT LEAST one of them is faction-exclusive (poe2wiki
 *            Desecrated modifier; KB desecration-abyss), so the other two still draw from the whole
 *            pool, faction families included, and a wanted faction mod has two routes: the faction
 *            draw (share pf of the faction families) and the open draws (share p of the pool) — not
 *            a double count;
 *   p      = the wanted mod's share of the pool: equal weight per family, equal per reachable tier.
 * P(offered) = 1 − (1 − p)^draws × (1 − pf)^faction draws, the band runs from two open draws at half
 * the shares to three at twice them, each with the faction draw.
 * With Omen of the Liege (Amanamu targets) all options come from the faction (as before).
 */

export type BoneKind = "preserved" | "ancient";

/** Ancient bones reveal modifier level 40+ (poe2db Ancient bones: "Minimum Modifier Level: 40"). */
export const ANCIENT_MIN_LEVEL = 40;
/** At this item level and above, one reveal option is always faction-exclusive (single source). */
export const FACTION_OPTION_ILVL = 65;

export interface RevealOdds {
  /** P(the wanted mod is among the first three options), point. */
  first: number;
  /** One reveal (no Echoes). */
  once: Estimate;
  /** One reveal plus one Omen of Abyssal Echoes reroll when the first options miss. */
  withEchoes: Estimate;
}

interface PoolFamily {
  family: string;
  levels: number[];
  faction: boolean;
}

function levelsOk(levels: readonly number[], ilvl: number, bone: BoneKind): number[] {
  return levels.filter((l) => l <= ilvl && (bone === "preserved" || l >= ANCIENT_MIN_LEVEL)).sort((a, b) => a - b);
}

/** Every family of the side the Well can offer on this item. */
function wellPool(ctx: PlanCtx, state: PlanState, side: AffixSide, bone: BoneKind): PoolFamily[] {
  const blocked = presentModGroups(ctx, state);
  const out: PoolFamily[] = [];
  for (const [family, tiers] of Object.entries(ctx.combo[side])) {
    if (familyGroups(ctx, side, family).some((g) => blocked.has(g))) continue;
    const levels = levelsOk(Object.values(tiers), ctx.base.ilvl, bone);
    if (levels.length > 0) out.push({ family, levels, faction: false });
  }
  for (const [family, tiers] of Object.entries(ctx.combo.desecrated)) {
    const mod = ctx.cat.mods[Object.keys(tiers)[0]!];
    if (!mod || mod.side !== side || mod.groups.some((g) => blocked.has(g))) continue;
    const levels = levelsOk(Object.values(tiers), ctx.base.ilvl, bone);
    if (levels.length > 0) out.push({ family, levels, faction: true });
  }
  return out;
}

/** Share of `pool` that is a wanted mod at or above its minimum tier. */
function shareOf(pool: readonly PoolFamily[], wanted: readonly ResolvedTarget[]): number {
  if (pool.length === 0) return 0;
  let p = 0;
  for (const m of wanted) {
    const f = pool.find((x) => x.family === m.family);
    if (f) p += f.levels.filter((l) => l >= m.level).length / f.levels.length / pool.length;
  }
  return Math.min(1, p);
}

const miss = (p: number, n: number): number => (1 - Math.min(1, p)) ** n;
const withEcho = (q: number): number => 1 - (1 - q) ** 2;

function liegeOdds(ctx: PlanCtx, state: PlanState, t: ResolvedTarget): RevealOdds {
  const blocked = presentModGroups(ctx, state);
  const pool = Object.entries(ctx.combo.desecrated).filter(([, tiers]) => {
    const mod = ctx.cat.mods[Object.keys(tiers)[0]!];
    return mod != null && mod.side === t.side && !mod.groups.some((g) => blocked.has(g)) && t.faction != null && mod.tags.includes(`${t.faction}_mod`);
  }).length;
  const options = ctx.reveal.options;
  const first = Math.min(1, options / Math.max(pool, 1));
  const both = withEcho(first);
  const scope = `${t.faction} ${t.side}es`;
  const why = `assumes the Well offers ${options} different mods, each equally likely (the game doesn't say)`;
  const inputs = { "mods the Well can offer": pool, faction: t.faction ?? "none", options };
  return {
    first,
    once: estimate(first, `P(offered) = min(1, ${options}/${pool} ${scope}) = ${first.toFixed(2)} — ${why}`, inputs),
    withEchoes: estimate(both, `P(offered) = min(1, ${options}/${pool} ${scope}) = ${first.toFixed(2)}; with one Echoes reroll 1 − (1 − p)² = ${both.toFixed(2)} — ${why}`, inputs),
  };
}

/** Reveal odds for one wanted mod (or pool slot) on its side; Liege only for Amanamu desecrated targets. Null = never offered. */
export function revealOdds(ctx: PlanCtx, state: PlanState, t: ResolvedTarget, opts: { liege: boolean; bone: BoneKind }): RevealOdds | null {
  if (opts.liege) return liegeOdds(ctx, state, t);
  const pool = wellPool(ctx, state, t.side, opts.bone);
  const wanted = acceptedMods(ctx, state, t);
  const p = shareOf(pool, wanted);
  const factionPool = pool.filter((f) => f.faction);
  const pf = wanted.some((m) => m.source === "desecrated") ? shareOf(factionPool, wanted) : 0;
  const options = ctx.reveal.options;
  const factionSlot = ctx.base.ilvl >= FACTION_OPTION_ILVL ? 1 : 0;
  const hit = (pp: number, pfp: number, draws: number, faction: number) => 1 - miss(pp, draws) * miss(pfp, faction);
  const point = hit(p, pf, options - factionSlot, factionSlot);
  if (point <= 0) return null;
  const low = hit(p / 2, pf / 2, options - 1, 1);
  const high = hit(Math.min(1, 2 * p), Math.min(1, 2 * pf), options, 1);
  const lo = Math.min(low, point);
  const hi = Math.max(high, point);
  const inputs = { "families the Well can offer": pool.length, "wanted share of them": Number(p.toFixed(4)), options, "item level": ctx.base.ilvl, ...(opts.bone === "ancient" ? { "Ancient bone: modifier level ≥": ANCIENT_MIN_LEVEL } : {}) };
  const draws = factionSlot ? `${options - 1} open draws (at item level ${FACTION_OPTION_ILVL}+ at least one option is a faction mod)` : `${options} draws`;
  const facTerm = factionSlot && pf > 0 ? ` × (1 − pf) with pf = ${pf.toFixed(4)}, its share of the ${factionPool.length} faction families (the faction option)` : "";
  const band = `band from ${options - 1} open draws at ½ the share${pf > 0 ? "s" : ""} to ${options} at 2×${pf > 0 ? ", each with the faction option" : ""}`;
  // the faction option makes faction families likelier than ordinary ones: "equal" only holds within a draw's own families
  const assume = "assumes equal weight per family and per reachable tier among the families a draw comes from (the game doesn't say)";
  const formula = `P(offered) = 1 − (1 − p)^${options - factionSlot}${facTerm}; p = ${p.toFixed(4)}: the wanted mods' share of ${pool.length} ${t.side} families the Well can offer (${ctx.reveal.optionsBasis}), ${draws}; ${band} — ${assume}`;
  return {
    first: point,
    once: estimateWithin(point, lo, hi, formula, inputs),
    withEchoes: estimateWithin(withEcho(point), withEcho(lo), withEcho(hi), `${formula}; one Omen of Abyssal Echoes reroll: 1 − (1 − P)²`, inputs),
  };
}
