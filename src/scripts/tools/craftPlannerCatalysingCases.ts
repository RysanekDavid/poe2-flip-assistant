/* PR-C: Omen of Catalysing Exaltation as a creator/community range. The shipped priors and the
 * planner's default agree; the catalysed slam's odds are re-derived by hand on the Breach Ring
 * (point = the creators' ×3, band = ×3 ×½ … ×7.5 ×2) and at 20% (×2 … ×5); the pool memo keeps the
 * band ends apart; the chain's cheap / dear ends read the high / low multiplier; the rule table and
 * the KB say the same range. Imported by testCraftPlanner.ts. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadCraftMining, PRIORS_DIR } from "../../core/research/craftMining/load";
import type { PriorsFile } from "../../core/research/craftMining/schema";
import type { CraftCatalog } from "../../core/tools/craftmoves/catalog";
import { OMEN_RULES } from "../../core/tools/craftmoves/ruleTableOmens";
import { KB } from "../../core/tools/craftmoves/ruleTypes";
import { catalystById } from "../../core/tools/planner/catalystTags";
import { EXALT_TIERS } from "../../core/tools/planner/methodKit";
import { FILL_METHODS } from "../../core/tools/planner/methodsFill";
import { addOdds, CATALYSING_NOTE, catalysingMultiplier } from "../../core/tools/planner/odds";
import { buildCtx } from "../../core/tools/planner/plan";
import { rankCost } from "../../core/tools/planner/rank";
import { CATALYSING_KEYS, catalysingPriorsFrom, DEFAULT_CATALYSING } from "../../core/tools/planner/revealPriors";
import { buildChain, slamScope } from "../../core/tools/planner/slamChain";
import { canonical, junk, targetAffix } from "../../core/tools/planner/state";
import type { CatalysingPriors, Move, PlanCtx, PlanState } from "../../core/tools/planner/types";
import { captionsBetween } from "./craftPlannerKbFacts";
import { BREACH_RING, fixturePrices } from "./plannerFixtures";
import { NOW } from "./testCraftPlannerGolden";

const near = (a: number | null, b: number, what: string): void => assert.ok(a != null && Math.abs(a - b) < 1e-12, `${what}: expected ${b}, got ${a}`);

const ctxWith = (cat: CraftCatalog, catalysing?: CatalysingPriors): PlanCtx => buildCtx(BREACH_RING, { cat, prices: fixturePrices(), exaltPerDivine: 250, league: "Test", now: NOW, catalysing }).ctx;

/**
 * The Breach Ring before its last resistance: the three prefixes done, Fire Resistance fractured and
 * one throwaway suffix (the state the plan's final step starts from). Cold Resistance (target 4) is missing.
 */
const LAST_RES: PlanState = canonical({
  rarity: "Rare",
  affixes: [targetAffix("prefix", 0, "explicit"), targetAffix("prefix", 1, "crafted"), targetAffix("prefix", 2, "desecrated"), targetAffix("suffix", 3, "fractured"), junk("suffix")],
  quality: 0,
  catalyst: null,
});

/** The shipped global.json and the planner's fallback are the same numbers, through the loader and raw. */
function testPriorsMirror(): void {
  assert.deepEqual(catalysingPriorsFrom(loadCraftMining().priors), DEFAULT_CATALYSING, "loaded priors = DEFAULT_CATALYSING");
  const raw = JSON.parse(readFileSync(join(PRIORS_DIR, "global.json"), "utf8")) as { entries: Array<{ key: string; value: unknown }> };
  const value = (key: string) => raw.entries.find((e) => e.key === key)?.value;
  assert.deepEqual({ at20: value(CATALYSING_KEYS.at20), at40: value(CATALYSING_KEYS.at40) }, DEFAULT_CATALYSING, "global.json = DEFAULT_CATALYSING");
  assert.deepEqual(catalysingPriorsFrom([]), DEFAULT_CATALYSING, "no prior files → the same default");
  const global = loadCraftMining().priors.find((f) => f.scope === "global")!;
  const broken: PriorsFile = { ...global, entries: global.entries.map((e) => (e.key === CATALYSING_KEYS.at20 ? { ...e, value: { point: 0.5, low: 0.5, high: 5 } } : e)) };
  assert.throws(() => catalysingPriorsFrom([broken]), /multiplier band/, "a multiplier under 1 is refused, loudly");
  near(catalysingMultiplier(45, DEFAULT_CATALYSING, "high"), 7.5, "above 40% rounds down to the 40% numbers");
  assert.equal(catalysingMultiplier(19, DEFAULT_CATALYSING, "point"), null, "under 20% no multiplier");
}

