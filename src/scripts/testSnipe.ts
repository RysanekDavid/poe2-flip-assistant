/* Snipe/hunt engine contract tests — pure, NO network, NO DB.
 * Run: npm run test:snipe (also runs the DB half via runWithTestEnv snipe-db). */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { evaluateSnipe, type SnipeGateLimits } from "../core/snipeGate";
import { parseFetchResponse, parseListing, isBuyable, isZeroModRare, type Listing } from "../api/tradeListing";
import { listingDiv } from "../core/listingPrice";
import { referenceValue, signatureModCount } from "../core/priceBook";
import { buildPlan, listingToItem, valueFromComparables } from "../core/comparableValuation";
import { buildStatIndex } from "../core/statResolver";
import { rankCandidates, pickCandidates, pickArchetypes } from "../core/autoSnipeCandidates";
import { SNIPE_PROFILES } from "../core/snipeProfiles";
import { createRateGovernor, delayFromHeaders, parseRules } from "../api/tradeRateLimit";
import { fmtDivOrEx } from "../lib/format";
import { snipeAlertMessage } from "../core/snipeAlert";
import { parseHuntBody } from "../lib/huntSchema";
import { buildTradeQuery } from "../lib/tradeLink";
import type { StatOption } from "../api/tradeMeta";

