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
 * compilation, Exile Codex, Forge of Exiles, POECurrency, p2pah, Mobalytics). Exile Codex pages only
 * print a "Last updated" date, which is not a publication date, so theirs are null.
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
const POECURRENCY_HELMET = guide(
  "Path of Exile 2 Patch 0.5.0 Helmet Crafting Strategy | From White Bases to High-Value Helmets",
  "https://www.poecurrency.com/news/poe-2-patch-0-5-0-helmet-crafting-strategy-from-white-bases-to-high-value-helmets",
  null,
  "2026-08-12",
  "exact",
);
const CODEX_BARCZI = guide("Easy Energy Shield Crafting For Profit | PoE 2 0.5", "https://exile.codex-wiki.com/guides/easy-energy-shield-crafting-for-profit-poe-2-0-5", null, null, null);
const BARCZI = video("Easy Energy Shield Crafting For Profit | PoE 2 0.5", "https://www.youtube.com/watch?v=T5Yt4Sa1jDA", "Barczi POE2", null);
const CODEX_POEGUY = guide(
  "[PoE 2] Endgame Crossbow Crafting Guide - for POEGuy's Warbringer Mortar Cannon Build.",
  "https://exile.codex-wiki.com/builds/poe-2-endgame-crossbow-crafting-guide-for-poeguys",
  null,
  null,
  null,
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
const CODEX_SCORPIUS = guide("POE2 Time-Lost Jewels | Complete Crafting Breakdown", "https://exile.codex-wiki.com/builds/poe2-time-lost-jewels-complete-crafting-breakdown", null, null, null);
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

const NO_ODDS = "Curated estimate: the sources state no hit odds.";

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
    sources: [COMPILATION, FORGE_HELMET, POECURRENCY_HELMET],
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
    hitRateBasis: { basis: "unknown", n: null, note: `${NO_ODDS} The reveal is the gate: the sources call the ballista guaranteed, RePoE lists two Ulaman crossbow prefixes.` },
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
};
