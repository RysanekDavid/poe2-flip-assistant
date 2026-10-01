import type { RecipeProvenance, RecipeSource } from "./craftProvenance/schema";

/**
 * Provenance for the 2026-09-30 recipe expansion (craftRecipeData4.ts + craftRecipeData5.ts), merged
 * into craftProvenanceData.ts and validated there. Kept apart for the 500-line cap.
 *
 * Every URL, title, author and date below was fetched on 2026-09-29; nothing is inferred. Video
 * creators are the oEmbed author_name committed in docs/kb/sources/oembed.json (E1-E5). No video has
 * an upload date we could read, except the two mana-ring videos, whose dates come from a search
 * listing ("14 days ago" / "15 days ago" on 2026-09-29, so ±1 day). We read the Exile Codex summaries
 * of the Barczi, POEGuy and Scorpius videos, not the videos. We have NOT reviewed the SaVeQ and
 * WesDesu mana-ring videos: they are listed because their titles place the craft in 0.5/0.5.5,
 * and every step that rests on the ring write-up alone carries an `unverified` badge.
 *
 * Tiers: "primary" = the creator's own video; "secondary" = a write-up of someone's craft (the
 * compilation, Exile Codex, Forge of Exiles, p2pah, Mobalytics). Real-money-trading shops are never cited
 * (RMT_DOMAINS in src/lib/claim.ts; the schema rejects them). Exile Codex pages print
 * only a "Last updated" date; that printed date is used (precision exact, read from the page).
 *
 * Second wave (2026-09-30, craftRecipeData6.ts + craftRecipeData7.ts): every recipe is one entry of
 * the compilation's index.html, re-fetched on 2026-09-30 (still the 2026-06-10 commit). Its gloves_003
 * credits "LoK HoL (YouTube)"; we matched that to Lolcohol's "PoE 2 0.5 - Crafting EXPLODE GLOVES for
 * Martial Artist" (oEmbed E6) by title and name — our inference. We read that video's watch page
 * (upload date, description), not the video. Its quarterstaff_003 credits "Dopamine Hunter (YouTube)";
 * no matching video was found, so that credit is an anecdote.
 */

function guide(title: string, url: string, creator: string | null, date: string | null, datePrecision: RecipeSource["datePrecision"]): RecipeSource {
  return { kind: "guide", title, url, creator, date, datePrecision, tier: "secondary", ref: null };
}

function video(title: string, url: string, creator: string, listingDate: string | null): RecipeSource {
  return { kind: "video", title, url, creator, date: listingDate, datePrecision: listingDate === null ? null : "listing", tier: "primary", ref: null };
}

/** fixerpimp-gamer's compilation; the date is the last commit of index.html (GitHub API). */
export const COMPILATION = guide(
  "POE2_0.5_Craft_Guides — community recipe compilation (index.html v0.2)",
  "https://github.com/fixerpimp-gamer/POE2_0.5_Craft_Guides",
  "fixerpimp-gamer",
  "2026-06-10",
  "exact",
);

const FORGE_HELMET = guide(
  "Budget ES Helmet — Essence + Hybrid %ES/Life (Fubgun 0.5)",
  "https://www.forgeofexiles.com/guides/budget-es-helmet-essence-hybrid-es-life-fubgun-0-5",
  "tihyo",
  "2026-07-21",
  "exact",
);
const CODEX_BARCZI = guide("Easy Energy Shield Crafting For Profit | PoE 2 0.5", "https://exile.codex-wiki.com/guides/easy-energy-shield-crafting-for-profit-poe-2-0-5", null, "2026-06-06", "exact");
const BARCZI = video("Easy Energy Shield Crafting For Profit | PoE 2 0.5", "https://www.youtube.com/watch?v=T5Yt4Sa1jDA", "Barczi POE2", null);
const CODEX_POEGUY = guide(
  "[PoE 2] Endgame Crossbow Crafting Guide - for POEGuy's Warbringer Mortar Cannon Build.",
  "https://exile.codex-wiki.com/builds/poe-2-endgame-crossbow-crafting-guide-for-poeguys",
  null,
  "2026-06-04",
  "exact",
);
const POEGUY = video("[PoE 2] Endgame Crossbow Crafting Guide - for POEGuy's Warbringer Mortar Cannon Build.", "https://www.youtube.com/watch?v=dbgOKCI5tOk", "POEGuy", null);
const P2PAH_RING = guide(
  "How to Craft Mana Stacking Rings in Path of Exile 2",
  "https://www.p2pah.com/blog/path-of-exile-2/1893-how-to-craft-mana-stacking-rings-in-path-of-exile-2.html",
  null,
  "2026-03-28",
  "exact",
);
const SAVEQ = video("Poe2-0.5.5 How to Profit craft Mana Stacking Rings", "https://www.youtube.com/watch?v=9kKdoq0tZXg", "SaVeQ", "2026-09-15");
const WESDESU = video(
  "The mana stacker ring craft that made me 2 mirrors in PoE2 0.5 (and are still good in 0.5.5)",
  "https://www.youtube.com/watch?v=yHxcpQiNihg",
  "WesDesu",
  "2026-09-14",
);
const CODEX_SCORPIUS = guide(
  "POE2 Time-Lost Jewels | Complete Crafting Breakdown",
  "https://exile.codex-wiki.com/builds/poe2-time-lost-jewels-complete-crafting-breakdown",
  null,
  "2026-06-24",
  "exact",
);
const SCORPIUS = video("POE2 Time-Lost Jewels | Complete Crafting Breakdown", "https://www.youtube.com/watch?v=W4RuaAJYoZc", "Scorpius", null);
// Fetch returned 403; the step list is the search snippet, the date a search listing.
const MOBALYTICS_LA = guide("0.5 Fubgun Lightning Arrow Deadeye - PoE 2 Ranger Build Guide", "https://mobalytics.gg/poe-2/builds/lightning-arrow-farmer-fubgun", null, "2026-06-18", "listing");
const FORGE_SOIS = guide(
  "+4 Spell Skills Amulet — Breach Quality Tech ~1 div (Sois 0.5)",
  "https://www.forgeofexiles.com/guides/4-spell-skills-amulet-breach-quality-tech-1-div-sois-0-5",
  "tihyo",
  "2026-07-21",
  "exact",
);

