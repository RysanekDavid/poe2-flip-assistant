import { MATS } from "./craftMaterials";
import { GUIDES_4 } from "./craftGuideData4";
import { CHEAP_BASE_FLOOR_EX } from "./craftValuation";
import type { CraftRecipe } from "./craftRecipes";

/**
 * Fourth batch (2026-09-30 expansion, armour + weapons): the Tiara ES helmet, the Vile Robe essence
 * flips, the putrefaction quiver and the Sovereign ballista crossbow. Candidates came from a
 * researcher pass over creator videos, the fixerpimp-gamer 0.5 compilation and secondary write-ups;
 * provenance lives in craftProvenanceData2.ts. Split from craftRecipeData3.ts for the 500-line cap.
 *
 * Every base, tier and item level below was read from the committed RePoE snapshot
 * (src/data/poe2/craft/craft-catalog.json.gz + repoe base_items, game data 0.5.5b). qtyPerAttempt is
 * the expected use per BOUGHT BASE: steps after a gate are scaled by its pass rate.
 */

/** Ask floor (exalts) for the Vile Robe base legs: the sources' bases cost 10–15 ex, under the default
 *  0.05 Div floor at league rates; asks below ~5 ex on a 50+ Spirit / T1 ES magic robe are bait. */
export const VILE_ROBE_FLOOR_EX = 5;

// Vile Robe (RePoE FourBodyInt3Endgame): drop level 65, 171 base ES. Both flips share the process;
// only the magic headline mod the base is bought for differs.
const VILE_ROBE_MATS: CraftRecipe["materials"] = [
  { material: MATS.greaterEssenceEnhancement, qtyPerAttempt: 1, note: "Magic → rare with the (68–79)% increased Armour/Evasion/ES prefix (poe2db)." },
  { material: MATS.omenDextralExaltation, qtyPerAttempt: 1, note: "Forces the Greater Exalt onto suffixes (resistances)." },
  { material: MATS.omenGreaterExaltation, qtyPerAttempt: 1, note: "Two mods from one exalt — stacking with Dextral is KB §4 medium confidence." },
  { material: MATS.greaterExalted, qtyPerAttempt: 1, note: "Modifier-level 35 floor (KB §1)." },
  { material: MATS.preservedRib, qtyPerAttempt: 1, note: "Preserved tier — Rib = armour (bone text); Gnawed fails above ilvl 64." },
  { material: MATS.omenAbyssalEchoes, qtyPerAttempt: 0.5, note: "Only when the three offered options are junk on an otherwise good robe." },
  { material: MATS.artificers, qtyPerAttempt: 2, note: "Two sockets for Greater Iron Runes (runes ~1 ex, not tracked)." },
  { material: MATS.scrap, qtyPerAttempt: 14, note: "~14 scraps to 20% quality before listing (more ES on the tooltip)." },
];

