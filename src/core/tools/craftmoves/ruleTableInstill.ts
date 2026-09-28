import type { ItemState } from "./classify";
import { KB, KB_CURRENCY_CORE, type MoveRule, type UnlistedMaterial, type Verdict } from "./ruleTypes";
import { all, isMagic, isNormal, isRare, needMods } from "./rulePredicates";

/** Things written INTO an item: essences (crafted slot), catalysts (quality), liquid emotions (KB §6–§8). */

const S6 = `${KB} §6`;
const S7 = `${KB} §7`;
const S8 = `${KB} §8`;

const ANY_ESSENCE: UnlistedMaterial = { key: "essence-of-choice", label: "Essence of your choice" };
const ANY_CATALYST: UnlistedMaterial = { key: "catalyst-of-choice", label: "Catalyst (pick by tag)" };

const ONE_CRAFTED = `already has a crafted mod — max ONE crafted mod per item in 0.5.x (${S7})`;

const ESSENCE_NOTES = [
  "pick the essence whose guaranteed mod you want — read its actual mod first (Essence of Insulation = FIRE resistance)",
];

const ESSENCES: MoveRule[] = [
  {
    id: "essence-normal",
    label: "Essence",
    family: "essence",
    materials: [ANY_ESSENCE],
    requires: "normal item",
    effect: "normal → magic with the essence's guaranteed mod (the item's one crafted mod)",
    notes: ESSENCE_NOTES,
    source: `${KB_CURRENCY_CORE} §4; ${S7}`,
    verified: false,
    check: (s) => (isNormal(s) ? { pass: true } : null),
  },
  {
    id: "essence-greater",
    label: "Greater Essence",
    family: "essence",
    materials: [ANY_ESSENCE],
    requires: "magic item",
    effect: "magic → rare, keeping the essence's guaranteed mod",
    notes: ESSENCE_NOTES,
    source: `${KB_CURRENCY_CORE} §4; ${S7}`,
    verified: false,
    check: (s) => (isMagic(s) ? (s.slots.crafted > 0 ? { block: ONE_CRAFTED } : { pass: true }) : null),
  },
  {
    id: "essence-perfect",
    label: "Perfect Essence",
    family: "essence",
    materials: [ANY_ESSENCE],
    requires: "rare item with at least one mod",
    effect: "removes a random mod, then writes the essence's guaranteed mod into the single crafted slot",
    notes: [...ESSENCE_NOTES, "Greater-then-Perfect essence stacking is dead in 0.5.x"],
    source: S7,
    verified: true,
    check: perfectEssenceCheck,
  },
];

/** KB §7: Perfect essences remove-then-replace, so an existing crafted mod is replaced, not a blocker. */
function perfectEssenceCheck(s: ItemState): Verdict {
  if (!isRare(s)) return null;
  const notes = s.slots.crafted > 0 ? [`replaces the existing crafted mod — one crafted slot per item (${S7})`] : [];
  const unverifiedBecause = s.jewel ? "the KB does not say which essences, if any, apply to jewels" : undefined;
  return all([needMods(s, 1)], { pass: true, notes, unverifiedBecause });
}

const CATALYST_TAGS =
  "Xoph's=Fire, Tul's=Cold, Esh's=Lightning, Uul-Netol's=Phys, Chayula's=Chaos, Flesh=Life, Neural=Mana, Carapace=Defences, " +
  "Reaver=Attack, Sibilant=Caster, Skittering=Speed, Adaptive=Attributes, Necrotic=Minion";

function catalystCheck(s: ItemState): Verdict {
  if (s.itemClass !== "Rings" && s.itemClass !== "Amulets") return null;
  const breach = /\bBreach Ring\b/.test(s.baseType ?? "");
  const cap = breach ? 40 : 20;
  if ((s.quality ?? 0) >= cap) return { block: `quality already at the ${cap}% cap` };
  return { pass: true, notes: breach ? ["Breach Rings cap at 40% quality"] : [] };
}

