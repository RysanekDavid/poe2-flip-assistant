/* Synthetic-data test of the redesigned auto-snipe pure logic (no network/DB). */
import { pickCandidates, desirability } from "../core/autoSnipeCandidates";
import { bucketCode, referenceValue, rollSignature } from "../core/priceBook";
import { buildPlan } from "../core/comparableValuation";
import { profileToQuery, SNIPE_PROFILES } from "../core/snipeProfiles";
import { buildStatIndex, type ResolvedStat } from "../core/statResolver";
import { parseItem } from "../core/itemParser";
import { buildTradeQuery } from "../lib/tradeLink";
import type { StatOption } from "../api/tradeMeta";
import type { Listing, ListingMod } from "../api/tradeListing";
import type { ScoutRates } from "../api/scoutClient";

let fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`);
  if (!cond) fail++;
};

const rates: ScoutRates = { exaltPerDivine: 200, chaosPerDivine: 20 };
const mk = (div: number, online = true): Listing => ({
  listingId: `L${div}-${online}`,
  price: { amount: div, currency: "divine" },
  account: "seller",
  online,
  instantBuyout: false,
  indexed: new Date().toISOString(),
  whisper: "@x",
  itemName: "Rare Gloves",
  baseType: "Vaal Gauntlets",
  rarity: "Rare",
  itemLevel: 82,
  corrupted: false,
  mirrored: false,
  icon: null,
  stackSize: 0,
  mods: [],
  modLines: [],
  unreadableMods: 0,
  stash: null,
});

// --- referenceValue: bait under 30% of the rest is trimmed before the median ---
ok("referenceValue([3,9,10,11,12]) = 10.5 (3 is bait)", referenceValue([3, 9, 10, 11, 12]).valueDiv === 10.5, String(referenceValue([3, 9, 10, 11, 12]).valueDiv));
ok("referenceValue([]) = null", referenceValue([]).valueDiv === null);

// --- bucketCode: near rolls share a code, far rolls don't (the god-roll/junk separation) ---
ok("bucketCode(0) presence-only", bucketCode(0) === "p");
ok("bucketCode(-5) presence-only", bucketCode(-5) === "p");
ok("100 & 115 same bucket", bucketCode(100) === bucketCode(115), `${bucketCode(100)} vs ${bucketCode(115)}`);
ok("100 & 200 different bucket", bucketCode(100) !== bucketCode(200), `${bucketCode(100)} vs ${bucketCode(200)}`);

// --- rollSignature: roll-aware key, order-independent ---
const sigLow = rollSignature("Gloves", [{ ref: "a", value: 100 }]);
const sigNear = rollSignature("Gloves", [{ ref: "a", value: 115 }]);
const sigHigh = rollSignature("Gloves", [{ ref: "a", value: 200 }]);
ok("same roll tier → same signature", sigLow === sigNear, `${sigLow} vs ${sigNear}`);
ok("different roll tier → different signature", sigLow !== sigHigh, `${sigLow} vs ${sigHigh}`);
ok(
  "signature is order-independent",
  rollSignature("Gloves", [{ ref: "a", value: 100 }, { ref: "b", value: 50 }]) ===
    rollSignature("Gloves", [{ ref: "b", value: 50 }, { ref: "a", value: 100 }]),
);

// --- desirability: distinctive explicits weigh 2, pseudos 1 ---
const ds = (groups: string[]): number =>
  desirability(groups.map((g, i): ResolvedStat => ({ id: `s${i}`, group: g, text: "t", ref: "t", value: 1 })));
ok("desirability pseudo=1, explicit=2", ds(["pseudo", "explicit", "explicit"]) === 5, String(ds(["pseudo", "explicit", "explicit"])));
ok("desirability empty = 0", ds([]) === 0);

// --- pickCandidates: price FLOOR (design: 2 Div), desirability-ranked, whale tier + junk excluded ---
const idxMs = buildStatIndex([
  { id: "explicit.ms", text: "#% increased Movement Speed", group: "explicit" },
  { id: "explicit.as", text: "#% increased Attack Speed", group: "explicit" },
]);
const gloves = SNIPE_PROFILES.find((p) => p.key === "gloves_melee_levels")!;
const MS_AS: ListingMod[] = [
  { text: "35% increased Movement Speed", marker: "explicit", statId: null },
  { text: "12% increased Attack Speed", marker: "explicit", statId: null },
];
const withMs = (div: number, online = true): Listing => ({
  ...mk(div, online),
  listingId: `M${div}-${online}`,
  modLines: MS_AS,
  mods: MS_AS.map((m) => m.text),
});
// all score 4 (two distinctive mods); 1 under the 2-Div floor → skip; 250 above maxTargetDiv 200 →
// skip; 0.5 offline in-person → not buyable. The old test asserted the 1-ex listing came FIRST —
// exactly the ranking that burned every valuation on bait.
const lst = [withMs(1), withMs(3), withMs(5), withMs(8), withMs(250), withMs(0.5, false)];
const pc = pickCandidates(gloves, lst, rates, idxMs);
ok("3 candidates picked", pc.candidates.length === 3, String(pc.candidates.length));
ok("price floor excludes the 1-Div listing; equal score → cheaper first → 3,5,8", pc.candidates.map((c) => c.div).join(",") === "3,5,8", pc.candidates.map((c) => c.div).join(","));
ok("whale tier (>200) excluded", !pc.candidates.some((c) => c.div > 200));
ok("observations cover all priced+buyable listings (5)", pc.observations.length === 5, String(pc.observations.length));
// floor = referenceValue of [1,3,5,8,250] → 1 < 30% of median(3,5,8,250)=6.5 → dropped → median 6.5
ok("floorDiv = 6.5 (diagnostic)", pc.floorDiv === 6.5, String(pc.floorDiv));
const oneMod = pickCandidates(gloves, [{ ...withMs(5), modLines: MS_AS.slice(0, 1), mods: [MS_AS[0]!.text] }], rates, idxMs);
ok("single resolved mod → not a candidate", oneMod.candidates.length === 0);

// a listing whose mods don't resolve (score 0) is NOT a candidate
const junk = pickCandidates(gloves, [{ ...mk(1), mods: [] }], rates, idxMs);
ok("score-0 listing excluded", junk.candidates.length === 0, String(junk.candidates.length));

// --- buildPlan: keeps pseudo totals + distinctive explicits, DROPS generic pseudo-source explicits ---
const CATALOG: StatOption[] = [
  { id: "explicit.stat_life", text: "+# to maximum Life", group: "explicit" },
  { id: "explicit.stat_fire", text: "+#% to Fire Resistance", group: "explicit" },
  { id: "explicit.stat_cold", text: "+#% to Cold Resistance", group: "explicit" },
  { id: "explicit.stat_allele", text: "+#% to all Elemental Resistances", group: "explicit" },
  { id: "explicit.stat_spelldmg", text: "#% increased Spell Damage", group: "explicit" },
  { id: "explicit.stat_melee_lvls", text: "+# to Level of all Melee Skills", group: "explicit" },
  { id: "explicit.stat_atkspd", text: "#% increased Attack Speed", group: "explicit" },
  { id: "implicit.stat_str", text: "+# to Strength", group: "implicit" },
  { id: "pseudo.total_ele", text: "#% total Elemental Resistance", group: "pseudo" },
  { id: "pseudo.total_life", text: "+# total maximum Life", group: "pseudo" },
];
const idx = buildStatIndex(CATALOG);
const SAMPLE = `Item Class: Gloves
Rarity: Rare
Whale Grip
Vaal Gauntlets
--------
Item Level: 82
--------
+25 to Strength (implicit)
--------
+95 to maximum Life
+30% to Fire Resistance
+18% to Cold Resistance
+12% to all Elemental Resistances
35% increased Spell Damage
--------`;
const item = parseItem(SAMPLE)!;
const plan = buildPlan(item, idx);
const ids = new Set(plan.searchStats.map((s) => s.id));
ok("keeps pseudo total life", ids.has("pseudo.total_life"));
ok("keeps pseudo total ele res", ids.has("pseudo.total_ele"));
ok("keeps distinctive Spell Damage explicit", ids.has("explicit.stat_spelldmg"));
ok("drops generic life explicit (pseudo source)", !ids.has("explicit.stat_life"));
ok("drops generic resistance explicits (pseudo sources)", !ids.has("explicit.stat_fire") && !ids.has("explicit.stat_cold") && !ids.has("explicit.stat_allele"));
ok("plan signature is roll-aware (has a bucket token)", /#b-?\d+|#p/.test(plan.signature), plan.signature);

// pseudosOnly fallback drops ALL explicits, keeps only the totals
const broad = buildPlan(item, idx, { pseudosOnly: true });
ok("pseudosOnly keeps only pseudo totals", broad.searchStats.every((s) => s.group === "pseudo"), broad.searchStats.map((s) => s.group).join(","));

// --- profileToQuery: still resolves stat texts → ids + sets category (unchanged contract) ---
const gq = profileToQuery(gloves, buildStatIndex(CATALOG));
ok("gloves category set", gq.query.category === "armour.gloves", gq.query.category);
ok("gloves rarity rare", gq.query.rarity === "rare");
ok("gloves resolved its stats", gq.resolved >= 1, String(gq.resolved));
const gBody = buildTradeQuery(gq.query) as { status: { option: string }; filters: { trade_filters: { filters: { indexed?: { option: string } } } } };
ok("archetype search = instant buyout, 1-day window", gBody.status.option === "securable" && gBody.filters.trade_filters.filters.indexed?.option === "1day");

console.log(fail === 0 ? "\nALL PASS" : `\n${fail} FAILED`);
process.exit(fail === 0 ? 0 : 1);
