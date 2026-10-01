import type { CreatorClaim, RecipeProvenance, RecipeSource } from "./craftProvenance/schema";

/**
 * Provenance, durability and creator claims for the 2026-10-01 creator-video wave
 * (craftRecipeData8.ts + craftRecipeData9.ts), merged into craftProvenanceData.ts and validated there.
 *
 * Every step was read off the creator's timestamped auto-caption transcript, committed under
 * docs/kb/sources/transcripts/22–30 (line 2 of each holds the YouTube URL). The sources carry NO
 * link: the YouTube oEmbed request was blocked in the session that added them, so neither the
 * video title nor the channel's author_name is confirmed (test:craft-provenance requires a linked
 * video's creator to match docs/kb/sources/oembed.json). Creators are the names from the
 * researcher's search listing (Belton also names himself, video 0:01); dates are that listing's,
 * precision "listing", and null where it showed none. Follow-up: fetch oEmbed, add E7–E15 and link
 * these sources.
 *
 * Grades (src/lib/claim.ts) sit on each recipe's why_it_works at its weakest link: "syn" where every
 * mechanic in it is item text or RePoE, "uv" where it rests on a creator- or player-demonstrated
 * interaction. Creator prices and sales are only `creatorClaims` — dated, timestamped context; the
 * margin always comes from live prices, and craft-to-use recipes show none.
 */

const TRANSCRIPTS = "docs/kb/sources/transcripts";

function video(file: string, title: string, creator: string, listingDate: string | null): RecipeSource {
  return {
    kind: "video",
    title: `[YouTube title not fetched] ${title}`,
    url: null,
    creator,
    date: listingDate,
    datePrecision: listingDate === null ? null : "listing",
    tier: "primary",
    ref: `${TRANSCRIPTS}/${file}`,
  };
}

const SPEAR = video("22-bleed-spear-craft-bosorkana.txt", "Bleed spear craft", "Bosorkana", "2026-09-18");
const COLD_WAND = video("23-league-start-body-belt-wand-crafts-asaveq.txt", "League-start body armour, belt and wand crafts", "ASaVeQ", "2026-09-06");
const LOTTERY = video("24-ilvl-80-dueling-wand-perfect-orb-lottery-belton.txt", "ilvl-80 Dueling Wand Perfect-orb lottery", "Belton", null);
const PLUS4 = video("25-plus-6-to-plus-8-spellslinger-wand-belton.txt", "+6 to +8 spellslinger wand with two alloys", "Belton", null);
const GOLD_RING = video("26-gold-ring-item-rarity-craft-diztoh.txt", "Gold Ring item rarity craft", "Diztoh", "2026-09-11");
const DUSK = video("27-dusk-ring-four-flat-damage-craft-asaveq.txt", "Dusk Ring four flat damage craft", "ASaVeQ", null);
const SHIELD = video("28-2000-armour-tower-shield-craft-lilbotq.txt", "2,000 Armour Tower Shield craft", "LilBotQ", "2026-09-11");
const JEWELS = video("29-budget-and-5-mod-jewel-crafting-lilbotq.txt", "Budget and 5-mod jewel crafting", "LilBotQ", "2026-09-14");
const BOOTS = video("30-35-ms-mana-stacker-boots-craft-asaveq.txt", "35% MS mana-stacker boots craft", "ASaVeQ", null);

const POE2DB = "https://poe2db.tw/us/";
const FORUM_ALLOY = "https://www.pathofexile.com/forum/view-thread/3949532";
const GGG_ALLOY_BUG = "GGG treats Crystallisation-on-alloys as a bug and fixes it.";

function said(source: RecipeSource, at: string, text: string): CreatorClaim {
  if (source.ref === null) throw new Error(`creator claim "${text}" cites a source with no ref`);
  return { text, at, sourceRef: source.ref };
}

/** Wave-3 entries share these fields; each sets its own sources, durability and claims. */
function draft(rest: Omit<RecipeProvenance, "patchVerified" | "status" | "extraEntityRefs">): RecipeProvenance {
  return { patchVerified: "0.5.5b", status: "draft", extraEntityRefs: [], ...rest };
}