function catalysedSlam(ctx: PlanCtx): { slam: Move; erasure: Move } {
  const moves = FILL_METHODS.flatMap((m) => m.moves(LAST_RES, ctx));
  const slam = moves.find((m) => m.methodId === "slam-suffix-exalt-perfect-catalysing");
  const erasure = moves.find((m) => m.methodId === "erasure-loop-suffix");
  assert.ok(slam && erasure, `both last-resistance moves exist: ${moves.map((m) => m.methodId).join(", ")}`);
  return { slam, erasure };
}

/**
 * 17 suffix families outside the Fire Res group, 2 of them cold-tagged (Cold Res, All Res), one
 * throwaway blocking an untagged one: total = 2·m + 15 − 1. Cold Resistance at the Perfect floor 50:
 * 2 of 4 reachable tiers reach level 71.
 */
function testBreachSlamByHand(cat: CraftCatalog): void {
  const ctx = ctxWith(cat);
  const { slam, erasure } = catalysedSlam(ctx);
  const total = (m: number): number => 2 * m + 15 - 1;
  near(slam.odds.point, (3 / total(3)) * (2 / 4), "point = the creators' ×3: 3/20 × 2/4");
  near(slam.odds.low, (3 / total(3)) * (2 / 4) * 0.5, "low = the creators' ×3 (also the low end at 40%) × ½");
  near(slam.odds.high, (7.5 / total(7.5)) * (2 / 4) * 2, "high = the community ×7.5: 7.5/29 × 2/4 × 2");
  assert.match(slam.odds.formula, /favours 2 families ×3 \(×3–×7\.5\)/, "the formula states the point and the band");
  assert.ok(slam.odds.formula.includes(CATALYSING_NOTE), "the formula carries the sources note");
  assert.match(slam.steps[0]!.do, /quality to 40%/, "catalyst step names the quality target (Breach Ring cap 40%)");
  assert.ok(slam.steps[0]!.why.includes("×3 (×3–×7.5)") && slam.steps[0]!.why.includes(CATALYSING_NOTE), `the catalyst step reads the band: ${slam.steps[0]!.why}`);
  // why the golden route changed: at ×3 this slam is dearer than the Erasure-steered Chaos loop
  assert.ok(rankCost(slam, ctx) > rankCost(erasure, ctx), `catalysed slam ${rankCost(slam, ctx)} > Erasure loop ${rankCost(erasure, ctx)}`);
  const exalts = slam.uses.find((u) => u.mat.id === "perfect-exalted-orb")!.qty;
  assert.ok(exalts.low < exalts.point && exalts.point < exalts.high, "the Perfect Exalt count carries a band");
  // the community model alone (the pre-PR-C numbers) brings the old 7.5/29 × 2/3-style point back
  const community = ctxWith(cat, { at20: { point: 5, low: 5, high: 5 }, at40: { point: 7.5, low: 7.5, high: 7.5 } });
  near(catalysedSlam(community).slam.odds.point, (7.5 / total(7.5)) * (2 / 4), "PlanDeps.catalysing reaches the odds");
}

