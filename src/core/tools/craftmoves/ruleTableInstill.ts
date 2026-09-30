import type { MaterialKey } from "../../craftMaterials";
import type { ItemState } from "./classify";
import { KB, KB_CURRENCY_CORE, type MoveRule, type UnlistedMaterial, type Verdict } from "./ruleTypes";
import { all, isMagic, isRare, needMods } from "./rulePredicates";

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

/*
 * Targets per KB §7 and currency-core §4 (entity-catalog item text, 0.5.5b; changed in 0.3.0):
 * Lesser, regular and Greater essences upgrade a MAGIC item to rare; Perfect, corrupted and
 * Abyss/Breach essences replace a mod on a RARE. No essence touches a normal item.
 */
const CC4 = `${KB_CURRENCY_CORE} §4`;
const JEWEL_ESSENCE = "the KB does not say which essences, if any, apply to jewels";

function magicEssenceCheck(s: ItemState): Verdict {
  if (!isMagic(s)) return null;
  if (s.slots.crafted > 0) return { block: ONE_CRAFTED };
  return { pass: true, unverifiedBecause: s.jewel ? JEWEL_ESSENCE : undefined };
}

const MAGIC_TO_RARE: Omit<MoveRule, "id" | "label"> = {
  family: "essence",
  materials: [ANY_ESSENCE],
  requires: "magic item",
  effect: "magic → rare, keeping the magic mods and adding the essence's guaranteed mod (the item's one crafted mod)",
  notes: [
    ...ESSENCE_NOTES,
    `keeps the magic item's own mods like a Regal Orb (${S7}, verified-secondary: Maxroll + the Regal item text)`,
    `an essence mod that shares a family with a mod already on the item is not covered (${S7}, unverified)`,
  ],
  source: `${S7}; ${CC4}`,
  verified: true,
  check: magicEssenceCheck,
};

const ESSENCES: MoveRule[] = [
  { ...MAGIC_TO_RARE, id: "essence", label: "Essence (Lesser or regular)" },
  { ...MAGIC_TO_RARE, id: "essence-greater", label: "Greater Essence" },
  {
    id: "essence-perfect",
    label: "Perfect Essence",
    family: "essence",
    materials: [ANY_ESSENCE],
    requires: "rare item with at least one mod",
    effect: "removes a random mod, then writes the essence's guaranteed mod into the single crafted slot",
    notes: [
      ...ESSENCE_NOTES,
      "Greater-then-Perfect essence stacking is dead in 0.5.x",
      `the corrupted essences (Delirium, Horror, Hysteria, Insanity) and Abyss/Breach essences also replace a mod on a rare (${CC4})`,
    ],
    source: `${S7}; ${CC4}`,
    verified: true,
    check: perfectEssenceCheck,
  },
];

/** KB §7: Perfect essences remove-then-replace, so an existing crafted mod is replaced, not a blocker. */
function perfectEssenceCheck(s: ItemState): Verdict {
  if (!isRare(s)) return null;
  const notes = s.slots.crafted > 0 ? [`replaces the existing crafted mod — one crafted slot per item (${S7})`] : [];
  const unverifiedBecause = s.jewel ? JEWEL_ESSENCE : undefined;
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
 * Liquid emotions, per the corrected KB §6 (poe2db item text + RePoE CraftedJewel* mods). Each rule
 * claims only what §6 states; what §6 lists as still UNVERIFIED is carried as a note instead.
 */
const CONTEMPT_PAIR =
  "a crafted '+1 Suffix Modifier allowed' (sits in a PREFIX slot) or '+1 Prefix Modifier allowed' (sits in a SUFFIX slot)";

const REMOVAL_SIDE_UNVERIFIED =
  `which mod is removed, and whether the crafted mod then takes ITS side, is unverified (${S6} "Still UNVERIFIED" a)`;
const OVER_CAP_UNVERIFIED =
  `that an over-cap 3rd affix survives removing the "+1 … allowed" mod later is creator-demonstrated only (${S6} b)`;
const ANCIENT_REMOVAL = `${S6} states the "removes a random modifier" wording for the Potent tier only`;

/** Potent tiers: rare BASIC jewels. Ancient tiers: rare Time-Lost jewels only. Both write the crafted slot. */
function liquidCheck(tier: "potent" | "ancient") {
  return (s: ItemState): Verdict => {
    if (!s.jewel || !isRare(s)) return null;
    if (tier === "potent" && s.timeLost) return { block: `non-Ancient liquids don't work on Time-Lost jewels (${S6})` };
    if (tier === "ancient" && !s.timeLost) return { block: `Ancient liquids work ONLY on rare Time-Lost jewels (${S6})` };
    if (s.slots.crafted > 0) return { block: `${ONE_CRAFTED}; presumed (${S6} c, untested) — strip it first` };
    // Time-Lost mods the catalog cannot read could be an existing crafted mod: do not stack a second one
    if (tier === "ancient" && s.unmatched.length > 0) return { block: "an unreadable line may be the crafted mod — cannot prove the crafted slot is free" };
    return { pass: true };
  };
}

function liquid(id: string, label: string, material: MaterialKey, tier: "potent" | "ancient", effect: string, notes: string[]): MoveRule {
  return {
    id,
    label,
    family: "liquid",
    materials: [material],
    requires: `rare ${tier === "potent" ? "BASIC" : "Time-Lost"} jewel, no crafted mod yet`,
    effect,
    notes,
    source: S6,
    verified: true,
    check: liquidCheck(tier),
  };
}

const LIQUIDS: MoveRule[] = [
  liquid("liquid-potent-contempt", "Potent Liquid Contempt", "potentLiquidContempt", "potent",
    `removes a random mod and adds ${CONTEMPT_PAIR} — the side is not controllable`,
    [REMOVAL_SIDE_UNVERIFIED, OVER_CAP_UNVERIFIED]),
  liquid("liquid-ancient-contempt", "Ancient Potent Liquid Contempt", "ancientPotentLiquidContempt", "ancient",
    `adds ${CONTEMPT_PAIR} — the same pair as the Potent tier`,
    [ANCIENT_REMOVAL, "the Time-Lost affix cap is unresolved, so the slot it opens cannot be counted"]),
  liquid("liquid-potent-ferocity", "Potent Liquid Ferocity", "potentLiquidFerocity", "potent",
    "removes a random mod and adds a crafted '(40–60)% increased Effect of Suffixes' (PREFIX slot) or '… of Prefixes' (SUFFIX slot)",
    [REMOVAL_SIDE_UNVERIFIED]),
  liquid("liquid-ancient-ferocity", "Ancient Potent Liquid Ferocity", "ancientPotentLiquidFerocity", "ancient",
    "adds a crafted radius SUFFIX: Notable Passive Skills in Radius also grant +(5–7)% Fire / Cold / Lightning Resistance by colour",
    [ANCIENT_REMOVAL, "Diamond grants +(4–5)% Chaos Resistance per the datamine (Game8 says 5–7%)"]),
];

export const INSTILL_RULES: readonly MoveRule[] = [...ESSENCES, ...CATALYSTS, ...LIQUIDS];