const WEAPONS: Record<string, RecipeProvenance> = {
  spear_bleed_abrasion_necro: draft({
    sources: [SPEAR],
    hitRateBasis: { basis: "creator_claim", n: null, note: "The creator gets the % Physical + Accuracy hybrid in 'three out of four crafts' (2:42–2:46); everything else lands." },
    kbRuleRefs: ["§1", "§4", "§5", "§7"],
    durability: {
      why_it_works:
        "The essence's flat Physical and the Sinistral-forced desecration land every time, and Abyssal Echoes gives the reveal a second set of options — only the reveal and the two exalted suffixes are random. A bleed build scales on the spear's physical damage, so the craft stays useful while bleed spears are played.",
      breaks_when: [
        "Bleed spear builds leave the meta (the creator only crafts it when bought bleed spears are poor value).",
        "The % Physical + Accuracy hybrid stops showing up in Sinistral reveals, or its weight changes.",
        "Omen of Light, Jawbone or Omen of Greater Exaltation prices spike, making each retry dearer than a new base.",
      ],
      claim: {
        v: "syn",
        src: [`${POE2DB}Greater_Essence_of_Abrasion`, `${POE2DB}Omen_of_Sinistral_Necromancy`, `${POE2DB}Omen_of_Abyssal_Echoes`],
        note: "Item texts verified; how often the hybrid is offered is the creator's footage only.",
      },
    },
    creatorClaims: [
      said(SPEAR, "0:02–0:14", "Max hit 400–500 with plus levels; about 2 minutes of crafting."),
      said(SPEAR, "0:18–0:24", "Spears of similar damage cost '50 divs plus' on trade."),
    ],
  }),
  wand_cold_skills_sorcery_desecrate: draft({
    sources: [COLD_WAND],
    hitRateBasis: { basis: "unknown", n: null, note: "Curated: every step lands; 0.6 shades the reveal, since RePoE lists three Amanamu wand prefixes." },
    kbRuleRefs: ["§4", "§5", "§7"],
    durability: {
      why_it_works:
        "The Liege guarantees an Amanamu desecration and Sinistral puts it on a prefix, so with the essence's Spell Damage the prefixes are set before any random slam; (74–89)% increased Elemental Damage is one of three Amanamu wand prefixes in RePoE.",
      breaks_when: [
        "A patch changes the Amanamu wand prefix pool.",
        "Cold-spell builds (Grim Pillar) leave the meta.",
        "Omen of the Liege prices spike.",
      ],
      claim: {
        v: "syn",
        src: [`${POE2DB}Omen_of_the_Liege`, `${POE2DB}Omen_of_Sinistral_Necromancy`, `${POE2DB}Greater_Essence_of_Sorcery`],
        note: "Item texts and the RePoE wand pool; the creator's 'the Amanamu prefix' is narrower than RePoE.",
      },
    },
    creatorClaims: [said(COLD_WAND, "20:34–20:41", "His Grim Pillar DPS went from 5.2k to 7k with this league-start wand.")],
  }),
  wand_ilvl80_perfect_orb_lottery: draft({
    sources: [LOTTERY],
    hitRateBasis: { basis: "creator_claim", n: 41, note: "The creator hit 6 of 41 bases across four hit kinds (2:41–2:47); the T1 Spell Damage leg is taken as about a third of those." },
    kbRuleRefs: ["§1", "§3"],
    durability: {
      why_it_works:
        "Perfect orbs never roll below modifier level 70, so on an ilvl-80 Dueling Wand every roll is a high tier, and ilvl 80 is the last item level before the ilvl-81 tiers (+5 element-spell suffixes) that would spoil later Whittles. A hit is a fracture base other crafters pay for.",
      breaks_when: [
        "Dueling Wand base prices rise — the creator says his own videos cause short spikes (29:17–30:00).",
        "Perfect Transmutation or Augmentation prices rise.",
        "Fewer crafters buy ilvl-80 fracture bases.",
        "A patch moves the ilvl-80/81 tier gates or the Perfect-orb floors.",
      ],
      claim: {
        v: "syn",
        src: [`${POE2DB}Perfect_Orb_of_Augmentation`],
        note: "Floors from KB §1 (poe2db); tier levels from the committed RePoE snapshot. The demand for ilvl-80 bases is the creator's.",
      },
    },
    creatorClaims: [
      said(LOTTERY, "2:41–3:31", "6 hits from 41 bases; about 70 div spent, about 295 div back so far."),
      said(LOTTERY, "6:46–8:03", "A T1 Spell Damage hit is '80 divs just with the spell damage'; spell-crit-only bases 25–30 div."),
      said(LOTTERY, "18:28–18:59", "The cheapest T1 Spell Damage wands list at 80 div; he calls 100 the baseline."),
      said(LOTTERY, "21:58–22:06", "30%-quality bases list at 55, 70 and 100 div."),
      said(LOTTERY, "25:31–26:57", "His summary: about 70 div spent for a ~245 div profit, in about an hour."),
    ],
  }),
  wand_plus4_alloy_fracture: draft({
    sources: [PLUS4],
    hitRateBasis: { basis: "unknown", n: null, note: "KB §2: 1 in 3 per mod with a desecrated blocker; the leg prices only the fractured +4." },
    kbRuleRefs: ["§1", "§2", "§4", "§5", "§7"],
    durability: {
      why_it_works:
        "Astrid's Creativity lets two crafted alloy mods sit next to the +4, and a desecrated blocker makes the fracture 1 in 3 per mod, so every outcome is a sellable fractured wand. It rests on two demonstrated, undocumented interactions: Omen of Crystallisation steering an alloy, and a fracture landing on a crafted mod.",
      breaks_when: [GGG_ALLOY_BUG, "Fracturing a crafted mod gets blocked.", "Astrid's Creativity or alloy prices rise.", "+level spell wands lose demand."],
      claim: {
        v: "uv",
        src: [FORUM_ALLOY, `${POE2DB}Astrids_Creativity`],
        note: "Astrid's 'Can have 1 additional Crafted Modifiers' is verified; Crystallisation on alloys is creator/player-demonstrated (forum 3949532) and fracturing a crafted mod is creator-only.",
      },
    },
    creatorClaims: [
      said(PLUS4, "0:31–0:40", "Paid 61 div for the magic +4 base."),
      said(PLUS4, "21:09–22:05", "Making the +4 base yourself costs ~186 Perfect Augs + ~93 Annuls, about 75 div."),
      said(PLUS4, "25:59–26:58", "Fractured +4 ≈ 400 div, fractured +1/mana ≈ 150 div, fractured cast speed ≈ 55 div — 'even if you miss you basically make your money back'."),
    ],
  }),
};

