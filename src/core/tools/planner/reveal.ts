import type { AffixSide } from "../craftmoves/catalog";
import { estimate, estimateWithin, familyGroups } from "./odds";
import { acceptedMods, presentModGroups } from "./state";
import type { Estimate, PlanCtx, PlanState, ResolvedTarget } from "./types";

/**
 * Reveal odds at the Well of Souls. A desecrated mod is revealed by choosing one of three options
 * (patch notes 0.3.0); the options may include the base's ordinary mods (poe2db: "Reveal desecrated
 * modifiers may include base modifiers"; creators reveal attack flats on rings on screen) as well as
 * the desecrated-only ones (faction mods on jewellery, the jewel-exclusive mods on jewels). The model:
 *   pool   = every family of the side the Well can draw: ordinary families plus the desecrated-only
 *            ones, minus mod groups already on the item, each with a tier the item level reaches
 *            (Ancient bones: modifier level 40+ only);
 *   draws  = the options; on jewellery at item level 65+ AT LEAST one of them is faction-exclusive
 *            (poe2wiki Desecrated modifier; KB desecration-abyss), so the other two still draw from
 *            the whole pool, faction families included, and a wanted faction mod has two routes: the
 *            faction draw (share pf of the faction families) and the open draws (share p of the pool)
 *            — not a double count;
 *            jewels have no faction mods, and whether one option is always a jewel-exclusive mod is
 *            unconfirmed (the poe2wiki claim is framed at item level 65, the faction mods' level; one
 *            creator's measured ~8 attempts fits three open draws), so all three are open draws there;
 *   p      = the wanted mod's share of the pool: equal weight per family, equal per reachable tier.
 * P(offered) = 1 − (1 − p)^draws × (1 − pf)^faction draws. Jewellery band: two open draws at half the
 * shares to three at twice them, each with the faction draw. Jewel band: two open draws at half the
 * share (an ordinary mod if one option were reserved) to three at twice it, or — for a jewel-exclusive
 * target — two at twice it plus the reserved exclusive option, whichever is higher.
 * With a faction omen (Liege → Amanamu, Sovereign → Ulaman, Blackblooded → Kurgal) all options come
 * from that Lich's families (community reading of the singular item text, KB §5).
 */

export type BoneKind = "preserved" | "ancient";

/** Ancient bones reveal modifier level 40+ (poe2db Ancient bones: "Minimum Modifier Level: 40"). */
export const ANCIENT_MIN_LEVEL = 40;
/** At this item level and above, one reveal option on jewellery is always faction-exclusive (single source); not on jewels. */
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
  /** Desecrated-only: a faction mod on jewellery, a jewel-exclusive mod on a jewel. */
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

