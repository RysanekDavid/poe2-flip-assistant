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
    requires: "rare, no crafted mod yet",
    effect: "removes a random mod, then writes the essence's guaranteed mod into the single crafted slot",
    notes: [...ESSENCE_NOTES, "Greater-then-Perfect essence stacking is dead in 0.5.x"],
    source: S7,
    verified: true,
    check: (s) => (isRare(s) ? (s.slots.crafted > 0 ? { block: ONE_CRAFTED } : all([needMods(s, 1)])) : null),
  },
];

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

const JEWEL_COLOUR: Record<string, string> = { Sapphire: "(7–13)% chaos damage", Ruby: "(5–15)% global physical damage", Emerald: "(5–15)% elemental damage" };

function potentContemptCheck(s: ItemState): Verdict {
  if (!s.jewel || !isRare(s)) return null;
  if (s.timeLost) return { block: `non-Ancient liquids don't work on Time-Lost jewels (${S6})` };
  if (s.slots.crafted > 0) return { block: ONE_CRAFTED };
  const colour = Object.keys(JEWEL_COLOUR).find((c) => (s.baseType ?? "").includes(c));
  if (!colour) return { pass: true, unverifiedBecause: `the KB names the prefix only for Sapphire/Ruby/Emerald, not ${s.baseType ?? "this jewel"}` };
  return { pass: true, notes: [`${colour} → crafted prefix ${JEWEL_COLOUR[colour]}`] };
}

function ancientLiquidCheck(s: ItemState): Verdict {
  if (!s.jewel || !isRare(s)) return null;
  if (!s.timeLost) return { block: `Ancient liquids work ONLY on rare Time-Lost jewels (${S6})` };
  return { pass: true };
}

const LIQUIDS: MoveRule[] = [
  {
    id: "liquid-potent-contempt",
    label: "Potent Liquid Contempt",
    family: "liquid",
    materials: ["potentLiquidContempt"],
    requires: "rare BASIC (not Time-Lost) jewel, no crafted mod yet",
    effect: "removes a random mod and grants a FIXED damage crafted prefix keyed to the jewel colour",
    warnings: ["does NOT grant '+1 Modifier allowed' — that is the Ancient tier on Time-Lost jewels only"],
    notes: [`the granted prefix is crafted, and an item holds one crafted mod (${S7})`],
    source: `${S6}; ${S7}`,
    verified: true,
    check: potentContemptCheck,
  },
  {
    id: "liquid-ancient-contempt",
    label: "Ancient Potent Liquid Contempt",
    family: "liquid",
    materials: ["ancientPotentLiquidContempt"],
    requires: "rare Time-Lost jewel",
    effect: "removes a random mod and grants '+1 Prefix Modifier allowed' OR '+1 Suffix Modifier allowed' (side not controllable)",
    notes: ["KB §6 is medium confidence; the only 5-mod jewel path"],
    source: S6,
    verified: false,
    check: ancientLiquidCheck,
  },
  {
    id: "liquid-ancient-ferocity",
    label: "Ancient Potent Liquid Ferocity",
    family: "liquid",
    materials: ["ancientPotentLiquidFerocity"],
    requires: "rare Time-Lost jewel",
    effect: "removes a random mod and grants (40–60)% increased Effect of Suffixes OR of Prefixes",
    notes: ["KB §6 is medium confidence"],
    source: S6,
    verified: false,
    check: ancientLiquidCheck,
  },
];

export const INSTILL_RULES: readonly MoveRule[] = [...ESSENCES, ...CATALYSTS, ...LIQUIDS];