const OTHERS: Record<string, RecipeProvenance> = {
  ring_gold_rarity_opulence: draft({
    sources: [GOLD_RING],
    hitRateBasis: { basis: "unknown", n: null, note: "Curated: the essence and the desecration always land; 0.8 covers an unusable resistance reveal." },
    kbRuleRefs: ["§4", "§5", "§7", "§8"],
    durability: {
      why_it_works:
        "Three rarity sources stack on one ring — the Gold Ring implicit, a rarity prefix and the essence's rarity suffix — while the desecration slot adds a resistance, so a farmer gains rarity without giving up resistances.",
      breaks_when: ["The Gold Ring implicit or the Opulence ring mod changes.", "Preserved Collarbone prices spike.", "Item rarity stops paying for farming builds."],
      claim: {
        v: "syn",
        src: [`${POE2DB}Greater_Essence_of_Opulence`, `${POE2DB}Omen_of_Dextral_Necromancy`],
        note: "Implicit and mod pools from RePoE; that a suffix-rarity base blocks the essence is creator-only.",
      },
    },
    creatorClaims: [
      said(GOLD_RING, "1:11–1:20", "Paid about 5 div for the base; a 'Magpie's Gold Ring of Ice' is cheaper."),
      said(GOLD_RING, "5:51–5:56", "Item rarity on his character went from 68% to 93%."),
    ],
  }),
  shield_armour_fracture: draft({
    sources: [SHIELD],
    hitRateBasis: { basis: "unknown", n: null, note: "KB §2's 1 in 3 with a blocker, shaded for corrupting infusers. The creator calls his run unrepeatably lucky." },
    kbRuleRefs: ["§1", "§2", "§4", "§5", "§7"],
    durability: {
      why_it_works:
        "Shield Wall adds '5 to 7 Physical Damage per 15 Armour on Shield' (RePoE), so Shield Wall builds pay for shield Armour. The blocker makes the fracture 1 in 3, and rolling the flat Armour before the fracture keeps the best value, because fractured values are Divine-proof.",
      breaks_when: [
        "Shield Wall's damage per shield Armour is nerfed.",
        "Ancient Rib or Omen of Light prices spike.",
        "Vaal Armourer's Infuser behaviour changes.",
      ],
      claim: { v: "syn", src: [`${POE2DB}Fracturing_Orb`], note: "Shield Wall's stat text is from the committed RePoE snapshot; fracture rules from KB §2." },
    },
    creatorClaims: [
      said(SHIELD, "0:29–0:55", "Warns that his luck on this shield is not repeatable."),
      said(SHIELD, "8:21–8:26", "Each desecration reroll costs about 8 div."),
      said(SHIELD, "9:21–9:43", "The whole craft cost him ~20 div; a comparable shield with full resistances lists at 228 div."),
    ],
  }),
  jewel_liquid_fear_4mod_budget: draft({
    sources: [JEWELS],
    hitRateBasis: { basis: "creator_claim", n: null, note: "The creator: 'a 50% chance' that the liquid keeps your good suffix (3:17–3:25, 8:30–8:35)." },
    kbRuleRefs: ["§6"],
    durability: {
      why_it_works:
        "A 4-mod jewel with one junk mod sells like a 3-mod jewel. Concentrated Liquid Fear adds a crafted attack Critical Damage Bonus suffix and — on the creator's footage — removes one of the two suffixes 50/50, so about half the attempts turn the junk into a fourth good mod.",
      breaks_when: [
        "The liquid costs more than half the uplift from a 3-mod to a 4-mod jewel.",
        "A patch changes which mod a Liquid Emotion removes (KB §6 (a) is still unverified).",
        "Attack-crit builds fall out of the meta.",
      ],
      claim: { v: "uv", src: [`${POE2DB}Concentrated_Liquid_Fear`], note: "The item text is verified; the same-side 50/50 removal is the creator's footage and KB §6 (a)'s unverified model." },
    },
    creatorClaims: [
      said(JEWELS, "8:36–9:11", "A 100-exalt base plus a ~40-exalt liquid became a 6–7 div jewel; about half a divine per attempt."),
      said(JEWELS, "22:14–22:21", "Budget jewels sold for 2–5 div."),
    ],
  }),
  ring_dusk_four_flat: draft({
    sources: [DUSK],
    hitRateBasis: { basis: "creator_claim", n: 8, note: "2 of 8 fractures hit in the video (7:36–8:45); KB §2 gives 1 in 3." },
    kbRuleRefs: ["§1", "§2", "§4", "§5", "§8"],
    durability: {
      why_it_works:
        "The Dusk Ring is the only ring with a fourth prefix slot ('+1 Prefix Modifier allowed / -1 Suffix Modifier allowed'), so only it carries four flat attack prefixes. A fractured T1 flat and a desecrated 4th flat make two of them deterministic, and Reaver quality with Catalysing Exaltation biases a third.",
      breaks_when: [
        GGG_ALLOY_BUG,
        "The Dusk Ring implicit changes.",
        "Ancient Collarbone or Omen of Light prices spike — the 4th-flat loop took the creator ~10 tries.",
        "Attack builds move away from flat added damage.",
      ],
      claim: {
        v: "uv",
        src: [FORUM_ALLOY],
        note: "The Dusk Ring implicit is verified (item text); the Breach-essence and Swift Alloy steps rely on Crystallisation steering, creator/player-demonstrated only (forum 3949532).",
      },
    },
    creatorClaims: [
      said(DUSK, "0:56–1:13", "Sold one for 500 div; a normal run costs about 100 div."),
      said(DUSK, "7:36–8:45", "Missed 6 fractures in a row before 2 of 8 hit; his league record is 16 misses."),
      said(DUSK, "17:30–19:03", "Listed this ring at 599 div; perfect ones sell around 1k; fractured T1-flat Dusk bases ~150 div; this run cost 500+ div."),
    ],
  }),
  boots_es_ms_spirit_fracture: draft({
    sources: [BOOTS],
    hitRateBasis: { basis: "unknown", n: null, note: "Curated: a useless fracture drops the base, and a finished pair must still carry the 35% MS + mana the leg searches; the prefix loops add cost, not misses." },
    kbRuleRefs: ["§1", "§2", "§3", "§4", "§5", "§7"],
    durability: {
      why_it_works:
        "35% Movement Speed boots are wanted by every build. Astrid's Creativity lets two guaranteed crafted suffixes — Spirit and socketed-augment effect — sit next to a fractured suffix, and the desecration and slam routes make the prefixes near-deterministic.",
      breaks_when: [
        "The mana-stacker meta fades and mana on boots loses value.",
        "Ancient Rib or Omen of Light prices spike.",
        "Astrid's Creativity or Mystic Alloy prices rise.",
        "A patch changes how many crafted mods Astrid's Creativity allows.",
      ],
      claim: {
        v: "syn",
        src: [`${POE2DB}Astrids_Creativity`, `${POE2DB}Mystic_Alloy`, `${POE2DB}Essence_of_Horror`],
        note: "Item texts verified in the 2026-10-01 fact-check; skipping the Crystallisation omen on full prefixes is creator-only.",
      },
    },
    creatorClaims: [
      said(BOOTS, "1:01–1:24", "Earlier pairs sold for 100 div and 50 div."),
      said(BOOTS, "21:00–22:17", "Five pairs cost ~300–400 div; unsanctified they price at ~100–150 div each."),
      said(BOOTS, "22:29–23:10", "Sanctified Movement Speed rolled 38/32/36/37/35."),
    ],
  }),
};

/** The 2026-10-01 wave. */
export const WAVE3_PROVENANCE: Record<string, RecipeProvenance> = { ...WEAPONS, ...OTHERS };