// The watch page's uploadDate / datePublished (2026-06-04T02:55:52-07:00), read 2026-09-30 → exact.
const LOLCOHOL: RecipeSource = {
  kind: "video",
  title: "PoE 2 0.5 - Crafting EXPLODE GLOVES for Martial Artist",
  url: "https://www.youtube.com/watch?v=e-MihyBNVd4",
  creator: "Lolcohol",
  date: "2026-06-04",
  datePrecision: "exact",
  tier: "primary",
  ref: null,
};
const DOPAMINE_HUNTER: RecipeSource = {
  kind: "video",
  title: "Dopamine Hunter quarterstaff craft credited by the compilation (quarterstaff_003), video not located",
  url: null,
  creator: "Dopamine Hunter",
  date: null,
  datePrecision: null,
  tier: "anecdote",
  ref: null,
};

const NO_ODDS = "Curated estimate: the sources state no hit odds.";
const ONE_ENTRY = "A single compilation entry, which states no odds.";

/** Second-wave recipes backed by the compilation entry alone. */
function compilationOnly(note: string, kbRuleRefs: string[], basis: "unknown" | "creator_claim" = "unknown"): RecipeProvenance {
  return { patchVerified: "0.5.5b", status: "draft", sources: [COMPILATION], hitRateBasis: { basis, n: null, note }, extraEntityRefs: [], kbRuleRefs };
}

const BOW_WAVE2 = compilationOnly(`${ONE_ENTRY} The essence and exalts always land; about half the Sinistral reveals give a flat-damage prefix (our estimate).`, ["§1", "§4", "§5", "§7"]);

/** Second wave (2026-09-30): the compilation's gloves_003, bow_001/002, quarterstaff_003, boots_003, body_armour_003, belt_001, ring_001. */
const WAVE2_PROVENANCE: Record<string, RecipeProvenance> = {
  gloves_putrefaction_decay: {
    patchVerified: "0.5.5b",
    status: "draft",
    sources: [COMPILATION, LOLCOHOL],
    hitRateBasis: { basis: "unknown", n: null, note: "Curated: the putrefaction slot machine's ~1 in 3, shaded to 0.2 because the leg values one of the five Decay prefix families." },
    extraEntityRefs: [],
    kbRuleRefs: ["§4", "§5", "§9"],
  },
  bow_abrasion_desecrated_prefix: BOW_WAVE2,
  bow_seeking_desecrated_prefix: BOW_WAVE2,
  quarterstaff_flames_desecrated_prefix: {
    ...compilationOnly(`${ONE_ENTRY} Every step lands; the reveal decides whether a % damage prefix joins the flat line.`, ["§4", "§5", "§7"]),
    sources: [COMPILATION, DOPAMINE_HUNTER],
  },
  boots_evasion_ms_ruin: compilationOnly(`${ONE_ENTRY} The base already carries 35% MS; the reveal and the exalts set the price band.`, ["§1", "§3", "§4", "§5", "§7"]),
  armour_evasion_es_body_essence: compilationOnly(`${ONE_ENTRY} A ~1 ex base where every step lands; the reveal and the resistances set the sale.`, ["§4", "§5", "§7"]),
  belt_life_res_desecrated_hybrid: compilationOnly(
    "The compilation: '3/4 chance to hit Elemental+Chaos mod of chosen element' — RePoE's four boss suffixes per belt fit it only if all three reveal options come from the chosen boss (unverified) and assuming equal spawn weights. 0.6 shades it for the open K6 belt question (probable by internal id, still an inference); a miss still sells.",
    ["§4", "§5", "§7"],
    "creator_claim",
  ),
  ring_prismatic_catalyst_attack: compilationOnly(
    `${ONE_ENTRY} Two exalt slams must each land a damage line; its '3/4' hybrid odds are the belt's, and RePoE gives rings 3/4 only for the Ulaman hybrid (4/5/6 boss suffixes; equal spawn weights assumed).`,
    ["§3", "§4", "§5", "§7", "§8"],
  ),
};

