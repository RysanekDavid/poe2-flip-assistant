/*
 * Strategy KB contract (npm run test:strategies, under runWithTestEnv for a TEMP DB):
 *   - every committed src/data/poe2/strategies/*.json parses (any kind), its id is its filename,
 *     its refs resolve in the entity catalog and its master nodes sit where poe2db puts them;
 *   - evidence floor: each strategy's master section and tablets carry at least one primary or
 *     2-source claim, and every unverified/conflicting claim says why in a note;
 *   - the loader fails loudly on each defect class;
 *   - views: yield prices (unpriced = null, never 0), trade2 search links per tablet mod;
 *   - the page filters, and the route body against a seeded temp database.
 */
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PricedItem } from "../api/types";
import {
  EMPTY_FILTER,
  evidenceTip,
  filterStrategies,
  leagueMismatch,
  parseBudget,
  showsBadge,
  yieldNames,
} from "../components/farm/strategies/strategiesView";
import { TABLET_BASE_ART, TABLET_UNIQUE_ART, tabletArtFile } from "../components/farm/strategies/tabletArt";
import { config } from "../config/env";
import { buildStrategyViews, loadStrategyBoard } from "../core/strategies/board";
import { loadStrategies, readStrategies, strategiesOfKind, STRATEGIES_DIR } from "../core/strategies/load";
import { MASTER_NODES, masterNodeHome } from "../core/strategies/masters";
import type { FarmStrategy, Strategy } from "../core/strategies/schema";
import { getDb } from "../db/database";
import { insertSnapshots } from "../db/marketQueries";
import type { Claim } from "../lib/claim";
import { strategiesResponseSchema, viewsOfKind } from "../lib/strategiesContract";
import { runStrategyCardCases } from "./strategyCardCases";
import { runStrategyKindCases } from "./strategyKindCases";

const FARM_IDS = [
  "abyss-depths-omens",
  "anomaly-lineage",
  "atziri-temple-rush",
  "boss-entry-conversion",
  "boss-rush-overseer",
  "breach-hiveblood",
  "citadel-crisis-fragments",
  "delirium-grand-mirror",
  "essence-overlord",
  "expedition-grand",
  "fracture-cleansed",
  "irradiated-tablet-farm",
  "ritual-omens",
  "ritual-wildwood-blooms",
  "strongbox-uniques",
  "trial-of-chaos-fates",
];
const OTHER_KINDS: Record<string, Strategy["kind"]> = {
  "breach-tablet-invasion": "roll_and_sell",
  "gem-double-corruption": "trade",
  "loreweave-rings": "trade",
  "reforging-bench-ladders": "trade",
  "ritual-tablet-rerolls": "roll_and_sell",
  "temple-tablet-crystals": "roll_and_sell",
  "waystone-bench-tiers": "roll_and_sell",
};
const EXPECTED_IDS = [...FARM_IDS, ...Object.keys(OTHER_KINDS)].sort();

// --- committed data ---
const strategies = loadStrategies();
assert.deepEqual(strategies.map((s) => s.id), EXPECTED_IDS, "every strategy, ordered by id");
assert.deepEqual(Object.fromEntries(strategies.filter((s) => s.kind !== "farm").map((s) => [s.id, s.kind])), OTHER_KINDS, "each non-farm strategy has its kind");
const farms = strategiesOfKind(strategies, "farm");
assert.deepEqual(farms.map((s) => s.id), FARM_IDS);
assert.deepEqual(
  readdirSync(STRATEGIES_DIR).filter((f) => f.endsWith(".json")).sort(),
  EXPECTED_IDS.map((id) => `${id}.json`),
  "ids are the filenames",
);
assert.equal(loadStrategies(), loadStrategies(), "parsed once per process");
for (const s of strategies) {
  assert.equal(s.status, "draft", `${s.id} stays draft until an owner review`);
  assert.equal(s.patch.verified_against, "0.5.5", `${s.id} verified_against`);
}
console.log(`PASS  ${strategies.length} strategies parse; ids = filenames; draft, verified against 0.5.5`);

