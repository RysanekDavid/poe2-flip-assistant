import { MATS } from "./craftMaterials";
import { GUIDES_7 } from "./craftGuideData7";
import type { CraftRecipe } from "./craftRecipes";

/**
 * Seventh batch (2026-09-30 second wave, jewellery): the compilation's life/resistance belt and its
 * prismatic attack ring. Both open with a resistance essence and a Dextral + boss-omen Collarbone;
 * both are single-source drafts (provenance in craftProvenanceData2.ts). Tiers/levels: committed RePoE
 * snapshot (game data 0.5.5b). qtyPerAttempt is the expected use per BOUGHT BASE.
 */

/** Essence + Dextral + boss omen + Collarbone — the shared opening. The Sovereign is priced; the Liege
 *  and the Blackblooded are the Fire and Cold alternatives. */
const HYBRID_MATS: CraftRecipe["materials"] = [
  { material: MATS.greaterEssenceThawing, qtyPerAttempt: 1, note: "A Greater resistance essence of an element the base lacks (the compilation names none); Thawing = cold is priced." },
  { material: MATS.omenDextralNecromancy, qtyPerAttempt: 1, note: "Forces the Collarbone's desecration onto a suffix." },
  { material: MATS.omenTheSovereign, qtyPerAttempt: 1, note: "Ulaman → Lightning + Chaos hybrid; the Liege (Fire) and the Blackblooded (Cold) are the alternatives." },
  { material: MATS.preservedCollarbone, qtyPerAttempt: 1, note: "'Desecrates a Rare Amulet, Ring or Belt' (item text)." },
];

export const RECIPES_7: CraftRecipe[] = [
  // 1) Life/res belt (belt_001). hitRate 0.6: the essence and the Collarbone always land; the
  //    compilation's 3/4 hybrid odds are shaded for the open K6 belt question.
  {
    key: "belt_life_res_desecrated_hybrid",
    domain: "jewellery",
    label: "Belt · life + res + desecrated chaos hybrid",
    base: {
      label: "Magic belt · life + a resistance (ilvl 65+)",
      category: "accessory.belt",
      rarity: "magic",
      ilvlMin: 65, // top belt life tier +(150–174) is modifier level 65 (RePoE)
      stats: [{ text: "# to maximum Life", min: 100 }], // matches the result leg
      note: "MAGIC belt with 100+ maximum Life (our minimum, matching the result leg) and one resistance. The compilation names no base, life roll or item level; ilvl 65+ is where the top life tier opens.",
    },
    result: {
      label: "Rare belt · life + resistances",
      category: "accessory.belt",
      rarity: "rare",
      ilvlMin: 65,
      stats: [
        { text: "# to maximum Life", min: 100, tier: 1 },
        { text: "+#% total Elemental Resistance", min: 60, group: "pseudo", tier: 2 },
      ],
      note: "Valued from instant-buyout comparables: rare belt with 100+ life, with 60%+ total elemental res when enough are listed. The chaos half of the hybrid is upside the leg does not search.",
    },
    materials: [
      ...HYBRID_MATS,
      { material: MATS.exalted, qtyPerAttempt: 1, note: "Optional in the compilation: one slam for a flat Armour prefix." },
    ],
    hitRate: 0.6,
    guide: GUIDES_7.belt_life_res_desecrated_hybrid!,
  },

  // 2) Prismatic attack ring (ring_001). hitRate 0.3: two exalt slams must each land a damage line —
  //    the first Catalysing-biased (5× at 20%, KB §4), the second unbiased as the compilation writes it.
  {
    key: "ring_prismatic_catalyst_attack",
    domain: "jewellery",
    label: "Ring · Prismatic catalysed flat attack damage",
    base: {
      label: "Magic Prismatic Ring · life + a resistance (ilvl 75+)",
      type: "Prismatic Ring",
      rarity: "magic",
      ilvlMin: 75, // top flat Physical/Fire to Attacks tiers are modifier level 75 (RePoE AddedPhysicalDamage9 / AddedFireDamage9)
      stats: [{ text: "# to maximum Life", min: 60 }], // matches the result leg
      note: "MAGIC Prismatic Ring (+(7–10)% all elemental res implicit, RePoE) with 60+ Life (our minimum, matching the result leg) and one resistance, ilvl 75+. The compilation prefers Prismatic; it names no life roll.",
    },
    result: {
      label: "Rare Prismatic Ring · flat phys to Attacks + life",
      type: "Prismatic Ring",
      rarity: "rare",
      ilvlMin: 75,
      stats: [
        { text: "Adds # to # Physical Damage to Attacks", tier: 1 },
        { text: "# to maximum Life", min: 60, tier: 2 },
        { text: "+#% total Elemental Resistance", min: 60, group: "pseudo", tier: 2 },
      ],
      note: "Valued from instant-buyout comparables: rare Prismatic Ring with flat Physical to Attacks, with 60+ life and 60%+ total elemental res when enough are listed.",
    },
    materials: [
      ...HYBRID_MATS,
      { material: MATS.uulNetolsCatalyst, qtyPerAttempt: 20, note: "Physical-tag quality to 20% (the ring cap, KB §8) — the count is the amulet recipes' estimate." },
      { material: MATS.omenCatalysingExaltation, qtyPerAttempt: 1, note: "Consumes the quality into a 5× Physical-tag weight on the next exalt (KB §4)." },
      { material: MATS.greaterExalted, qtyPerAttempt: 2, note: "One per damage slam; modifier-level 35 floor (KB §1)." },
      { material: MATS.xophsCatalyst, qtyPerAttempt: 20, note: "The compilation's Fire catalyst for the second slam — without an omen it only scales magnitude (KB §8)." },
    ],
    hitRate: 0.3,
    guide: GUIDES_7.ring_prismatic_catalyst_attack!,
  },
];
