/*
 * Valid craft-mining examples for testCraftMining.ts, and the reference shapes extraction and
 * synthesis agents copy. Abridged on purpose: the extraction quotes real lines of transcript 36
 * (_sSjC5LX_Ck) but keeps only two steps, and the route/prior numbers exist to exercise the
 * schemas — none of this is committed research data.
 */
import type { CraftVideoExtraction, PriorsFile, RouteFile } from "../core/research/craftMining/schema";

const T31 = "docs/kb/sources/transcripts/31-attack-ring-craft-perfected-keyson.txt";
const T36 = "docs/kb/sources/transcripts/36-insane-end-game-rings-for-cheap-xthefarmerx.txt";

export const VALID_EXTRACTION: CraftVideoExtraction = {
  schema_version: 1,
  videoId: "_sSjC5LX_Ck",
  title: "How To Craft INSANE End Game Rings For CHEAP!",
  creator: "XTheFarmerX",
  publishedAt: null,
  transcriptRef: T36,
  patch: { stated: null, atUpload: null, outOfPatch: { flag: false, reasons: [], mechanics: [] } },
  language: "en",
  archetypes: ["ring-attack-flat"],
  base: {
    name: "unstated",
    ilvl: null,
    bought: true,
    boughtState: { fracturedMods: [], otherMods: ["tier one flat attack damage, ideally fire or lightning"] },
    priceClaim: { value: null, low: 1, high: 2, unit: "div", at: "0:49–0:53", quote: "I was paying one div for the open suffix and then two div for the good resistance rolls." },
    at: "0:21–0:25",
    quote: "buying a ton of these magic rings that have tier one of any flat on them.",
  },
  steps: [
    {
      order: 1,
      action: "other",
      materials: ["essence-of-opulence"],
      omens: [],
      side: null,
      target: { text: "tier one rarity", acceptedTiers: ["T1"] },
      at: "1:28–1:32",
      quote: "you're going to want to use an essence of opulence. This will guarantee you tier one rarity.",
      note: "Essence of Opulence on the rings that already rolled a resistance.",
    },
    {
      order: 2,
      action: "slam-fill",
      materials: ["tuls-catalyst", "greater-exalted-orb"],
      omens: ["omen-of-catalysing-exaltation", "omen-of-greater-exaltation"],
      side: null,
      target: { text: "flat cold damage to attacks", acceptedTiers: ["unstated"] },
      at: "1:49–1:59",
      quote: "catalyze all these rings with these cold catalysts, and then we're going to use an omen of catalyzing exaltation, an omen of greater exaltation",
      note: null,
    },
  ],
  missHandling: [],
  qualityPath: { catalyst: "tuls-catalyst", pct: null, orderNote: "Cold catalyst quality goes on right before the catalysed slam that consumes it.", at: "1:49–1:53" },
  measured: [
    {
      quantity: "multiplier",
      value: 2,
      low: null,
      high: null,
      n: null,
      howMeasured: "statement",
      context: "20% catalyst quality on a ring with Omen of Catalysing Exaltation; the ~300-400 attempts are someone else's, not counted on screen.",
      at: "2:48–3:03",
      quote: "There was testing done to the tune of like three or 400 attempts with 20% and 40% quality on rings",
    },
    {
      quantity: "hit_rate",
      value: 0.056,
      low: null,
      high: null,
      n: null,
      howMeasured: "table_reading",
      context: "flat cold damage weight 3,900 of a 69,000 ring pool, read off a weight table",
      at: "2:44–2:48",
      quote: "normally flat cold damage has a 3,900 weighting out of a pool of 69,000",
    },
  ],
  claims: [
    {
      kind: "cost",
      text: "base price: 1 div with an open suffix, 2 div with a good resistance roll",
      value: null,
      low: 1,
      high: 2,
      unit: "div",
      material: null,
      dateContext: "Runes of Aldur, at upload",
      at: "0:49–0:53",
      quote: "I was paying one div for the open suffix and then two div for the good resistance rolls.",
    },
  ],
  salvage: [],
  caveats: ["Expects to craft two or three rings to hit one (1:04–1:05)."],
  unresolved: ["Which orb 'perfect all the open suffix rings' means (1:07–1:08)."],
};

const keysonClaim = (text: string, at: string) => ({ text, at, sourceRef: T31 });