const CATALYSTS: MoveRule[] = [
  {
    id: "catalyst",
    label: "Catalyst",
    family: "catalyst",
    materials: [ANY_CATALYST],
    requires: "ring or amulet below the quality cap (20%, Breach Rings 40%)",
    effect: "adds quality that buffs the MAGNITUDE of matching-tag mods (e.g. +60 life at 20% Flesh ≈ +72) — never roll weights",
    warnings: ["switching catalyst type wipes the existing quality"],
    notes: [CATALYST_TAGS, "roll-weight bias exists only through Omen of Catalysing Exaltation"],
    source: S8,
    verified: true,
    check: catalystCheck,
  },
];

/*
 * Liquid-emotion facts below come from the 2026-09-29 research round (poe2db item text = game text,
 * cross-checked against PoB #2300, Game8, Maxroll, Sidekick/EE2 fixtures; the granted mods are
 * RePoE CraftedJewel* entries). KB §6 still states the refuted "fixed damage prefix" Potent Contempt
 * and is being corrected on a parallel branch, so these rules ship unverified until it lands.
 */
const LIQUID_RESEARCH = `research 2026-09-29 (poe2db, PoB #2300, Game8, Maxroll); ${S6} correction pending`;

const CONTEMPT_EFFECT =
  "removes a random mod and adds a crafted '+1 Suffix Modifier allowed' (sits in a PREFIX slot) or " +
  "'+1 Prefix Modifier allowed' (sits in a SUFFIX slot) — the side is not controllable";

/** Potent tiers: rare BASIC jewels. Ancient tiers: rare Time-Lost jewels only. Both write the crafted slot. */
function liquidCheck(tier: "potent" | "ancient") {
  return (s: ItemState): Verdict => {
    if (!s.jewel || !isRare(s)) return null;
    if (tier === "potent" && s.timeLost) return { block: "Potent liquids work on rare BASIC jewels, not Time-Lost ones" };
    if (tier === "ancient" && !s.timeLost) return { block: "Ancient liquids work ONLY on rare Time-Lost jewels" };
    if (s.slots.crafted > 0) return { block: ONE_CRAFTED };
    return { pass: true };
  };
}

function liquid(id: string, label: string, material: MoveRule["materials"][number], tier: "potent" | "ancient", effect: string, notes: string[] = []): MoveRule {
  return {
    id,
    label,
    family: "liquid",
    materials: [material],
    requires: `rare ${tier === "potent" ? "BASIC" : "Time-Lost"} jewel, no crafted mod yet`,
    effect,
    notes: [`the granted mod is crafted, and an item holds one crafted mod (${S7})`, ...notes],
    source: LIQUID_RESEARCH,
    verified: false,
    check: liquidCheck(tier),
  };
}

const FEROCITY_REMOVAL = "whether Ferocity also removes a mod is not in the research round";

const LIQUIDS: MoveRule[] = [
  liquid("liquid-potent-contempt", "Potent Liquid Contempt", "potentLiquidContempt", "potent", CONTEMPT_EFFECT),
  liquid("liquid-ancient-contempt", "Ancient Potent Liquid Contempt", "ancientPotentLiquidContempt", "ancient", CONTEMPT_EFFECT, [
    "with the extra slot a Time-Lost jewel reaches 5 mods",
  ]),
  liquid("liquid-potent-ferocity", "Potent Liquid Ferocity", "potentLiquidFerocity", "potent",
    "adds a crafted '(40–60)% increased Effect of Suffixes' or '… of Prefixes'", [FEROCITY_REMOVAL]),
  liquid("liquid-ancient-ferocity", "Ancient Potent Liquid Ferocity", "ancientPotentLiquidFerocity", "ancient",
    "adds a crafted mod: notables in radius grant +(5–7)% Fire, Cold or Lightning resistance", [
      FEROCITY_REMOVAL,
      "Diamond (chaos resistance) values conflict between sources: 4–5% vs 5–7%",
    ]),
];

export const INSTILL_RULES: readonly MoveRule[] = [...ESSENCES, ...CATALYSTS, ...LIQUIDS];