function factionOdds(ctx: PlanCtx, state: PlanState, t: ResolvedTarget): RevealOdds {
  const blocked = presentModGroups(ctx, state);
  // any tier decides the Lich: one belt family (flask charges) holds both an Ulaman and a Kurgal mod
  const pool = Object.entries(ctx.combo.desecrated).filter(([, tiers]) => {
    const mods = Object.keys(tiers).map((id) => ctx.cat.mods[id]).filter((m) => m != null);
    const mod = mods[0];
    return mod != null && mod.side === t.side && !mod.groups.some((g) => blocked.has(g)) && t.faction != null && mods.some((m) => m.tags.includes(`${t.faction}_mod`));
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

/** What a jewel reveal assumes (unconfirmed), and how the owner can settle it. */
export const JEWEL_REVEAL_ASSUMPTION = "assumes all three options are open draws from the jewel pool — whether one is always a jewel-exclusive mod is unconfirmed";
export const JEWEL_REVEAL_TEST =
  "To settle it: 10 reveal screens on a cheap regular jewel with Dextral Necromancy + Preserved Cranium; if every screen has a (1–2)% Str/Dex/Int option, one is guaranteed.";

const hit = (p: number, pf: number, draws: number, faction: number): number => 1 - miss(p, draws) * miss(pf, faction);
const twice = (p: number): number => Math.min(1, 2 * p);

interface Shares {
  p: number;
  /** The wanted mods' share of the desecrated-only families (0 for an ordinary target). */
  pf: number;
  options: number;
}

/** Jewellery: the faction option at item level 65+ (single source). */
function jewelleryBand(s: Shares, factionSlot: number): { point: number; low: number; high: number } {
  const pf = factionSlot ? s.pf : 0;
  return {
    point: hit(s.p, pf, s.options - factionSlot, factionSlot),
    low: hit(s.p / 2, s.pf / 2, s.options - 1, 1),
    high: hit(twice(s.p), twice(s.pf), s.options, 1),
  };
}

/** Jewels: three open draws; the band spans the unconfirmed reserved jewel-exclusive option both ways. */
function jewelBand(s: Shares): { point: number; low: number; high: number } {
  return {
    point: hit(s.p, 0, s.options, 0),
    low: hit(s.p / 2, 0, s.options - 1, 0),
    high: Math.max(hit(twice(s.p), 0, s.options, 0), s.pf > 0 ? hit(twice(s.p), twice(s.pf), s.options - 1, 1) : 0),
  };
}

interface Prose {
  head: string;
  draws: string;
  /** What only this item kind assumes, after the shared equal-weight assumption. */
  extra: string;
}

function jewelleryProse(s: Shares, factionSlot: number, factionFamilies: number): Prose {
  const draws = factionSlot ? `${s.options - 1} open draws (at item level ${FACTION_OPTION_ILVL}+ at least one option is a faction mod)` : `${s.options} draws`;
  const facTerm = factionSlot && s.pf > 0 ? ` × (1 − pf) with pf = ${s.pf.toFixed(4)}, its share of the ${factionFamilies} faction families (the faction option)` : "";
  const band = `band from ${s.options - 1} open draws at ½ the share${s.pf > 0 ? "s" : ""} to ${s.options} at 2×${s.pf > 0 ? ", each with the faction option" : ""}`;
  return { head: `P(offered) = 1 − (1 − p)^${s.options - factionSlot}${facTerm}`, draws: `${draws}; ${band}`, extra: "" };
}

function jewelProse(s: Shares, exclusiveFamilies: number): Prose {
  const alt = s.pf > 0 ? ` or ${s.options - 1} at 2× plus a reserved jewel-exclusive option (its share of the ${exclusiveFamilies} exclusive families ${s.pf.toFixed(4)})` : "";
  const band = `band from ${s.options - 1} open draws at ½ the share (one option reserved for an exclusive mod) to ${s.options} at 2×${alt}`;
  return { head: `P(offered) = 1 − (1 − p)^${s.options}`, draws: `${s.options} open draws from ordinary and jewel-exclusive families alike (jewels have no faction mods); ${band}`, extra: `; ${JEWEL_REVEAL_ASSUMPTION}` };
}

/** Reveal odds for one wanted mod (or pool slot) on its side; `factionOmen` only for a Lich desecrated target. Null = never offered. */
export function revealOdds(ctx: PlanCtx, state: PlanState, t: ResolvedTarget, opts: { factionOmen: boolean; bone: BoneKind }): RevealOdds | null {
  if (opts.factionOmen) return factionOdds(ctx, state, t);
  const pool = wellPool(ctx, state, t.side, opts.bone);
  const wanted = acceptedMods(ctx, state, t);
  const onlyPool = pool.filter((f) => f.faction);
  const s: Shares = { p: shareOf(pool, wanted), pf: wanted.some((m) => m.source === "desecrated") ? shareOf(onlyPool, wanted) : 0, options: ctx.reveal.options };
  const jewel = ctx.base.jewel;
  const factionSlot = ctx.base.ilvl >= FACTION_OPTION_ILVL && !jewel ? 1 : 0;
  const b = jewel ? jewelBand(s) : jewelleryBand(s, factionSlot);
  if (b.point <= 0) return null;
  const lo = Math.min(b.low, b.point);
  const hi = Math.max(b.high, b.point);
  const inputs = { "families the Well can offer": pool.length, "wanted share of them": Number(s.p.toFixed(4)), options: s.options, "item level": ctx.base.ilvl, ...(opts.bone === "ancient" ? { "Ancient bone: modifier level ≥": ANCIENT_MIN_LEVEL } : {}) };
  const prose = jewel ? jewelProse(s, onlyPool.length) : jewelleryProse(s, factionSlot, onlyPool.length);
  // the faction option makes faction families likelier than ordinary ones: "equal" only holds within a draw's own families
  const assume = "assumes equal weight per family and per reachable tier among the families a draw comes from (the game doesn't say)";
  const formula = `${prose.head}; p = ${s.p.toFixed(4)}: the wanted mods' share of ${pool.length} ${t.side} families the Well can offer (${ctx.reveal.optionsBasis}), ${prose.draws} — ${assume}${prose.extra}`;
  return {
    first: b.point,
    once: estimateWithin(b.point, lo, hi, formula, inputs),
    withEchoes: estimateWithin(withEcho(b.point), withEcho(lo), withEcho(hi), `${formula}; one Omen of Abyssal Echoes reroll: 1 − (1 − P)²`, inputs),
  };
}