const MASTER_TABLE_SIZE = Object.values(MASTER_NODES).flat(2).length;
assert.equal(MASTER_TABLE_SIZE, 36, "3 masters × 4 tiers × 3 nodes");
assert.deepEqual(masterNodeHome("Mysterious Gifts"), { master: "jado", tier: 2 });
assert.equal(masterNodeHome("Hidden Scars"), null, "an atlas notable is not a master node");

function claimsOf(value: unknown, out: Claim[] = []): Claim[] {
  if (Array.isArray(value)) value.forEach((v) => claimsOf(v, out));
  else if (value && typeof value === "object") {
    for (const [key, v] of Object.entries(value)) {
      if (key === "claim") out.push(v as Claim);
      else claimsOf(v, out);
    }
  }
  return out;
}

const settled = (claims: readonly Claim[]): boolean => claims.some((c) => c.v === "vp" || c.v === "vs");
const grades: Record<string, Record<string, number>> = {};
for (const s of farms) {
  assert.ok(settled(claimsOf(s.atlas_master)), `${s.id}: master section needs a vp/vs claim`);
  if (s.tablets.length > 0) assert.ok(settled(claimsOf(s.tablets)), `${s.id}: tablets need a vp/vs claim`);
}
for (const s of strategiesOfKind(strategies, "roll_and_sell")) {
  assert.ok(settled([s.target.claim]), `${s.id}: the rolled base is a vp/vs fact`);
  if (s.target_mods.length > 0) assert.ok(settled(claimsOf(s.target_mods)), `${s.id}: target mods need a vp/vs claim`);
}
for (const s of strategies) {
  const all = claimsOf(s);
  for (const c of all) {
    if (c.v === "uv" || c.v === "cf") assert.ok(c.note, `${s.id}: every ${c.v} claim must say why in a note`);
  }
  grades[s.id] = all.reduce<Record<string, number>>((acc, c) => ({ ...acc, [c.v]: (acc[c.v] ?? 0) + 1 }), {});
  const mods = s.kind === "farm" ? s.tablets.flatMap((t) => t.mods) : s.kind === "roll_and_sell" ? s.target_mods : [];
  for (const mod of mods) {
    if (mod.trade_stat_id === null) assert.ok(mod.claim.note, `${s.id}: a mod without a stat id must say why`);
  }
}
for (const [id, counts] of Object.entries(grades)) console.log(`INFO  ${id}: ${JSON.stringify(counts)}`);
console.log("PASS  evidence floor: farm master + tablets and rolled bases + target mods carry vp/vs claims; every uv/cf claim and stat-less mod has a note");

// --- tablet art: per base / unique, never one picture for all ---
interface PoolMod {
  side: "prefix" | "suffix";
  lines: Array<{ template: string }>;
  tiers: Array<{ bands: string[]; lines: Array<{ line: number; ranges: Array<{ min: number; max: number }> }> }>;
}
const tabletPool = JSON.parse(readFileSync("src/data/poe2/regex/tablet.json", "utf8")) as {
  bases: string[];
  baseBands: Record<string, string[]>;
  mods: PoolMod[];
};