export const VALID_ROUTE_FILE: RouteFile = {
  schema_version: 1,
  archetype: "ring-attack-flat",
  templates: [
    {
      id: "ring-attack-flat-high",
      archetype: "ring-attack-flat",
      itemClass: "Rings",
      bases: ["Gold Ring", "Breach Ring"],
      tier: "high",
      patch: { verified_against: "0.5.5b", leagues: ["Runes of Aldur"], stamped_at: "2026-10-05" },
      status: "draft",
      targetRoles: [
        {
          id: "attack-flats",
          side: "prefix",
          count: 3,
          anyOf: [
            { family: "PhysicalDamage", label: "Adds # to # Physical Damage to Attacks", source: "natural" },
            { family: "FireDamage", label: "Adds # to # Fire damage to Attacks", source: "natural" },
            { family: "ColdDamage", label: "Adds # to # Cold damage to Attacks", source: "natural" },
            { family: "LightningDamage", label: "Adds # to # Lightning damage to Attacks", source: "natural" },
          ],
          minTier: 3,
          note: null,
        },
        {
          id: "useful-suffixes",
          side: "suffix",
          count: 2,
          anyOf: [
            { family: "FireResistance", label: "+#% to Fire Resistance", source: "natural" },
            { family: "ItemFoundRarityIncrease", label: "#% increased Rarity of Items found", source: "natural" },
            { family: "IncreasedAttackSpeed", label: "#% increased Attack Speed", source: null },
          ],
          minTier: null,
          note: null,
        },
      ],
      start: {
        kind: "bought_fractured_target",
        carried: [{ role: "attack-flats", fractured: true }],
        askClaims: [{ ...keysonClaim("ilvl 82 Gold Ring with a fractured T1 flat", "1:11–2:00"), low: 60, high: 70, unit: "div", dateContext: "late 0.5 league" }],
        requiresPlayerConsent: true,
      },
      preconditions: { ilvlMin: 82, quality: { catalyst: "reaver-catalyst", pct: 60 } },
      skeleton: [
        { phase: 1, method: "chaos-loop", side: "prefix", targetRole: "attack-flats", note: null, sources: [keysonClaim("chaos until a second T1 flat, not phys", "2:01–3:15")] },
        { phase: 2, method: "breach-quality", side: "suffix", targetRole: null, note: null, sources: [keysonClaim("Dextral Crystallisation + Essence of the Breach", "3:20–3:50")] },
        { phase: 3, method: "slam-fill", side: "suffix", targetRole: "useful-suffixes", note: null, sources: [keysonClaim("catalysed Perfect Exalt on suffixes", "4:53–6:10")] },
        {
          phase: 4,
          method: "unsupported",
          side: "prefix",
          targetRole: "attack-flats",
          note: "desecrate the last prefix and loop Omen of Light until a flat lands",
          sources: [keysonClaim("collarbone + Omen of Light until T1 flat", "17:00–18:00")],
        },
      ],
      decisionPoints: [{ afterPhase: 4, acceptLadder: [1, 2, 3], salvage: "sell-as-is" }],
      salvage: [{ id: "sell-as-is", action: "list the ring as it stands", method: "unsupported", valueClaims: [] }],
      costClaims: [{ ...keysonClaim("300-400 div expected, 200-700 range", "0:23–1:05"), low: 200, high: 700, unit: "div", dateContext: "late 0.5 league" }],
      saleClaims: [],
      durability: {
        why_it_works: "Every step is a currency or omen effect with no league-only mechanic.",
        breaks_when: ["Omen of Light or Whittling changes", "flat attack damage weights change"],
        claim: { v: "ss", src: ["https://www.youtube.com/watch?v=TWgmQuiLeHA"] },
      },
      sources: [
        {
          kind: "video",
          title: "Attack ring craft PERFECTED! PoE 2 - 0.5",
          url: "https://www.youtube.com/watch?v=TWgmQuiLeHA",
          creator: "Keyson",
          date: null,
          datePrecision: null,
          tier: "primary",
          ref: T31,
        },
      ],
      conflicts: [
        {
          topic: "which catalyst feeds the suffix slam",
          positions: [
            { videoId: "TWgmQuiLeHA", at: "4:53–6:10", text: "lightning or fire catalyst, not cold" },
            { videoId: "kE8Tn32yNp0", at: "2:10–5:00", text: "resistance or attribute catalyst" },
          ],
          resolution: "Example only: the planner prices both and takes the cheaper.",
          grade: "cf",
        },
      ],
    },
  ],
};

export const VALID_PRIORS: PriorsFile = {
  schema_version: 1,
  scope: "global",
  entries: [
    {
      key: "catalysing.multiplier@20",
      value: { point: 2, low: 2, high: 5 },
      basis: "creator_stated",
      n: null,
      sources: [{ videoId: "_sSjC5LX_Ck", at: "2:48–3:03" }],
      claim: { v: "cf", src: [], note: "Example only: creator says x2 at 20%; the KB's community model says x5." },
      patch: "0.5.5b",
      conflicts: [],
    },
  ],
};
