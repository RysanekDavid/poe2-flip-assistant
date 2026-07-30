import { MATS } from "./craftMaterials";
import type { CraftGuide } from "./craftRecipes";

/**
 * Second batch of craft playbooks (docs/kb/creator-videos.md, "Recipe candidates for the app"
 * items 1-5,7,8). Split out of craftGuideData.ts to keep both files under the 500-line cap.
 * Same DOMAIN-CONTENT contract: tight prose, wallet-warnings inline, mechanics cited from the KB.
 */
export const GUIDES_2: Record<string, CraftGuide> = {
  armour_putrefaction: {
    goal: "6-mod body armour: high flat/% ES (or Evasion) + two 30%+ resistances (± Spirit/rarity jackpot).",
    shopping:
      "Cheap RARE body armour ilvl 80+, ES or ES-hybrid base (desecrated prefixes follow the base's defence type — this recipe leans ES for caster buyers). 3-mod rares are fine, every mod gets wiped. NOT corrupted (trade filters it), NOT desecrated (eyeball).",
    marketCheck: "~36 exalt (~0.5-0.6 div) all-in per try. Recorded batch sold 1/2/6/6/10/13 div, best ~18 div — one hit pays the batch. Confirm this week's asks first.",
    phases: [
      {
        title: "Prep (BEFORE the omen!)",
        steps: [
          {
            do: "Armourer's Scraps to 20% + Artificer 2 sockets — on EVERY base first.",
            why: "Putrefaction corrupts the item; quality and sockets can't be added after.",
            mats: [MATS.scrap, MATS.artificers],
            warning: "Quality + sockets FIRST. The omen corrupts. No exceptions.",
          },
        ],
      },
      {
        title: "Putrefy",
        steps: [
          {
            do: "Omen of Putrefaction active, slam a Preserved Rib.",
            why: "All mods become 6 hidden desecrated reveals (3 prefix / 3 suffix) and the item corrupts. Only works on RARE, non-desecrated, non-corrupted bases.",
            mats: [MATS.omenPutrefaction, MATS.preservedRib],
            check: "Item corrupted, all mods show as unrevealed.",
          },
        ],
      },
      {
        title: "Reveal discipline",
        steps: [
          {
            do: "Well of Souls, reveal one slot at a time — pick as you go.",
            why: "Prefixes resolve before suffixes. A sellable body = a solid defence flat + % multiplier + two 30%+ resistances.",
            pick: [
              "prefix: flat Evasion/ES (high roll)",
              "prefix: % Ev/ES — multiplies the flat (T3-T4 hybrid ≈ T1 single)",
              "prefix: hybrid %ES/Ev + Life",
              "prefix: flat Life (T3+ only)",
              "prefix: Spirit — only once defences are secured",
              "suffix: fire/cold/lightning res 30%+",
              "suffix: deflection > chaos res > attributes",
            ],
          },
          {
            do: "Keep 1-2 Omens of Abyssal Echoes in reserve — activate ONE only when a good item hits a junk option set.",
            why: "Echoes rerolls the three offered options once (~0.25 div). Worth it late on an already-good body; a waste on a fresh 1-ex base.",
            mats: [MATS.omenAbyssalEchoes],
            onFail: "No usable defence prefix in the reveals → junk, sell for scraps, next base.",
          },
          {
            do: "Socket runes to match the roll, list immediately, undercut over hours.",
            why: "ES recharge suffixes are low value (nerfed) — don't chase them.",
          },
        ],
      },
    ],
    brick: "~1 in 3 lands a sellable body. Same slot machine as the boots recipe, second-highest-demand slot.",
  },

  gloves_projectile_plus2: {
    goal: "+2 to Level of all Projectile Skills gloves (Ice Shot/Twisters) + Suppress/flat ele. Comparables 250-500 div.",
    shopping:
      "Rare glove base, HIGH ilvl (82+ for the T1 flat-damage finish). Method 1 (this playbook) chaos/annul-spams the +2 onto a rare; the magic-base alt-spam route is cheaper but slower to hit.",
    marketCheck: "Price finished +2 Projectile gloves NOW. A lower T3 flat-damage pair sold 250 div, full BiS ~500 — but ~30 currency items go into one, so confirm the ask covers it.",
    phases: [
      {
        title: "Roll + lock the +2",
        steps: [
          {
            do: "Chaos/Annulment-spam the base toward +2 to Level of all Projectile Skills.",
            why: "The value driver. Best fracture odds sit at ~3 total mods.",
            mats: [MATS.chaos, MATS.annul],
            warning: "Annulment with 2+ mods is a real coinflip — it can strip the +2 before you lock it.",
          },
          {
            do: "Fracturing Orb once the +2 is on with ~3 mods.",
            why: "~1-in-3 to lock it forever → an unbrickable craft base.",
            mats: [MATS.fracturing],
            onFail: "Wrong mod fractured → sell as a normal rare, restart on a fresh base (loss lives in hitRate).",
          },
        ],
      },
      {
        title: "Finish prefixes + suffixes",
        steps: [
          {
            do: "Exalted Orb for a prefix, Essence of Hysteria for a suffix.",
            why: "Hysteria is a straight 50/50 reforge (e.g. Crit Spell Damage Bonus vs Cold Res) — no omen needed.",
            mats: [MATS.exalted, MATS.essenceOfHysteria],
          },
          {
            do: "Ancient Ribcage bone at the Well of Souls for the last slot; keep an Abyssal Echoes for the reveal.",
            why: "Target T1 flat Lightning/Cold/Physical or Suppress Chance. Ancient tier for the ilvl82 base.",
            mats: [MATS.ancientRib, MATS.omenAbyssalEchoes],
            pick: ["T1 flat Cold/Lightning/Physical (32+ phys breakpoint)", "Suppress Chance"],
          },
          {
            do: "Artificer socket + a rune, then list.",
            mats: [MATS.artificers],
          },
        ],
      },
    ],
    brick: "Miss the fracture and it's a normal rare — most of the base cost comes back. One crafted mod per item (Hysteria counts as crafted).",
  },

  wand_alloy_crystallisation: {
    goal: "Budget caster wand: T3+ crit suffix + guaranteed cast-speed (alloy) prefix + T1-ish spell damage. ~10-30 div in, ~80-100 div sale.",
    shopping:
      "Cheap any-rarity wand (~5 div) with 2 open suffixes OR an existing T3+ crit mod, ilvl 80+. Prefix content is irrelevant — the alloy overwrites it.",
    marketCheck: "Self-crafting a ~50 div wand for ~10 div is the whole point. Price finished cast-speed/spell-damage wands; one lucky triple hit turned a 30 div craft into a 400 div sale, but price the floor.",
    phases: [
      {
        title: "Crit + crafted slot",
        steps: [
          {
            do: "Greater Essence of Seeking for a guaranteed T3 crit chance suffix.",
            mats: [MATS.greaterEssenceSeeking],
            check: "Wand has a crit-chance suffix.",
          },
          {
            do: "Astrid's Creativity to add a crafted-mod slot.",
            why: "The 'additional crafted modifier' orb (~4-5 div) — holds the slot until you overwrite it with a real bench craft (e.g. +X Spell Skills) at the end.",
            mats: [MATS.astridsCreativity],
          },
        ],
      },
      {
        title: "Alloy prefix + mana block",
        steps: [
          {
            do: "Omen of Sinistral Crystallisation, then slam a Transcendent Alloy.",
            why: "Prefix Crystallisation forces the alloy to convert a prefix into its guaranteed near-min-tier mod (cast speed).",
            mats: [MATS.omenSinistralCrystallisation, MATS.transcendentAlloy],
          },
          {
            do: "Block mana on the remaining prefix: Essence of the Abyss → Preserved Jawbone at the Well of Souls.",
            why: "Essence of the Abyss marks the mod; the Jawbone converts it to a Desecrated slot. The conversion has a known bug — budget spare Jawbones.",
            mats: [MATS.essenceOfTheAbyss, MATS.preservedJawbone],
            warning: "The Mark → Jawbone step can silently fail; don't assume one attempt suffices.",
          },
        ],
      },
      {
        title: "Perfect-exalt the finish",
        steps: [
          {
            do: "Omen of Greater Exaltation + an Exalted Orb on the last prefix, targeting T1 spell damage / elemental-gain.",
            why: "At Perfect-Exalt's effective ilvl50 pool with mana blocked, the T1 'gain' mod is ~1-in-3 to 1-in-4.",
            mats: [MATS.omenGreaterExaltation, MATS.exalted],
            onFail: "Off-element/bad hit → Annulment (Sinistral/Dextral) to recover, then re-slam.",
          },
          {
            do: "Overwrite the crafted placeholder with a real bench craft, then list.",
            mats: [MATS.annul],
          },
        ],
      },
    ],
    brick: "A missed 'gain' mod still leaves a sellable cast-speed/crit wand — list it cheap. Distinct from the ~100+ div 2-socket high-end version.",
  },

  amulet_giga_spirit: {
    goal: "Rare amulet: Spirit (T1/T2) + global Armour/Evasion/ES + Fire/Elemental Res + a rarity/life filler. ~70 div in → ~180 div sale.",
    shopping:
      "Gold or Solar amulet, kept MAGIC rarity — Spirit can only be added while Magic, so sequence it before any Rare upgrade. ilvl 75+.",
    marketCheck: "The Spirit hunt dominates the cost (T1 ~200-300 chaos of attempts). Price finished Spirit amulets first — Spirit gates aura/Arctic Armour thresholds, so demand is deep.",
    phases: [
      {
        title: "Hunt the Spirit",
        steps: [
          {
            do: "Desecrate (Collarbone bone) repeatedly on the MAGIC amulet until Spirit lands.",
            why: "T2 fallback landed in ~30 attempts; T1 costs far more. Keep an Abyssal Echoes to reroll a dead reveal set.",
            mats: [MATS.preservedCollarbone, MATS.omenAbyssalEchoes],
            warning: "Spirit only adds while MAGIC — do NOT Regal to Rare before it lands, it forecloses Spirit permanently.",
            check: "Amulet carries a Spirit prefix.",
          },
        ],
      },
      {
        title: "Convert a suffix to global defence",
        steps: [
          {
            do: "Omen of Dextral Exaltation → guaranteed suffix, then Omen of Dextral Crystallisation + Perfect Essence of Enhancement.",
            why: "Spirit blocks further Magic-only additions once Rare — this converts a suffix into a 'global Armour/Evasion/ES' prefix as the workaround.",
            mats: [MATS.omenDextralExaltation, MATS.omenDextralCrystallisation, MATS.perfectEssenceEnhancement],
          },
        ],
      },
      {
        title: "Resistance slam + fill",
        steps: [
          {
            do: "Fire (Xoph's) or Lightning (Esh's) Catalyst — never Cold — then Catalysing + Greater Exaltation + a Perfect Exalted Orb.",
            why: "Catalyst biases the slam toward Fire/Elemental Res. Cold Catalyst is the trap (see wallet warnings).",
            mats: [MATS.xophsCatalyst, MATS.eshsCatalyst, MATS.omenCatalysingExaltation, MATS.omenGreaterExaltation, MATS.perfectExalted],
          },
          {
            do: "Fill the last slot via more desecration (High Life/ES/Evasion/Rarity), then catalyse cosmetically before listing.",
            why: "Amulets don't display a quality tag — cosmetic Catalysts only inflate the numbers buyers filter on.",
          },
        ],
      },
    ],
    brick: "T2 Spirit instead of T1 is still a solid sale — the grind almost always ends in a sellable Spirit amulet, that's why hitRate is high. Distinct from the fracture-the-+3 amulet recipe.",
  },

  quarterstaff_desecrate_crit: {
    goal: "~550 flat Physical (Fizz) + 12% crit + Crit Damage Bonus quarterstaff. ~4 div base + ~1 div mats → 6-9+ div sale.",
    shopping:
      "Rare quarterstaff bought near the TOP of its observed flat-roll range (e.g. 145-150+ of a ~130-150+ span), ilvl 80+, ~4 div. Base roll RANGE matters as much as the affix — bottom-of-range is poor value even at the same price.",
    marketCheck: "Quarterstaffs have NO Amanamu group — this is a genuinely separate recipe from the bow craft. Price finished ~550-phys crit staves first.",
    phases: [
      {
        title: "Flat phys",
        steps: [
          {
            do: "Greater Essence of Abrasion for guaranteed flat Physical (Fizz).",
            mats: [MATS.greaterEssenceAbrasion],
            check: "Staff has flat phys + your top-roll base range.",
          },
        ],
      },
      {
        title: "Desecrate FIRST (the stop-loss)",
        steps: [
          {
            do: "Preserved Jawbone at the Well of Souls — inspect the offered options and pick the best (Abyssal Echoes to reroll once).",
            why: "No mod-lock omen exists for staffs, so this is blind — you roll from the normal (weaker) desecrated pool. Look for ~32% Fizz or Crit Damage Bonus over a lesser Fire mod.",
            mats: [MATS.preservedJawbone, MATS.omenAbyssalEchoes],
            pick: ["Crit Damage Bonus (T2+)", "high flat Physical", "12% crit chance"],
            onFail: "Bad desecration → STOP. Don't keep exalting a dead staff; sell as-is or scrap.",
          },
        ],
      },
      {
        title: "Finish only if good",
        steps: [
          {
            do: "1-2 Exalted Orb slams ONLY if the desecration result is already good, then Artificer socket + Greater Iron Rune.",
            why: "The stop-loss is the whole edge here — exalts are wasted on a staff that didn't hit.",
            mats: [MATS.exalted, MATS.artificers],
            check: "~550 pdps tooltip → list it. Rune ~1 ex, not tracked.",
          },
        ],
      },
    ],
    brick: "Bad desecrate = you stop early, out only the essence — the cheapest weapon flip in the set.",
  },

  amulet_desecrated_beginner: {
    goal: "Rare amulet: guaranteed T1 Rarity + a defensive/attribute prefix + a desecrated jackpot (Spirit or extra Rarity) + filler. ~4 div total.",
    shopping: "Any cheap MAGIC amulet base (~2 div), open prefix preferred.",
    marketCheck: "Profitable even on a non-jackpot life/ES/evasion result. ~1-in-15 shot at the Spirit/Rarity jackpot is the upside — price the plain T1-rarity floor, don't bank the jackpot.",
    phases: [
      {
        title: "Guarantee rarity",
        steps: [
          {
            do: "Perfect Augmentation on the open prefix (accept life/ES/evasion/Spirit/rarity), then Greater Essence of Opulence.",
            why: "Opulence guarantees T1 Rarity — that's the sellable floor every attempt hits.",
            mats: [MATS.perfectAug, MATS.greaterEssenceOpulence],
            check: "T1 Rarity on the amulet.",
          },
        ],
      },
      {
        title: "Desecrated jackpot",
        steps: [
          {
            do: "Omen of Sinistral Necromancy + a desecration bone (Collarbone) — forces the desecrated roll to a prefix.",
            why: "Jackpot potential: Spirit or a second Rarity line.",
            mats: [MATS.omenSinistralNecromancy, MATS.preservedCollarbone],
            onFail: "Filler prefix → fine, the T1 Rarity already makes it sellable.",
          },
          {
            do: "Omen of Greater Exaltation + an Exalted Orb (2 mods in one slam, accept filler), then list.",
            mats: [MATS.omenGreaterExaltation, MATS.exalted],
          },
        ],
      },
    ],
    brick: "Guaranteed T1 Rarity means almost every attempt is sellable — hence the high hitRate. The jackpot is gravy, not the plan.",
  },

  ring_fractured_t1res: {
    goal: "Mirror-adjacent attack ring: fractured T1 flat + second T1 flat + two T1 resistances (ilvl 82, whittle-proof) + a premium settle (all-res / rarity / T1 res). Sells 550–900 div; EARLY LEAGUE ONLY.",
    shopping:
      "ilvl 82 GOLD ring with a FRACTURED tier-one flat elemental (cold preferred), not corrupted, not sanctified (~60–70 div). Check the TIER carefully — 40% catalyst quality inflates a T2 into T1-looking numbers.",
    marketCheck:
      "This craft is SEASONAL: ~300–400 div in, sells 550–900 early league when attack builds dominate and whittles cost 3–4 div. Late league the rings sit at 4–500 with dead liquidity — the creator explicitly says do NOT profit-craft it then. Check finished-ring asks + whittle price first.",
    phases: [
      {
        title: "Second T1 flat",
        steps: [
          {
            do: "Chaos-spam for a second tier-one flat elemental — fire or lightning, whichever hits first.",
            why: "NOT phys: phys has the highest weighting and must stay in the pool as an ‘out’ for the Omen of Light phase. Expect ~400–600 chaos (~50–70 div).",
            mats: [MATS.chaos],
            warning: "Take EITHER fire or lightning — rolling over one hunting the other burned a player 2,000 chaos.",
            check: "Two T1 flats: the fractured one + fire/lightning.",
          },
        ],
      },
      {
        title: "Quality shuttle",
        steps: [
          {
            do: "Dextral Exaltation + Exalted Orb (any suffix), then Essence of the Breach + Omen of Dextral Crystallisation to eat that suffix into the breach QUALITY mod.",
            why: "Plants a disposable mod that later shuttles out via whittles — it exists to be moved, not kept.",
            mats: [MATS.omenDextralExaltation, MATS.exalted, MATS.essenceOfTheBreach, MATS.omenDextralCrystallisation],
          },
          {
            do: "Fire/lightning catalysts, then TWO SINGLE Perfect Exalted Orb slams under Omen of Catalysing Exaltation (re-catalyse between slams).",
            why: "Singles give two independent shots at a T1 resistance — each hit saves ~5–7 whittles. A Greater double-slam saves one perfect exalt but pushes toward all-res.",
            mats: [MATS.xophsCatalyst, MATS.omenCatalysingExaltation, MATS.perfectExalted],
            warning: "Never cold catalysts here.",
          },
          {
            do: "RE-APPLY catalyst quality now, BEFORE any whittling.",
            warning: "“Quality slam, quality slam, quality” — the creator bricked THREE rings by whittling with the attack quality missing.",
          },
        ],
      },
      {
        title: "Whittle + shield",
        steps: [
          {
            do: "Whittle (Omen of Whittling + Chaos Orb) the breach quality mod until it returns as a SUFFIX — 50/50 per whittle.",
            mats: [MATS.omenWhittling, MATS.chaos],
            onFail: "Tiny full-brick window here (~1 in 80–200) — priced into the variance.",
          },
          {
            do: "Desecrate the open prefix (Preserved Collarbone), Omen of Light rerolls until ANY item-level-75 mod lands (T1 mana, a flat, T1 %damage).",
            why: "Whittling removes the LOWEST modifier level — an ilvl-75 desecrated prefix shields the prefixes so every further whittle lands on suffixes (‘whittle in peace’). An ilvl-65 pick works until whittles reach it again.",
            mats: [MATS.preservedCollarbone, MATS.omenLight],
          },
          {
            do: "Whittle suffixes to TWO tier-one resistances (~1 in 5 each), then settle the third.",
            why: "T1 res is ilvl 82 — once landed it’s blocked, whittle-proof. NO bricks on suffix whittles (an ilvl-75 mana regen forces off via the suffix-chaos omen + whittle).",
            mats: [MATS.omenWhittling, MATS.greaterChaos],
            pick: [
              "settle: all-res or rarity (best)",
              "settle: third T1 single res",
              "settle: T1 chaos res (ilvl 81)",
              "settle: damage leeched as mana — attack builds buy it",
            ],
            check: "Two T1 resistances locked + one premium settle suffix.",
          },
        ],
      },
      {
        title: "Final prefix",
        steps: [
          {
            do: "Omen of Light + collarbone loop on the desecrated prefix until T1 phys flat, T1 fire flat, or rarity (~10–15 of each budgeted).",
            why: "Each reveal shows three options and the Light rerolls them once — real odds much better than the raw 1/30–1/60 weights.",
            mats: [MATS.omenLight, MATS.preservedCollarbone],
          },
          {
            do: "Price by the PACKAGE: weighted flat total + res spread. All-res versions sell at a premium (pairs with a mirrored Kalandra ring for 90 res).",
          },
        ],
      },
    ],
    brick: "Variance craft: 200–700 div realized range around the ~350 expected. Prefix-rarity intermediate states already sell. Whittles cheap = green light; whittles expensive = walk away.",
  },
};