export const RECIPES_4: CraftRecipe[] = [
  // 1) Tiara ES helmet. hitRate 0.25: a normal base must first land the T1 flat ES from a Perfect
  //    Transmute or Aug (~1 in 3 per base is our estimate), the rest is guaranteed or a desecrated bonus.
  {
    key: "helmet_tiara_es",
    domain: "armour",
    label: "Helmet · Tiara ES essence + desecrated",
    base: {
      label: "Normal Ancestral Tiara (ilvl 80+)",
      minAskEx: CHEAP_BASE_FLOOR_EX, // honest price ~1 ex for a white base
      type: "Ancestral Tiara",
      rarity: "normal",
      ilvlMin: 80, // RePoE drop level 80: every Ancestral Tiara clears the lvl-78 hybrid ES tiers
      stats: [],
      note: "White Ancestral Tiara (109 base ES, drop level 80). Kamasan Tiara (103 ES, drop 75) works too if ilvl 78+. Buy several — the Perfect Transmute/Aug gate is per base.",
    },
    result: {
      label: "Rare Tiara · 300+ ES + resistances",
      category: "armour.helmet",
      rarity: "rare",
      ilvlMin: 78,
      esMin: 300,
      stats: [{ text: "+#% total Elemental Resistance", min: 50, group: "pseudo", tier: 2 }],
      note: "Valued from instant-buyout comparables: rare helmet with 300+ ES (flat T1 + the essence's %ES + a desecrated hybrid), with 50%+ total elemental res when enough are listed (else ES alone).",
    },
    materials: [
      { material: MATS.perfectTransmute, qtyPerAttempt: 1, note: "One per white base — floor 70 means ANY ES mod it rolls is the top tier (KB §1 soft floor)." },
      { material: MATS.perfectAug, qtyPerAttempt: 0.7, note: "When the transmute missed flat ES but left the prefix open." },
      { material: MATS.greaterEssenceEnhancement, qtyPerAttempt: 0.35, note: "Only on bases that landed T1 flat ES (~1 in 3, estimate)." },
      { material: MATS.omenSinistralNecromancy, qtyPerAttempt: 0.35, note: "Forces the Rib's desecration onto the last open prefix." },
      { material: MATS.preservedRib, qtyPerAttempt: 0.35 },
      { material: MATS.omenAbyssalEchoes, qtyPerAttempt: 0.2, note: "Only when the offered options carry no hybrid %ES line (the triple-T1 variant's reroll)." },
      { material: MATS.omenGreaterExaltation, qtyPerAttempt: 0.35, note: "Two suffixes from one Perfect Exalt once the prefixes are full." },
      { material: MATS.perfectExalted, qtyPerAttempt: 0.35, note: "Modifier-level 50 floor (KB §1) — resistances on the open suffixes." },
    ],
    hitRate: 0.25,
    guide: GUIDES_4.helmet_tiara_es!,
  },

  // 2) Vile Robe Spirit flip. hitRate 0.5: the essence and exalts always complete; ~half the robes
  //    land enough resistance + a usable desecrated mod to clear the comparable band.
  {
    key: "armour_vile_robe_spirit",
    domain: "armour",
    label: "Body Armour · Vile Robe Spirit essence",
    base: {
      label: "Magic Vile Robe · 50+ Spirit",
      minAskEx: VILE_ROBE_FLOOR_EX,
      type: "Vile Robe",
      rarity: "magic",
      ilvlMin: 65, // RePoE drop level
      stats: [{ text: "# to Spirit", min: 50 }],
      note: "MAGIC Vile Robe with 50+ Spirit (tiers 47–50 @ lvl 54 … 57–61 @ lvl 78; RePoE). ~10–15 ex. An open suffix helps; the Spirit is the value.",
    },
    result: {
      label: "Rare Vile Robe · Spirit + ES + res",
      type: "Vile Robe",
      rarity: "rare",
      esMin: 280,
      stats: [
        { text: "# to Spirit", min: 50, tier: 1 },
        { text: "+#% total Elemental Resistance", min: 60, group: "pseudo", tier: 2 },
      ],
      note: "Valued from instant-buyout comparables: rare Vile Robe with 50+ Spirit and 280+ ES, with 60%+ total elemental res when enough are listed. Sources put typical sales at 2–4 div.",
    },
    materials: VILE_ROBE_MATS,
    hitRate: 0.5,
    guide: GUIDES_4.armour_vile_robe_spirit!,
  },

  // 3) Vile Robe flat-ES flip — same process on a T1 flat ES magic base.
  {
    key: "armour_vile_robe_es",
    domain: "armour",
    label: "Body Armour · Vile Robe ES essence",
    base: {
      label: "Magic Vile Robe · T1 flat ES",
      minAskEx: VILE_ROBE_FLOOR_EX,
      type: "Vile Robe",
      rarity: "magic",
      ilvlMin: 79, // T1 flat ES (91–96) is modifier level 79 on this base (RePoE)
      // armour flat ES is the LOCAL stat; the plain text is the global (amulet/belt) one
      stats: [{ text: "# to maximum Energy Shield (Local)", min: 91 }],
      note: "MAGIC Vile Robe with T1 flat ES (+91–96, modifier level 79 → the base is ilvl 79+). ~10–15 ex.",
    },
    result: {
      label: "Rare Vile Robe · T1 flat ES + %ES + res",
      type: "Vile Robe",
      rarity: "rare",
      esMin: 420,
      stats: [
        { text: "# to maximum Energy Shield (Local)", min: 91, tier: 1 },
        { text: "+#% total Elemental Resistance", min: 60, group: "pseudo", tier: 2 },
      ],
      note: "Valued from instant-buyout comparables: rare Vile Robe with T1 flat ES and 420+ total ES, with 60%+ total elemental res when enough are listed.",
    },
    materials: VILE_ROBE_MATS,
    hitRate: 0.5,
    guide: GUIDES_4.armour_vile_robe_es!,
  },

  // 4) Putrefaction quiver — the boots/body slot machine on a quiver (Jawbone = "Weapon or Quiver").
  //    hitRate 0.3: same six-reveal mechanic as the other putrefaction recipes.
  {
    key: "quiver_putrefaction",
    domain: "weapon",
    label: "Quiver · putrefaction bow damage",
    base: {
      label: "Cheap rare quiver (ilvl 81+)",
      minAskEx: CHEAP_BASE_FLOOR_EX, // honest price ~1–2 ex
      category: "armour.quiver",
      rarity: "rare",
      ilvlMin: 81, // Damage with Bow Skills T1 (51–59%) is modifier level 81 on quivers (RePoE)
      stats: [],
      note: "Cheapest rare ilvl 81+ quiver, not corrupted and not desecrated (eyeball). Mods are wiped; the implicit stays — Primed (attack speed) or Visceral (crit) bases sell best.",
    },
    result: {
      label: "Corrupted rare quiver · Bow Skill damage",
      category: "armour.quiver",
      rarity: "rare",
      ilvlMin: 81,
      corrupted: true, // the putrefaction omen corrupts — uncorrupted listings are a different product
      stats: [
        { text: "#% increased Damage with Bow Skills", min: 43, tier: 1 },
        { text: "#% increased Critical Damage Bonus for Attack Damage", min: 25, tier: 2 },
      ],
      note: "Valued from instant-buyout CORRUPTED comparables: 43%+ Damage with Bow Skills (T2+), with a Critical Damage Bonus for Attacks line when enough are listed.",
    },
    materials: [
      { material: MATS.omenPutrefaction, qtyPerAttempt: 1 },
      { material: MATS.preservedJawbone, qtyPerAttempt: 1, note: "Jawbone desecrates a Rare Weapon or Quiver (bone text). Preserved: any item level." },
      { material: MATS.omenAbyssalEchoes, qtyPerAttempt: 0.3, note: "Optional reroll insurance on an already-good quiver (~1 in 3 runs)." },
    ],
    hitRate: 0.3,
    guide: GUIDES_4.quiver_putrefaction!,
  },

  // 5) Sovereign ballista crossbow. hitRate 0.4: essence + exalts complete every time; the gate is the
  //    Ulaman prefix reveal, where RePoE lists TWO candidates on crossbows (ballista, lightning pen).
  {
    key: "crossbow_sovereign_ballista",
    domain: "weapon",
    label: "Crossbow · Sovereign ballista",
    base: {
      label: "Magic Siege Crossbow · 100%+ phys",
      type: "Siege Crossbow",
      rarity: "magic",
      ilvlMin: 79, // RePoE drop level of Siege Crossbow
      stats: [{ text: "#% increased Physical Damage", min: 100 }],
      note: "MAGIC Siege Crossbow with 100%+ increased Physical Damage (T5 85–109 @ lvl 33 … T1 170–179 @ lvl 82; RePoE) and an open prefix. Prefer an open or junk suffix.",
    },
    result: {
      label: "Rare Siege Crossbow · +1 Ballista",
      type: "Siege Crossbow",
      rarity: "rare",
      // ~400 pdps at 100% phys + the essence's flat phys + 20% quality (RePoE base 29–115, 1.65 aps)
      pdpsMin: 350,
      stats: [{ text: "+# to maximum number of Summoned Ballista Totems", group: "desecrated", tier: 1 }],
      note: "Valued from instant-buyout comparables: 350+ pdps rare Siege Crossbow with the desecrated Ulaman '+1 to maximum number of Summoned Ballista Totems'. The compilation quotes 600+ DPS for a finished budget piece.",
    },
    materials: [
      { material: MATS.greaterEssenceAbrasion, qtyPerAttempt: 1, note: "Two-handers: Adds (23–35) to (39–59) Physical Damage (poe2db) — the lvl-60 flat-phys tier." },
      { material: MATS.omenSinistralNecromancy, qtyPerAttempt: 1, note: "Forces the desecration onto the open prefix." },
      { material: MATS.omenTheSovereign, qtyPerAttempt: 1, note: "Guarantees an Ulaman mod (item text) — on a crossbow prefix that is the ballista or lightning penetration." },
      { material: MATS.preservedJawbone, qtyPerAttempt: 1 },
      { material: MATS.omenAbyssalEchoes, qtyPerAttempt: 0.5, note: "Reroll the options once when the ballista line isn't offered." },
      { material: MATS.omenGreaterExaltation, qtyPerAttempt: 1, note: "One Greater Exalt adds two mods — the open suffixes." },
      { material: MATS.greaterExalted, qtyPerAttempt: 1, note: "Modifier-level 35 floor (KB §1)." },
      { material: MATS.whetstone, qtyPerAttempt: 10, note: "~10 whetstones to 20% quality (more pdps on the tooltip) — our estimate, the sources name no count." },
      { material: MATS.artificers, qtyPerAttempt: 2, note: "Sockets for Greater Iron Runes (runes not tracked)." },
    ],
    hitRate: 0.4,
    guide: GUIDES_4.crossbow_sovereign_ballista!,
  },
];