const VILE_ROBE: RecipeProvenance = {
  patchVerified: "0.5.5b",
  status: "draft",
  sources: [COMPILATION, CODEX_BARCZI, BARCZI],
  hitRateBasis: { basis: "unknown", n: null, note: `${NO_ODDS} The essence and exalts always complete; about half the robes land enough resistance to clear the band.` },
  extraEntityRefs: [],
  kbRuleRefs: ["§1", "§3", "§4", "§5", "§7"],
};

/** Every expansion recipe except the putrefaction quiver, which reuses the boots entry's shape. */
export const EXPANSION_PROVENANCE: Record<string, RecipeProvenance> = {
  helmet_tiara_es: {
    patchVerified: "0.5.5b",
    status: "draft",
    sources: [COMPILATION, FORGE_HELMET],
    hitRateBasis: { basis: "unknown", n: null, note: `${NO_ODDS} We assume ~1 in 3 white Tiaras land T1 flat ES from a Perfect Transmute or Aug; the rest of the craft is guaranteed.` },
    extraEntityRefs: [],
    kbRuleRefs: ["§1", "§3", "§4", "§5", "§7"],
  },
  armour_vile_robe_spirit: VILE_ROBE,
  armour_vile_robe_es: VILE_ROBE,
  crossbow_sovereign_ballista: {
    patchVerified: "0.5.5b",
    status: "draft",
    sources: [COMPILATION, CODEX_POEGUY, POEGUY],
    hitRateBasis: { basis: "unknown", n: null, note: `${NO_ODDS} The reveal is the gate. Sovereign + Sinistral should show three Ulaman options and RePoE has only two Ulaman crossbow prefixes, so the ballista is almost always offered — unverified, so 0.6 rather than ~0.9.` },
    extraEntityRefs: [],
    kbRuleRefs: ["§1", "§4", "§5", "§7"],
  },
  ring_breach_mana_stacker: {
    patchVerified: "0.5.5b",
    status: "draft",
    sources: [P2PAH_RING, SAVEQ, WESDESU],
    hitRateBasis: { basis: "unknown", n: null, note: `${NO_ODDS} Every gate is a retry loop; the minion-damage reveal and the resistance slams decide the sale.` },
    extraEntityRefs: [],
    kbRuleRefs: ["§1", "§2", "§4", "§5", "§7", "§8"],
  },
  jewel_timelost_fractured_radius: {
    patchVerified: "0.5.5b",
    status: "draft",
    sources: [CODEX_SCORPIUS, SCORPIUS],
    hitRateBasis: { basis: "creator_claim", n: null, note: "Codex summary of Scorpius: ≈1-in-3 to lock the radius with the desecration present — KB §2's odds with a blocker." },
    extraEntityRefs: [],
    kbRuleRefs: ["§1", "§2", "§5", "§6"],
  },
  amulet_plus3_spirit_chaos: {
    patchVerified: "0.5.5b",
    status: "draft",
    sources: [COMPILATION, MOBALYTICS_LA],
    hitRateBasis: { basis: "unknown", n: null, note: `${NO_ODDS} The Spirit chaos loop runs until done; the resistance slams swing the sale.` },
    extraEntityRefs: [],
    kbRuleRefs: ["§1", "§2", "§4", "§5", "§7", "§8"],
  },
  amulet_plus4_breach_quality: {
    patchVerified: "0.5.5b",
    status: "draft",
    sources: [COMPILATION, FORGE_SOIS],
    hitRateBasis: { basis: "unknown", n: null, note: "A guess: nothing confirms that catalyst quality turns +3 into +4 (KB conflict K4)." },
    extraEntityRefs: [],
    kbRuleRefs: ["§4", "§5", "§7", "§8"],
  },
  ...WAVE2_PROVENANCE,
};