// --- tablet mods: exact 0.5.5b pool text, the pool's side, and a band the base can roll ---
const poolText = new Map<string, { side: string; bands: string[] }>();
for (const m of tabletPool.mods) {
  for (const tier of m.tiers) {
    const text = m.lines
      .map((line, i) => (tier.lines.find((l) => l.line === i)?.ranges ?? []).reduce((out, r) => out.replace("#", r.min === r.max ? `${r.min}` : `(${r.min}–${r.max})`), line.template))
      .join(" / ");
    poolText.set(text, { side: m.side, bands: tier.bands });
  }
}
/** Every tablet a strategy names with its mods: a farm's tablets, or a roll-and-sell's tablet base. */
function tabletsOf(s: Strategy): { type: string; unique: string | null; mods: FarmStrategy["tablets"][number]["mods"] }[] {
  if (s.kind === "farm") return s.tablets;
  if (s.kind === "roll_and_sell" && Object.hasOwn(tabletPool.baseBands, s.target.base)) return [{ type: s.target.base, unique: null, mods: s.target_mods }];
  return [];
}
for (const s of strategies) {
  for (const t of tabletsOf(s)) {
    for (const mod of t.mods) {
      if (t.unique !== null) {
        assert.equal(mod.side, "unique", `${s.id}: a unique tablet's mod is side "unique"`);
        continue;
      }
      const pool = poolText.get(mod.text);
      assert.ok(pool, `${s.id}: "${mod.text}" is not a 0.5.5b tablet pool text`);
      assert.equal(mod.side, pool.side, `${s.id}: "${mod.text}" is a ${pool.side}`);
      const bands = tabletPool.baseBands[t.type] ?? [];
      assert.ok(bands.some((b) => pool.bands.includes(b)), `${s.id}: "${mod.text}" cannot roll on ${t.type}`);
    }
  }
}
console.log("PASS  tablet mods: exact 0.5.5b pool text, pool side (prefix/suffix), rollable on the tablet's base; unique mods marked unique");
assert.deepEqual(Object.keys(TABLET_BASE_ART).sort(), [...tabletPool.bases].sort(), "art for every tablet base in the RePoE pool");
for (const file of [...Object.values(TABLET_BASE_ART), ...Object.values(TABLET_UNIQUE_ART)]) {
  assert.ok(existsSync(join("src/assets/items", file)), `self-hosted tablet art ${file} exists`);
}
for (const s of strategies) for (const t of tabletsOf(s)) tabletArtFile(t);
assert.equal(tabletArtFile({ type: "Overseer Tablet", unique: null }), "overseer-tablet.webp");
assert.equal(tabletArtFile({ type: "Irradiated Tablet", unique: "Mastered Domain" }), "mastered-domain.png", "a unique shows its own art");
assert.throws(() => tabletArtFile({ type: "Overseer Tablet", unique: "Season of the Hunt" }), /no tablet art for unique/);
assert.throws(() => tabletArtFile({ type: "Waystone", unique: null }), /no tablet art for base/);
console.log("PASS  tablet art: every pool base and strategy tablet resolves to an existing file; unknown names throw");

// --- the loader fails loudly on each defect class ---
const SAMPLE = farms.find((s) => s.id === "fracture-cleansed");
if (!SAMPLE) throw new Error("fracture-cleansed sample missing");

