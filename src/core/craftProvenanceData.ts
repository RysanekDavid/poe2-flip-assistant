import { recipeProvenanceSchema, type RecipeProvenance, type RecipeSource } from "./craftProvenance/schema";
import { COMPILATION, EXPANSION_PROVENANCE } from "./craftProvenanceData2";

/**
 * Structured provenance for every curated recipe, migrated from the free-text `source` strings the
 * craftRecipeData*.ts files used to carry. Kept apart because those files sit near the 500-line cap.
 *
 * Creators are the YouTube channel names confirmed via oEmbed on 2026-09-29; the responses are
 * committed in docs/kb/sources/oembed.json. oEmbed carries no upload date: video dates come from
 * search-index listings (datePrecision "listing", may be a day off) and are null where no listing
 * showed one. URLs come from docs/kb/sources/transcripts/index.json, except S21, whose
 * transcript was pasted without a URL and was matched by its exact title through oEmbed. The old
 * strings credited Fubgun with the S8 wand and S9 bow/quarterstaff videos; oEmbed says XTheFarmerX.
 *
 * patchVerified 0.5.5b: every guide was corrected against the KB and the RePoE catalog on
 * 2026-09-26..29, when the committed game data was 0.5.5b. "reviewed" additionally needs a located
 * source and no step flagged `unverified` (and no step prose admitting it, test:craft-provenance);
 * everything else stays "draft".
 */

const TRANSCRIPTS = "docs/kb/sources/transcripts";
const KB_DOC = "docs/research/poe2-crafting-knowledge.md";

function video(title: string, url: string, creator: string, date: string | null, transcript: string): RecipeSource {
  const datePrecision = date === null ? null : "listing";
  return { kind: "video", title, url, creator, date, datePrecision, tier: "primary", ref: `${TRANSCRIPTS}/${transcript}` };
}

const S4 = video("How to Craft The Best Jewels in The Game (5 mods)", "https://www.youtube.com/watch?v=NK-Oat_OtgQ", "Fubgun", "2026-06-13", "04-how-to-craft-the-best-jewels-in-the-game-5-mods-path-of-exil.txt");
const S5 = video("How To Craft The Best Gloves in The Game, +2 Projectiles", "https://www.youtube.com/watch?v=xu5UpEE8UP8", "Fubgun", "2026-06-08", "05-how-to-craft-the-best-gloves-in-the-game-2-projectiles-ice-s.txt");
const S8 = video("How To Craft Your Mid Budget and High End BiS Wands For STUPIDLY CHEAP!", "https://www.youtube.com/watch?v=SlwiQGb5l4U", "XTheFarmerX", "2026-06-20", "08-how-to-craft-your-mid-budget-and-high-end-bis-wands-for-stup.txt");
const S9 = video("Easy Bow/Spear/Quarterstaff Craft | Step By Step Crafting Guide", "https://www.youtube.com/watch?v=ZEXG6K_7Nyg", "XTheFarmerX", "2026-05-31", "09-easy-bow-spear-quarterstaff-craft-step-by-step-crafting-guid.txt");
const S10 = video("Stupidly Easy Putrefaction \"Craft\" For BiS League Start Gear", "https://www.youtube.com/watch?v=Gdc5I2BmBGY", "XTheFarmerX", null, "10-stupidly-easy-putrefaction-craft-for-bis-league-start-gear-i.txt");
const S11 = video("Beginner, Intermediate, and Expert Level Amulet Craft Guide", "https://youtu.be/J7PxG6k6gts", "XTheFarmerX", "2026-06-03", "11-beginner-intermediate-and-expert-level-amulet-craft-guide-fu.txt");
const S20 = video("NAUČ SE CRAFTIT NEJLEPŠÍ JEWELY V POE 2", "https://youtu.be/o0Q975G2s2g", "Pavel na Netu", null, "19-nau-se-craftit-nejlep-jewely-v-poe-2.txt");
const S21 = video("Attack ring craft PERFECTED! PoE 2 - 0.5", "https://www.youtube.com/watch?v=TWgmQuiLeHA", "Keyson", "2026-07-07", "21-attack-ring-craft-perfected-0-5.txt");