let fail = 0;
const ok = (name: string, cond: boolean, extra = ""): void => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`);
  if (!cond) fail++;
};
const throws = (fn: () => unknown): boolean => {
  try {
    fn();
    return false;
  } catch {
    return true; // the assertion IS that it throws
  }
};

const NOW = Date.parse("2026-09-25T12:00:00Z");
const minsAgo = (m: number): string => new Date(NOW - m * 60_000).toISOString();
const rates = { exaltPerDivine: 200, chaosPerDivine: 20 };
const LIMITS: SnipeGateLimits = { minAskDiv: 0.02, minAskFracOfValue: 0.05, minResolvedMods: 2, freshMinutes: 120, minSamples: 5 };
const gate = (over: Partial<Parameters<typeof evaluateSnipe>[0]>) =>
  evaluateSnipe({ askDiv: 1.2, refDiv: 2, samples: 8, resolvedMods: 3, indexed: minsAgo(10), discountPct: 35, nowMs: NOW, ...over }, LIMITS);
const reason = (r: ReturnType<typeof gate>): string => (r.pass ? "pass" : r.reason);

// --- 1. the shared snipe gate ---
ok("gate: ask 0 → no alert", reason(gate({ askDiv: 0 })) === "ask-not-positive");
ok("gate: 1ex (0.005 Div) vs 2 Div ref → bait floor", reason(gate({ askDiv: 1 / 200 })) === "ask-below-floor");
ok("gate: floor is 5% of value when that beats 0.02", reason(gate({ askDiv: 0.09, refDiv: 2 })) === "ask-below-floor");
ok("gate: zero-mod signature → no alert", reason(gate({ resolvedMods: 0 })) === "too-few-mods");
ok("gate: one resolved mod → no alert", reason(gate({ resolvedMods: 1 })) === "too-few-mods");
ok("gate: stale listing (5h) → no alert", reason(gate({ indexed: minsAgo(300) })) === "stale");
ok("gate: unknown listing age → no alert", reason(gate({ indexed: null })) === "stale");
ok("gate: small sample (3) → no alert", reason(gate({ samples: 3 })) === "thin-reference");
ok("gate: no reference → no alert", reason(gate({ refDiv: null })) === "no-reference");
ok("gate: only 10% under → not discounted", reason(gate({ askDiv: 1.8 })) === "not-discounted");
const genuine = gate({});
ok("gate: 40% under, instant buyout, 3 mods, fresh, 8 comps → ALERT", genuine.pass, reason(genuine));
ok("gate: margin reported = 40%", genuine.pass && Math.round(genuine.marginPct) === 40);

// --- 2. parseListing vs the fetch-shape fixture ---
const fixturePath = resolve("src/scripts/fixtures/trade2-fetch-shape.json");
const listings = parseFetchResponse(JSON.parse(readFileSync(fixturePath, "utf8")));
const byId = (id: string): Listing => {
  const l = listings.find((x) => x.listingId === id);
  if (!l) throw new Error(`fixture listing ${id} missing`);
  return l;
};
ok("fixture: 5 listings (null entry = delisted, dropped)", listings.length === 5, String(listings.length));
const gl = byId("fx-gloves-ib");
ok("ItemMod objects are read (6 mod lines incl. implicit + rune)", gl.modLines.length === 6, String(gl.modLines.length));
ok("mod text markup stripped", gl.mods.includes("+95 to maximum Life") && gl.mods.includes("14% increased Attack Speed"), gl.mods.join(" | "));
ok("stat hash → trade stat id ('stat.' prefix stripped)", gl.modLines.some((m) => m.statId === "explicit.stat_3299347043"));
ok("fractured flag → fractured marker", gl.modLines.find((m) => m.text.includes("Attack Speed"))?.marker === "fractured");
ok("no unreadable mod entries on a well-formed item", gl.unreadableMods === 0);
ok("instant buyout detected from fee; online null → offline but buyable", gl.instantBuyout && !gl.online && isBuyable(gl));
ok("item level / rarity / corrupted carried", gl.itemLevel === 82 && gl.rarity === "Rare" && gl.corrupted === false);
ok("instant-buyout listing has no whisper", gl.whisper === null);
const legacy = byId("fx-ring-legacy");
ok("legacy string mods still parse (+ craftedMods bucket)", legacy.modLines.length === 3 && legacy.modLines.some((m) => m.marker === "crafted"));
ok("price amount 0 → price null (never a 0-Div ask)", legacy.price === null);
ok("zero-mod rare flagged", isZeroModRare(byId("fx-zero-mod-rare")));
const mirrored = byId("fx-mirrored");
ok("mirrored (duplicated) carried", mirrored.mirrored);
ok("unreadable mod entry counted, not dropped silently", mirrored.unreadableMods === 1);
ok("non-{result} body throws", throws(() => parseFetchResponse({ nope: 1 })));
ok("entry with wrong-typed field throws", throws(() => parseListing({ id: 5 })));
const rawExplicits = (JSON.parse(readFileSync(fixturePath, "utf8")) as { result: Array<{ item: { explicitMods: unknown[] } }> })
  .result[0]!.item.explicitMods;
ok("regression: the old string-only filter saw 0 of the 4 explicits", rawExplicits.length === 4 && rawExplicits.filter((m) => typeof m === "string").length === 0);

// --- 3. stat resolution against the fixture ---
const CATALOG: StatOption[] = [
  { id: "explicit.stat_3299347043", text: "+# to maximum Life", group: "explicit" },
  { id: "explicit.stat_3372524247", text: "+#% to Fire Resistance", group: "explicit" },
  { id: "explicit.stat_681332047", text: "#% increased Attack Speed", group: "explicit" },
  { id: "explicit.stat_9187492", text: "+# to Level of all Melee Skills", group: "explicit" },
  { id: "implicit.stat_str", text: "+# to Strength", group: "implicit" },
  { id: "rune.stat_cold", text: "+#% to Cold Resistance", group: "rune" },
  { id: "pseudo.total_life", text: "+# total maximum Life", group: "pseudo" },
  { id: "pseudo.total_ele", text: "#% total Elemental Resistance", group: "pseudo" },
];
const idx = buildStatIndex(CATALOG);
const plan = buildPlan(listingToItem(gl), idx);
ok("all 6 fixture mods resolve", plan.resolvedCount === 6, String(plan.resolvedCount));
ok("roll signature carries ≥2 mods", signatureModCount(plan.signature) >= 2, plan.signature);
ok("fractured/desecrated ids resolve via explicit catalog id", plan.searchStats.some((s) => s.id === "explicit.stat_681332047") && plan.searchStats.some((s) => s.id === "explicit.stat_9187492"));
ok("comparables: instant buyout, never mirrored, same corrupted state, ilvl floor", plan.query.instantBuyout === true && plan.query.mirrored === false && plan.query.corrupted === false && plan.query.ilvlMin === 78);
const q = buildTradeQuery(plan.query) as { status: { option: string }; filters: { misc_filters: { filters: Record<string, { option: string }> } } };
ok("query: status securable + misc mirrored=false", q.status.option === "securable" && q.filters.misc_filters.filters.mirrored?.option === "false");
ok("id resolution beats a text mismatch", buildPlan({ ...listingToItem(gl), mods: [{ raw: "+95 to Vitality", placeholdered: "+# to Vitality", numbers: [95], marker: "explicit", statId: "explicit.stat_3299347043" }] }, idx).resolvedCount === 1);
ok("zero-mod rare → bare signature (0 mods)", signatureModCount(buildPlan(listingToItem(byId("fx-zero-mod-rare")), idx).signature) === 0);

const livePath = resolve("src/scripts/fixtures/trade2-fetch-live.json");
if (existsSync(livePath)) {
  const live = parseFetchResponse(JSON.parse(readFileSync(livePath, "utf8")));
  const rares = live.filter((l) => (l.rarity ?? "").toLowerCase() === "rare");
  ok("LIVE fixture: parses", live.length > 0, String(live.length));
  ok("LIVE fixture: every rare has mods", rares.every((l) => l.modLines.length > 0), rares.map((l) => l.modLines.length).join(","));
  ok("LIVE fixture: no unreadable mod entries", live.every((l) => l.unreadableMods === 0));
  ok("LIVE fixture: rares resolve ≥2 mods (catalog-free: via stat ids)", rares.every((l) => l.modLines.filter((m) => m.statId).length >= 2));
} else {
  console.log("SKIP  live trade2 fixture absent — run `npm run capture:trade2-fixture` to contract-test a real capture");
}

// --- 4. typed price conversion (unrated path) ---
ok("unrated currency → typed unrated, not NaN", listingDiv({ amount: 4, currency: "annul" }, rates).kind === "unrated");
ok("non-positive amount → unrated", listingDiv({ amount: 0, currency: "divine" }, rates).kind === "unrated");
const ex = listingDiv({ amount: 200, currency: "exalted" }, rates);
ok("200 ex @ 200 ex/div = 1 Div", ex.kind === "rated" && ex.div === 1);

// --- 5. trimmed-median reference ---
const r1 = referenceValue([0.005, 8, 10, 12, 9, 11]);
ok("bait under 30% of the rest dropped; median of rest = 10", r1.valueDiv === 10 && r1.dropped === 1 && r1.samples === 5, JSON.stringify(r1));
const r2 = referenceValue([0.01, 0.02, 0.03, 0.04, 10, 10, 10, 10, 10]);
ok("at most 3 outliers dropped", r2.dropped === 3, JSON.stringify(r2));
ok("empty → null value (never 0)", referenceValue([0, -1, Number.NaN]).valueDiv === null);
const comp = (id: string, div: number, extra: Partial<Listing> = {}): Listing => ({
  ...gl, listingId: id, price: { amount: div, currency: "divine" }, ...extra,
});
const comps = [comp("cand", 0.5), comp("a", 9), comp("b", 10), comp("c", 11), comp("d", 12), comp("e", 10), comp("off", 9.5, { instantBuyout: false, online: false })];
const v = valueFromComparables(comps, 40, rates, "cand");
ok("candidate + offline in-person listing excluded from comparables", v.samples === 5 && v.valueDiv === 10 && v.minDiv === 9, JSON.stringify(v));
ok("unrated comparable counted, not priced", valueFromComparables([comp("x", 5, { price: { amount: 5, currency: "annul" } })], 1, rates).unrated === 1);

// --- 6. ranking is desirability-first, not price-driven ---
const ranked = rankCandidates([{ score: 2, div: 0.005 }, { score: 6, div: 50 }, { score: 6, div: 20 }, { score: 4, div: 3 }]);
ok("rank: score desc, price only a tiebreak", ranked.map((c) => `${c.score}/${c.div}`).join(",") === "6/20,6/50,4/3,2/0.005", ranked.map((c) => `${c.score}/${c.div}`).join(","));
const profile = SNIPE_PROFILES[0]!;
const withMods = (id: string, div: number, age: number, nMods: number): Listing =>
  comp(id, div, { indexed: minsAgo(age), modLines: gl.modLines.slice(2, 2 + nMods), mods: gl.mods.slice(2, 2 + nMods) });
const pc = pickCandidates(profile, [withMods("oneEx", 1 / 200, 5, 4), withMods("good", 5, 5, 4), withMods("ok", 3, 5, 2), withMods("stale", 4, 600, 4), withMods("thin", 6, 5, 1)], rates, idx, NOW);
ok("1-ex listing NOT a candidate (price floor)", !pc.candidates.some((c) => c.listing.listingId === "oneEx"));
ok("stale + single-mod listings NOT candidates", !pc.candidates.some((c) => ["stale", "thin"].includes(c.listing.listingId)));
ok("most desirable candidate first", pc.candidates[0]?.listing.listingId === "good", pc.candidates.map((c) => c.listing.listingId).join(","));
ok("observations exclude nothing buyable+rated (5)", pc.observations.length === 5, String(pc.observations.length));
const rot = pickArchetypes(["a", "b", "c", "d", "e"], 3, 4);
ok("archetype rotation wraps", rot.picked.join("") === "deab" && rot.next === 2, `${rot.picked.join("")} next ${rot.next}`);

// --- 7. header-driven rate limiting + 429 backoff (fake clock) ---
let t = 0;
const gov = createRateGovernor({ now: () => t });
const H = (state: string) => ({ "X-Rate-Limit-Rules": "Ip", "X-Rate-Limit-Ip": "8:10:60,15:60:120", "X-Rate-Limit-Ip-State": state });
gov.observe(200, H("1:10:0,2:60:0"));
ok("well under limits → no wait", gov.waitMs() === 0);
gov.observe(200, H("7:10:0,8:60:0"));
ok("one hit from a cap → wait out that rule's period", gov.waitMs() === 10_000, String(gov.waitMs()));
t += 10_000;
ok("wait elapses with the clock", gov.waitMs() === 0);
gov.observe(429, { "retry-after": "30" });
ok("429 honours Retry-After", gov.waitMs() === 30_000, String(gov.waitMs()));
t += 30_000;
gov.observe(429, {});
ok("429 without Retry-After → conservative 60s", gov.waitMs() === 60_000, String(gov.waitMs()));
ok("active restriction wins", delayFromHeaders(H("9:10:45,9:60:0")) === 45_000);
ok("malformed rule parts dropped", parseRules("8:10:60,garbage,1:2").length === 1);

// --- 8. alert rendering + hunt validation ---
ok("sub-Div ask rendered in exalted", fmtDivOrEx(0.25, 200) === "50 ex" && fmtDivOrEx(1 / 200, 200) === "1 ex");
ok("≥1 Div rendered in div; 0 → dash", fmtDivOrEx(2, 200) === "2 div" && fmtDivOrEx(0, 200) === "—");
const msg = snipeAlertMessage({ marginPct: 42, askDiv: 0.5, valueDiv: 2, samples: 7, exPerDiv: 200, basis: "comps" });
ok("alert text never says '0 vs'", msg.includes("100 ex vs ~2 div") && !/\b0 vs/.test(msg), msg);
ok("hunt: valid body accepted", parseHuntBody({ label: "x", baseType: "Gold Ring", maxAmount: 2, maxCcy: "divine", stats: [{ id: "explicit.stat_1", min: 3 }] }).ok);
ok("hunt: stats not an array → 400", !parseHuntBody({ label: "x", baseType: "Ring", stats: "life" }).ok);
ok("hunt: non-numeric price → 400", !parseHuntBody({ label: "x", baseType: "Ring", maxAmount: "abc", maxCcy: "divine" }).ok);
ok("hunt: unknown mode → 400", !parseHuntBody({ label: "x", baseType: "Ring", mode: "BUY_ALL" }).ok);
ok("hunt: price without currency → 400", !parseHuntBody({ label: "x", baseType: "Ring", maxAmount: 3 }).ok);
ok("hunt: no target at all → 400", !parseHuntBody({ label: "x" }).ok);

console.log(fail === 0 ? "\nALL PASS" : `\n${fail} FAILED`);
process.exit(fail === 0 ? 0 : 1);