/** At 20% quality the band is ×2 … ×5; each end is its own memo entry (a stale key would return the point). */
function testTwentyPercentBand(cat: CraftCatalog): void {
  const ctx = ctxWith(cat);
  const pool = (quality: number) => ({ sides: ["suffix"] as const, floor: 50, catalyst: catalystById("tuls-catalyst"), quality, junkAfter: 1 });
  const total = (m: number): number => 2 * m + 15 - 1;
  for (const quality of [40, 20, 40]) {
    const o = addOdds(ctx, LAST_RES, pool(quality), [4]);
    const [point, low, high] = quality === 40 ? [3, 3, 7.5] : [2, 2, 5];
    near(o.p.get(4)!, (point / total(point)) * (2 / 4), `${quality}% point ×${point}`);
    near(o.pLow.get(4)!, (low / total(low)) * (2 / 4), `${quality}% low ×${low}`);
    near(o.pHigh.get(4)!, (high / total(high)) * (2 / 4), `${quality}% high ×${high}`);
    const e = o.estimate(4);
    near(e.low, (low / total(low)) * (2 / 4) * 0.5, `${quality}% band low = ×${low} × ½`);
    near(e.high, (high / total(high)) * (2 / 4) * 2, `${quality}% band high = ×${high} × 2`);
  }
  const plain = addOdds(ctx, LAST_RES, { ...pool(40), catalyst: null }, [4]);
  assert.equal(plain.pLow.get(4), plain.p.get(4), "no catalyst: every band end is the point");
  assert.equal(plain.pHigh.get(4), plain.p.get(4), "no catalyst: every band end is the point");
}

/** The chain's cheap end (×2) reads the high multiplier and its dear end (×½) the low one. */
function testChainEnds(cat: CraftCatalog): void {
  const ctx = ctxWith(cat);
  const scope = slamScope(LAST_RES, ctx, "suffix");
  assert.ok(scope, "the last resistance is a slam scope");
  const tier = EXALT_TIERS.find((t) => t.key === "perfectExalted")!;
  const hit = (scale: number): number => {
    const chain = buildChain(LAST_RES, ctx, scope, { tier, catalysing: true }, scale);
    const first = chain.nodes.find((n) => n.id === `${scope.missing0}:${scope.j0}`)!;
    return first.edges.filter((e) => e.to !== `${scope.missing0}:${scope.j0 + 1}`).reduce((s, e) => s + e.p, 0);
  };
  const total = (m: number): number => 2 * m + 15 - 1;
  near(hit(1), (3 / total(3)) * (2 / 4), "prior chain: ×3");
  near(hit(2), (7.5 / total(7.5)) * (2 / 4) * 2, "cheap chain: ×7.5 × 2");
  near(hit(0.5), (3 / total(3)) * (2 / 4) * 0.5, "dear chain: ×3 × ½");
}

/** The craft-moves rule table and the KB state the same range; the creator quote sits in its window. */
function testWordingAndKb(): void {
  const rule = OMEN_RULES.find((r) => r.id === "omen-catalysing-exaltation");
  assert.ok(rule && rule.effect.includes(CATALYSING_NOTE), `rule effect states the range: ${rule?.effect}`);
  const kb = readFileSync(join(process.cwd(), "docs", "research", KB), "utf8").replace(/\r/g, "");
  const start = kb.indexOf("## 4.");
  const section4 = kb.slice(start, kb.indexOf("## 5.", start)).replace(/\s+/g, " ");
  for (const text of [
    "**The multiplier is a range, nothing measured** [conflicting]: XTheFarmerX states ×2 at 20% and ×3 at 40% quality",
    "Plan on **×2–×5 at 20% and ×3–×7.5 at 40%, the creators' figure as the point** (the craft planner does).",
    "[3842222](https://www.pathofexile.com/forum/view-thread/3842222)",
  ]) assert.ok(section4.includes(text), `KB §4 no longer states: ${text}`);
  const top = kb.slice(kb.indexOf("## TOP wallet-saving rules")).replace(/\s+/g, " ");
  assert.ok(top.includes("×2 at 20% / ×3 at 40% (XTheFarmerX, others' 300–400 attempts) to ×5 / ×7.5 (community models)"), "TOP rule 11 states the range");
  const farmer = captionsBetween("36-insane-end-game-rings-for-cheap-xthefarmerx.txt", 164, 184);
  for (const quote of ["three or 400 attempts", "at 20% quality, it doubles the weighting, and at 40% quality, it triples the weighting"]) {
    assert.ok(farmer.includes(quote), `XTheFarmerX 2:44–3:04 says: ${quote}`);
  }
}

export function runCatalysingCases(cat: CraftCatalog): void {
  testPriorsMirror();
  testBreachSlamByHand(cat);
  testTwentyPercentBand(cat);
  testChainEnds(cat);
  testWordingAndKb();
}