/** Our own in-game burns (KB §9): the bone-tier cap and the putrefaction wipe. */
const OWN_TEST: RecipeSource = {
  kind: "in_game",
  title: "Own test: Gnawed Rib refused on ilvl 82 boots; putrefaction wipes the base's mods",
  url: null,
  creator: null,
  date: "2026-07-13",
  datePrecision: "exact",
  tier: "primary",
  ref: `${KB_DOC} §9`,
};

function anecdote(kind: RecipeSource["kind"], title: string, creator: string | null): RecipeSource {
  return { kind, title, url: null, creator, date: null, datePrecision: null, tier: "anecdote", ref: null };
}

const NO_ODDS = "Curated estimate: the source demonstrates the craft but states no hit odds.";

// The boots guides also rely on the open KB §5 reveal question (family blocking) → draft;
// the body-armour guide makes no such claim and stays reviewed.
const PUTREFACTION_BOOTS: RecipeProvenance = {
  patchVerified: "0.5.5b",
  status: "draft",
  sources: [S10, OWN_TEST],
  hitRateBasis: { basis: "unknown", n: null, note: "Curated ~1-in-3 sellable estimate for the six-mod slot machine; the video shows outcomes, not a rate." },
  extraEntityRefs: [],
  kbRuleRefs: ["§4", "§5", "§9"],
};