function rejects(label: string, file: string, mutate: (copy: FarmStrategy) => unknown, pattern: RegExp): void {
  const dir = mkdtempSync(join(tmpdir(), "strategies-"));
  try {
    const copy = structuredClone(SAMPLE) as FarmStrategy;
    writeFileSync(join(dir, file), JSON.stringify(mutate(copy) ?? copy));
    assert.throws(() => readStrategies(dir), pattern, label);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
rejects("id ≠ filename", "other-name.json", () => undefined, /must equal the filename/);
rejects("unknown yield", "fracture-cleansed.json", (c) => {
  c.yields[0] = { ...c.yields[0]!, ref: { id: "no-such-item", name: "Nothing" } };
}, /not in the entity catalog/);
rejects("renamed yield", "fracture-cleansed.json", (c) => {
  c.yields[0] = { ...c.yields[0]!, ref: { id: "fracturing-orb", name: "Fracture Orb" } };
}, /is named "Fracturing Orb"/);
rejects("node under the wrong tier", "fracture-cleansed.json", (c) => {
  c.atlas_master.nodes[0] = { ...c.atlas_master.nodes[0]!, tier: 4 };
}, /poe2db has doryani T1/);
rejects("node of another master", "fracture-cleansed.json", (c) => {
  c.atlas_master.master = "hilda";
}, /poe2db has doryani/);
rejects("'any' master with nodes", "fracture-cleansed.json", (c) => {
  c.atlas_master.master = "any";
}, /"any" master cannot list nodes/);
rejects("pseudo stat id", "fracture-cleansed.json", (c) => {
  c.tablets[0]!.mods[0]!.trade_stat_id = "pseudo.pseudo_total_life";
}, /malformed/);
rejects("vp claim without a source", "fracture-cleansed.json", (c) => {
  c.yields[0]!.claim = { v: "vp", src: [] };
}, /malformed/);
rejects("unknown key", "fracture-cleansed.json", (c) => ({ ...c, extra: true }), /malformed/);
rejects("five master nodes", "fracture-cleansed.json", (c) => {
  c.atlas_master.nodes = [...c.atlas_master.nodes, ...c.atlas_master.nodes];
}, /malformed/);
rejects("rating without a source", "fracture-cleansed.json", (c) => {
  c.ratings.build = { ...c.ratings.build, claim: { v: "syn", src: [], note: "none" } };
}, /malformed/);
rejects("budget without a source", "fracture-cleansed.json", (c) => {
  c.budget = { ...c.budget, claim: { v: "syn", src: [], note: "none" } };
}, /malformed/);
rejects("schema version 2", "fracture-cleansed.json", (c) => ({ ...c, schema_version: 2 }), /malformed/);
rejects("no durability", "fracture-cleansed.json", (c) => {
  const { durability: _drop, ...rest } = c;
  return rest;
}, /malformed/);
rejects("unsourced durability", "fracture-cleansed.json", (c) => {
  c.durability = { ...c.durability, claim: { v: "syn", src: [], note: "none" } };
}, /malformed/);
rejects("unknown kind", "fracture-cleansed.json", (c) => ({ ...c, kind: "service" }), /malformed/);
rejects("farm fields under another kind", "fracture-cleansed.json", (c) => ({ ...c, kind: "trade" }), /malformed/);
assert.throws(() => readStrategies(mkdtempSync(join(tmpdir(), "strategies-empty-"))), /no strategy files/);
console.log("PASS  loader rejects: id ≠ filename, unknown/renamed yield, misplaced node, 'any' with nodes, bad stat id, sourceless vp, extra key, >4 nodes, unsourced rating/budget, schema v2, missing/unsourced durability, unknown/mismatched kind, empty dir");

// --- views: prices and search links ---
const NOW = Date.parse("2026-09-29T12:00:00Z");
const MARKETS = new Map([["fracturing-orb", { div: 1.5, fetchedAt: "2026-09-29T11:30:00.000Z", change7d: 12, volume: 400 }]]);
const allViews = buildStrategyViews(strategies, "Forbidden Rites", MARKETS, NOW);
const views = viewsOfKind(allViews, "farm");
const fracture = views.find((v) => v.id === "fracture-cleansed");
assert.deepEqual(fracture?.yields[0]?.price, { div: 1.5, ageMin: 30, change7d: 12, source: "ninja" }, "priced by exchange id, age in minutes, 7d change");
assert.ok(fracture?.trend && Math.abs(fracture.trend.change7d - 12) < 1e-9, "one priced drop with a trend carries the headline");
assert.deepEqual([fracture.trend.counted, fracture.trend.total], [1, new Set(fracture.yields.map((y) => y.ref.id)).size], "counted of total drops");
assert.equal(views.find((v) => v.id === "breach-hiveblood")?.trend, null, "no priced drop → no trend, never 0%");
assert.ok(fracture?.yields[0]?.icon_url?.startsWith("https://web.poecdn.com/"), "yield art from the catalog");
assert.equal(views.find((v) => v.id === "breach-hiveblood")?.yields[0]?.price, null, "unpriced yield is null, never 0");
for (const view of views) {
  for (const tablet of view.tablets) {
    for (const mod of tablet.mods) {
      if (mod.trade_stat_id === null) {
        assert.equal(mod.search_url, null, `${view.id}: no stat id → no search`);
        continue;
      }
      const url = new URL(mod.search_url ?? "");
      assert.equal(url.origin + url.pathname, "https://www.pathofexile.com/trade2/search/poe2/Forbidden%20Rites");
      const q = JSON.parse(url.searchParams.get("q") ?? "{}") as { query: { type?: string; name?: string; stats: Array<{ filters: Array<{ id: string }> }> } };
      assert.equal(q.query.type, tablet.type, `${view.id}: search is scoped to the tablet base`);
      assert.equal(q.query.name, tablet.unique ?? undefined, `${view.id}: a unique tablet searches by name`);
      assert.deepEqual(q.query.stats[0]?.filters.map((f) => f.id), [mod.trade_stat_id]);
    }
  }
}
console.log("PASS  views: exchange price + age per yield (null when unpriced), trade2 search per tablet mod with a stat id");
runStrategyCardCases(farms, views);
runStrategyKindCases(strategies);

// --- page filters ---
const byId = (list: readonly { id: string }[]): string[] => list.map((s) => s.id);
assert.deepEqual(byId(filterStrategies(views, EMPTY_FILTER)), FARM_IDS, "no filter keeps every farm");
const breachOnly = filterStrategies(views, { ...EMPTY_FILTER, mechanics: new Set(["breach"]) });
assert.deepEqual(byId(breachOnly), ["boss-entry-conversion", "breach-hiveblood"]);
assert.deepEqual(byId(filterStrategies(views, { ...EMPTY_FILTER, mechanics: new Set(["ritual"]) })), ["boss-entry-conversion", "ritual-omens", "ritual-wildwood-blooms"]);
assert.deepEqual(byId(filterStrategies(views, { ...EMPTY_FILTER, mechanics: new Set(["temple"]) })), ["atziri-temple-rush"]);
assert.deepEqual(byId(filterStrategies(views, { ...EMPTY_FILTER, mechanics: new Set(["trial_of_chaos"]) })), ["trial-of-chaos-fates"]);
const cheap = filterStrategies(views, { ...EMPTY_FILTER, budget: "league_start" });
assert.ok(cheap.length > 0 && cheap.every((s) => s.budget.tier === "league_start"), "league_start keeps only league_start");
const mid = filterStrategies(views, { ...EMPTY_FILTER, budget: "mid" });
assert.ok(mid.every((s) => s.budget.tier !== "high") && mid.length > cheap.length, "a ceiling keeps cheaper tiers too");
assert.deepEqual(byId(filterStrategies(views, { ...EMPTY_FILTER, yieldQuery: "  fracturing ORB " })), ["fracture-cleansed"]);
assert.deepEqual(byId(filterStrategies(views, { ...EMPTY_FILTER, yieldQuery: "rakiatas" })), ["anomaly-lineage"], "apostrophe optional");
assert.equal(filterStrategies(views, { mechanics: new Set(["trial_of_chaos"]), budget: "league_start", yieldQuery: "" }).length, 0, "filters AND together");
assert.equal(parseBudget("mid"), "mid");
assert.equal(parseBudget("cheap"), null, "unknown ?budget= is ignored, not an empty page");
assert.equal(parseBudget(null), null);
assert.ok(yieldNames(views).includes("Fracturing Orb"));
assert.equal(showsBadge({ v: "vp", src: ["https://poe2db.tw/us/Hidden_Scars"] }), false, "primary facts stay unmarked");
assert.equal(showsBadge({ v: "syn", src: [] }), true);
assert.equal(
  evidenceTip({ v: "vp", src: ["https://poe2db.tw/us/Hidden_Scars", "https://www.pathofexile.com/api/trade2/data/stats"], note: "Owner's pick." }),
  "Checked against poe2db.tw/us/Hidden_Scars, pathofexile.com/api/trade2/data/stats. Owner's pick.",
);
assert.equal(leagueMismatch(["Forbidden Rites"], "Forbidden Rites"), null);
assert.equal(leagueMismatch(["Forbidden Rites"], "Runes of Aldur"), "checked in Forbidden Rites, not in Runes of Aldur");
console.log("PASS  filters: mechanics (any of), budget ceiling, yield search, ?budget= parsing; badges only off-primary, league mismatch chip");

// --- route body over a seeded temp database ---
if (!/tmp|temp|scratchpad/i.test(config.dbPath)) throw new Error(`refusing to seed ${config.dbPath}; run via npm run test:strategies`);
for (const suffix of ["", "-wal", "-shm"]) rmSync(`${config.dbPath}${suffix}`, { force: true });
const LEAGUE = "Strategy Test League";
const seed = (itemId: string, baseValue: number, change7d: number | null = null): PricedItem => ({ itemId, itemName: itemId, category: "Currency", baseValue, volume: 50, change7d, spark7d: null, icon: null });
insertSnapshots(LEAGUE, [seed("fracturing-orb", 0.8, 25), seed("exalted", 0.004), seed("chaos", 0.02)]);
getDb().prepare("UPDATE price_snapshots SET fetched_at = datetime('now', '-10 minutes') WHERE league = ?").run(LEAGUE);
// a corrupt sparkline must not take the strategies route down: it reads the 7-day change only
getDb().prepare("UPDATE item_spark SET spark_7d = 'not json' WHERE league = ? AND item_id = 'fracturing-orb'").run(LEAGUE);
const body = strategiesResponseSchema.parse(loadStrategyBoard(LEAGUE, Date.now()));
assert.equal(body.computedLeague, LEAGUE);
assert.equal(body.strategies.length, EXPECTED_IDS.length, "the route returns every strategy of every kind; filtering is client-side");
const bodyFarms = viewsOfKind(body.strategies, "farm");
const gem = viewsOfKind(body.strategies, "trade").find((s) => s.id === "gem-double-corruption");
assert.equal(gem?.inputs.find((leg) => leg.ref?.id === "vaal")?.ref?.price, null, "an unseeded leg stays unpriced in the route body");
assert.ok(body.exPerDiv !== null && Math.abs(body.exPerDiv - 250) < 1e-9, "exalted per divine from the seeded ninja rates");
assert.equal(bodyFarms.find((s) => s.id === "fracture-cleansed")?.yields[0]?.price?.div, 0.8);
assert.equal(bodyFarms.find((s) => s.id === "fracture-cleansed")?.trend?.change7d, 25, "the stored 7d change reaches the card");
assert.equal(body.mechanics.find((m) => m.mechanic === "corruption")?.trend?.change7d, 25, "and the mechanic chip");
const empty = strategiesResponseSchema.parse(loadStrategyBoard("League Without Data", Date.now()));
assert.equal(empty.pricesFetchedAt, null);
assert.ok(viewsOfKind(empty.strategies, "farm").every((s) => s.yields.every((y) => y.price === null) && s.trend === null), "no data → every yield unpriced, no trend");
assert.ok(viewsOfKind(empty.strategies, "trade").every((s) => s.price_refs.every((c) => c.ev.status === "unpriced")), "no data → no EV anywhere");
const route = readFileSync("src/app/api/farm/strategies/route.ts", "utf8");
assert.match(
  route,
  /getCurrentUser\(\)[\s\S]*status: 401[\s\S]*const league = leagueForUser\(user\.id\)[\s\S]*BOARD_CACHE\.get\(league,[\s\S]*loadStrategyBoard\(league,/,
  "auth, then the viewer's league (the 90 s board cache is keyed by it)",
);
assert.match(route, /strategiesResponseSchema\.parse\(loadStrategyBoard\(/, "validated on the way out (before it is cached)");
console.log("PASS  route body: seeded prices + rates, empty league unpriced, auth → viewer league → validated");
