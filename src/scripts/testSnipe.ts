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
import { computeWaitMs, createRateGovernor, memoryRateStore, paceMs, parseRules } from "../api/tradeRateLimit";
import { AsyncLocalStorage } from "node:async_hooks";
import Bottleneck from "bottleneck";
import { metered, newMeter, scheduleMetered, type TradeMeter } from "../api/tradeMeter";
import { fmtDivOrEx } from "../lib/format";
import { pos } from "../config/env";
import { TradeRateLimitedError } from "../api/tradeErrors";
import { tradeErrorResponse } from "../lib/tradeRouteError";
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
ok("instant-buyout listing keeps its whisper (real IB listings carry one)", gl.whisper != null);
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
  ok("LIVE fixture (securable search): every listing is instant buyout (fee present)", live.every((l) => l.instantBuyout));
  ok("LIVE fixture: instant-buyout listings still carry a whisper", live.every((l) => l.whisper != null));
} else {
  console.log("SKIP  live trade2 fixture absent — run `npm run capture:trade2-fixture` to contract-test a real capture");
}

// the fee-as-instant-buyout signal must also be shown to be ABSENT on in-person listings
const onlinePath = resolve("src/scripts/fixtures/trade2-fetch-live-online.json");
if (existsSync(onlinePath)) {
  const raw = JSON.parse(readFileSync(onlinePath, "utf8")) as { result: Array<{ listing?: { fee?: unknown } } | null> };
  const inPerson = parseFetchResponse(raw).filter((l) => !l.instantBuyout);
  ok("LIVE online fixture: contains whisper-only (in-person) listings", inPerson.length > 0, String(inPerson.length));
  ok("LIVE online fixture: in-person listings lack a fee and carry a whisper", inPerson.every((l) => l.whisper != null));
  ok("LIVE online fixture: fee present ⇔ instantBuyout", raw.result.every((e, i) => e == null || (e.listing?.fee != null) === parseFetchResponse({ result: [raw.result[i]] })[0]?.instantBuyout));
} else {
  console.log("SKIP  in-person trade2 fixture absent — run `npm run capture:trade2-fixture -- --status online`");
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

// --- 7. header-driven rate limiting + 429 backoff (fake clock, REAL header strings 2026-09-26) ---
const SEARCH_RULES = "5:10:60,15:60:300,30:300:1800,600:21600:3600";
const FETCH_RULES = "12:4:10,16:12:300,50:300:300,1000:21600:1800";
const H = (rules: string, state: string) => ({ "X-Rate-Limit-Rules": "Ip", "X-Rate-Limit-Ip": rules, "X-Rate-Limit-Ip-State": state });
ok("real search rules parse (4 tiers)", parseRules(SEARCH_RULES).length === 4);
ok("malformed rule parts dropped", parseRules("8:10:60,garbage,1:2").length === 1);
ok("search pace = 600/6h → one per 36s", paceMs(parseRules(SEARCH_RULES)) === 36_000);
ok("fetch pace = 1000/6h → one per 21.6s", paceMs(parseRules(FETCH_RULES)) === 21_600);

const H6 = 21_600_000;
const now0 = 50_000_000;
// 599 of our searches in the last 6h (one under GGG's 600), the oldest 60s from ageing out
const spread = [now0 - H6 + 60_000, ...Array.from({ length: 598 }, (_, i) => now0 - 3_600_000 - i * 1_000)].sort((a, b) => a - b);
const longOnly = [{ hits: 600, periodSec: 21_600, restrictSec: 3_600 }];
const nearCap = computeWaitMs(now0, spread, longOnly, 0);
ok("near the 600/6h cap → wait until the OLDEST request ages out, not 6h", nearCap > 0 && nearCap <= 60_000, `${nearCap}ms for ${spread.length} hits`);
ok("never the full 6h period", computeWaitMs(now0, spread, parseRules(SEARCH_RULES), 0) < 3_600_000);
const burst = [now0 - 3_000, now0 - 2_000, now0 - 1_000, now0];
ok("short-window cap: 4 hits in 10s → wait for the oldest to leave the window", computeWaitMs(now0, burst, [{ hits: 5, periodSec: 10, restrictSec: 60 }], 0) === 7_000);

let t = now0;
const gov = createRateGovernor(memoryRateStore(), { now: () => t });
ok("governor: first search admitted (defaults = observed policy)", gov.reserve("search") === 0);
gov.observe("search", 200, H(SEARCH_RULES, "1:10:0,1:60:0,1:300:0,1:21600:0"));
ok("governor: next search paced 36s", gov.reserve("search") === 36_000);
t += 36_000;
ok("governor: admitted after the pace gap", gov.reserve("search") === 0);
t += 36_000;
gov.observe("search", 429, { "retry-after": "30" });
ok("429 honours Retry-After", gov.reserve("search") === 30_000, String(gov.reserve("search")));
t += 30_000;
gov.observe("search", 429, {});
ok("429 without Retry-After → conservative 60s", gov.reserve("search") === 60_000);
t += 60_000;
gov.observe("search", 200, H(SEARCH_RULES, "1:10:0,1:60:0,1:300:1800,3:21600:0"));
ok("active restriction → exactly its restrictSec (1800s), not a window period", gov.reserve("search") === 1_800_000, String(gov.reserve("search")));

let t2 = now0;
const gov2 = createRateGovernor(memoryRateStore(), { now: () => t2 });
gov2.observe("search", 200, H(SEARCH_RULES, "1:10:0,1:60:0,1:300:0,598:21600:0"));
t2 += 36_000;
ok("server count > own log (restart) is adopted: one more search fits under the cap", gov2.reserve("search") === 0);
t2 += 36_000;
const lock = gov2.reserve("search");
ok("…then the long window blocks until those requests age out (bounded by 6h)", lock > 36_000 && lock <= H6, String(lock));

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

// --- boot-time validation of gate thresholds ---
process.env.TEST_POS_ZERO = "0";
process.env.TEST_POS_NEG = "-1";
process.env.TEST_POS_BIG = "150";
process.env.TEST_POS_OK = "0.05";
ok("env: 0 threshold rejected at boot", throws(() => pos("TEST_POS_ZERO", 1)));
ok("env: negative threshold rejected", throws(() => pos("TEST_POS_NEG", 1)));
ok("env: above max (discount > 100%) rejected", throws(() => pos("TEST_POS_BIG", 40, 100)));
ok("env: valid value + fallback accepted", pos("TEST_POS_OK", 1) === 0.05 && pos("TEST_POS_UNSET", 7) === 7);
const bootMsg = ((): string => {
  try {
    pos("TEST_POS_BIG", 40, 100);
    return "";
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
})();
ok("env: boot error names the key, the bad value and the valid range", bootMsg.includes("TEST_POS_BIG=150") && bootMsg.includes("(0, 100]"), bootMsg);

// --- web routes answer a busy shared budget with 503 + Retry-After, not a hung request ---
const busy = tradeErrorResponse(new TradeRateLimitedError("search", 31_200));
ok("budget busy → 503 with Retry-After (seconds, rounded up)", busy.status === 503 && busy.headers.get("Retry-After") === "32");
ok("other trade2 failures stay 502", tradeErrorResponse(new Error("trade2 400")).status === 502);

// --- 9. scan-local meter THROUGH a real Bottleneck queue (the production path) ---
// Bottleneck starts a queued job from the previous job's completion chain, so async context read
// INSIDE the job belongs to whoever ran before. These checks queue a metered scan behind hunts.
const pause = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function runQueueScenario(
  request: (lim: Bottleneck, kind: "search" | "fetch") => Promise<void>,
  wrap: <T>(m: TradeMeter, fn: () => Promise<T>) => Promise<T>,
): Promise<{ scan: TradeMeter; hunt: TradeMeter }> {
  const lim = new Bottleneck({ maxConcurrent: 1 });
  const huntLap = async (n: number): Promise<void> => {
    for (let i = 0; i < n; i++) await request(lim, "search");
  };
  const unmeteredHunt = huntLap(4); // grabs the slot first — the scan queues behind it
  const hunt = newMeter();
  const meteredHunt = wrap(hunt, () => huntLap(3));
  const scan = newMeter();
  const scanRun = wrap(scan, async () => {
    for (let i = 0; i < 3; i++) await request(lim, "search");
    await Promise.all([request(lim, "fetch"), request(lim, "fetch")]);
  });
  await Promise.all([unmeteredHunt, meteredHunt, scanRun]);
  return { scan, hunt };
}

async function meterCheck(): Promise<void> {
  const viaClientPath = (lim: Bottleneck, kind: "search" | "fetch"): Promise<void> =>
    scheduleMetered(lim, kind, async (count) => {
      await pause(3);
      count();
    });
  const good = await runQueueScenario(viaClientPath, metered);
  ok("queued behind hunts: scan meter = exactly its own 3 searches + 2 fetches", good.scan.search === 3 && good.scan.fetch === 2, JSON.stringify(good.scan));
  ok("no leakage the other way: metered hunt = exactly its own 3 searches", good.hunt.search === 3 && good.hunt.fetch === 0, JSON.stringify(good.hunt));

  // control: the pre-fix pattern (read the store inside the job) — proves the scenario bites
  const als = new AsyncLocalStorage<TradeMeter>();
  const naive = (lim: Bottleneck, kind: "search" | "fetch"): Promise<void> =>
    lim.schedule(async () => {
      await pause(3);
      const m = als.getStore();
      if (m) m[kind]++;
    });
  const bad = await runQueueScenario(naive, (m, fn) => als.run(m, fn));
  ok("control: in-job context read mis-attributes under the same queue", !(bad.scan.search === 3 && bad.scan.fetch === 2 && bad.hunt.search === 3), `${JSON.stringify(bad.scan)} / ${JSON.stringify(bad.hunt)}`);
}

void meterCheck().then(() => {
  console.log(fail === 0 ? "\nALL PASS" : `\n${fail} FAILED`);
  process.exit(fail === 0 ? 0 : 1);
});