const DATA: Record<string, RecipeProvenance> = {
  jewel_suffix_push: {
    patchVerified: "0.5.5b",
    status: "draft",
    sources: [anecdote("guide", "Crafting chat transcript (Contempt → +1 suffix → cranium → annul → chaos prefixes)", null)],
    hitRateBasis: { basis: "unknown", n: null, note: "Curated estimate: the chat names no odds; Ancient Contempt's suffix-vs-prefix grant is the main gate (KB §6)." },
    extraEntityRefs: [],
    kbRuleRefs: ["§5", "§6"],
  },
  bow_amanamu: {
    patchVerified: "0.5.5b",
    status: "reviewed",
    sources: [S9],
    hitRateBasis: { basis: "unknown", n: null, note: `${NO_ODDS} The Liege-forced reveal is suffix-only; Attack Speed is the jackpot (KB §5).` },
    extraEntityRefs: [],
    kbRuleRefs: ["§4", "§5"],
  },
  ring_catalysing_exalt: {
    patchVerified: "0.5.5b",
    status: "draft",
    sources: [anecdote("video", "XTheFarmerX ring craft (Tul's 20% → catalysing + greater exaltation → collarbone), video not located", "XTheFarmerX")],
    hitRateBasis: { basis: "unknown", n: null, note: "Curated estimate; the catalyst bias is a weight (5× at 20%), not a guarantee (KB §4, §8)." },
    extraEntityRefs: [],
    kbRuleRefs: ["§4", "§8"],
  },
  amulet_fracture_plus3: {
    patchVerified: "0.5.5b",
    // base leg corrected to MAGIC on 2026-09-29; the finish still leans on an unconfirmed catalyst claim
    status: "draft",
    sources: [S11],
    hitRateBasis: { basis: "creator_claim", n: null, note: "S11: ~1-in-3 to lock the +3 with a desecrated blocker at exactly 4 mods; KB §2 confirms the mechanic." },
    extraEntityRefs: [],
    kbRuleRefs: ["§2", "§4", "§5"],
  },
  focus_rathpith_gamble: {
    patchVerified: "0.5.5b",
    status: "draft",
    sources: [
      anecdote("video", "Blood Mage showcase video (double-mana \"wrath pit\" Rathpith), video not located", null),
      { kind: "kb", title: "Rathpith Globe cultivated mod pool", url: "https://www.poe2wiki.net/wiki/Rathpith_Globe", creator: null, date: null, datePrecision: null, tier: "secondary", ref: "docs/kb/breach.md" },
    ],
    hitRateBasis: { basis: "unknown", n: null, note: "Curated long-shot estimate; players report 300+ div spent without the double-mana hit." },
    extraEntityRefs: ["unique-rathpith-globe"],
    kbRuleRefs: ["§1"],
  },
  boots_putrefaction: PUTREFACTION_BOOTS,
  boots_putrefaction_ev: PUTREFACTION_BOOTS,
  armour_putrefaction: { ...PUTREFACTION_BOOTS, status: "reviewed" },
  gloves_projectile_plus2: {
    patchVerified: "0.5.5b",
    status: "draft",
    sources: [S5],
    hitRateBasis: { basis: "creator_claim", n: null, note: "S5: the fracture locks the +2 about 1-in-3; 0.2 folds in the finish's brick risk." },
    extraEntityRefs: [],
    kbRuleRefs: ["§2", "§5"],
  },
  wand_alloy_crystallisation: {
    patchVerified: "0.5.5b",
    status: "draft",
    sources: [S8],
    hitRateBasis: { basis: "creator_claim", n: null, note: "S8: the final T1 'gain' exalt lands about 1-in-3 to 1-in-4; a miss still sells as a mid wand." },
    extraEntityRefs: [],
    kbRuleRefs: ["§1", "§4", "§5", "§7"],
  },
  amulet_giga_spirit: {
    patchVerified: "0.5.5b",
    status: "draft",
    sources: [S11],
    hitRateBasis: { basis: "unknown", n: null, note: "Curated estimate: S11's Spirit chaos hunt runs until it lands (T1 ~200–300 chaos, T2 in ~30); the finishing slams swing the sale." },
    extraEntityRefs: [],
    kbRuleRefs: ["§1", "§4", "§5", "§8"],
  },
  quarterstaff_desecrate_crit: {
    patchVerified: "0.5.5b",
    status: "reviewed",
    sources: [S9],
    hitRateBasis: { basis: "unknown", n: null, note: `${NO_ODDS} A blind reveal from the normal pool, without the Liege-forced jackpot.` },
    extraEntityRefs: [],
    kbRuleRefs: ["§5", "§7"],
  },
  amulet_desecrated_beginner: {
    patchVerified: "0.5.5b",
    status: "reviewed",
    sources: [S11],
    hitRateBasis: { basis: "unknown", n: null, note: "Greater Essence of Opulence guarantees the T1-rarity result the leg searches; the Spirit jackpot is unpriced upside." },
    extraEntityRefs: [],
    kbRuleRefs: ["§1", "§4", "§5", "§7"],
  },
  ring_fractured_t1res: {
    patchVerified: "0.5.5b",
    status: "reviewed",
    sources: [S21],
    hitRateBasis: { basis: "unknown", n: null, note: "Curated estimate: the whittle loop runs until done, so variance sits in cost rather than in the hit." },
    extraEntityRefs: [],
    kbRuleRefs: ["§2", "§3", "§4", "§5"],
  },
  jewel_liquid_5mod_budget: {
    patchVerified: "0.5.5b",
    status: "draft",
    sources: [S20, S4],
    hitRateBasis: { basis: "creator_claim", n: 3, note: "S20: Contempt is \"always fifty-fifty\" (won 2 of 3), times a ~0.6 usable caster reveal." },
    extraEntityRefs: [],
    kbRuleRefs: ["§5", "§6", "§7"],
  },
  jewel_fractured_5mod: {
    patchVerified: "0.5.5b",
    status: "draft",
    sources: [S20, S4],
    hitRateBasis: { basis: "creator_claim", n: 5, note: "S20 locked 2 of 5 fractures, in line with KB §2's 1-in-3 with a blocker." },
    extraEntityRefs: [],
    kbRuleRefs: ["§2", "§5", "§6"],
  },
  // single compilation source for the quiver itself; the putrefaction mechanics are our own test (KB §9)
  quiver_putrefaction: {
    ...PUTREFACTION_BOOTS,
    sources: [COMPILATION, OWN_TEST],
    hitRateBasis: { basis: "unknown", n: null, note: "Curated ~1-in-3 estimate carried over from the boots/body slot machine; the compilation quotes a 2–12 div range, not a rate." },
  },
  ...EXPANSION_PROVENANCE,
};

/** Validated once at import: a malformed entry is a data bug and must stop the process. */
const PROVENANCE: Readonly<Record<string, RecipeProvenance>> = Object.fromEntries(
  Object.entries(DATA).map(([key, p]) => {
    const parsed = recipeProvenanceSchema.safeParse(p);
    if (!parsed.success) {
      const where = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      throw new Error(`craftProvenanceData ${key}: ${where}`);
    }
    return [key, parsed.data];
  }),
);

export const PROVENANCE_KEYS: readonly string[] = Object.keys(PROVENANCE);

/** The provenance of one recipe; throws for a recipe nobody documented. */
export function provenanceFor(key: string): RecipeProvenance {
  const p = PROVENANCE[key];
  if (!p) throw new Error(`craft recipe "${key}" has no provenance entry in craftProvenanceData.ts`);
  return p;
}
