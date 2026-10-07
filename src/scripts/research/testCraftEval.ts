/*
 * craft:eval contract (npm run test:research, under runWithTestEnv research-eval):
 *   - the golden schema accepts the committed set and a reference entry, and rejects each defect
 *     class (unknown material or tag, upside-down band, bad source, compare with a bought start…);
 *   - every planner method (ALL_METHODS + the start moves) has a tag row and a step pattern, every
 *     step of the fixture plans maps, and an unknown step method throws;
 *   - the cost, ratio, pass and overlap math, and the --check gate on synthetic scoreboards.
 */
import assert from "node:assert/strict";
import { loadCraftCatalog } from "../../core/tools/craftmoves/catalog";
import { ALL_METHODS } from "../../core/tools/planner/methods";
import { planCraft } from "../../core/tools/planner/plan";
import { readGoldenEntries, readPriceSnapshot } from "../../core/research/craftMining/goldenLoad";
import { buildSnapshot, priceSnapshotSchema } from "../../core/research/craftMining/goldenPrices";
import { goldenEntrySchema, GOLDEN_TAGS, type GoldenEntryInput } from "../../core/research/craftMining/goldenSchema";
import { macroOf, MACRO_METHOD_IDS, METHOD_TAGS, planTags, START_METHOD_IDS, stepTags, STEP_PATTERNS } from "../../core/research/craftMining/goldenTags";
import { BREACH_RING, FOUR_FLAT_DUSK, FRACTURE_PLUS3_AMULET, FRACTURED_T1RES_RING, OWNER_FLAT_RING, OWNER_POOL_RING, fixturePrices } from "../tools/plannerFixtures";
import { runScoreCases } from "./craftEvalScoreCases";

let passed = 0;
function ok(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`PASS  ${name}`);
}

const VALID: GoldenEntryInput = {
  id: "reference-ring",
  archetype: "ring-attack-flat",
  patch: "0.5",
  league: "Runes of Aldur",
  summary: "Reference entry for the schema tests.",
  planRequest: { itemClass: "Rings", base: "Breach Ring", ilvl: 82, targets: [{ family: "ColdDamage", side: "prefix", minModId: "AddedColdDamage9" }] },
  creator: {
    tags: ["chaos-loop", "fracture-target"],
    materials: [{ id: "chaos", uses: { point: 400, low: 200, high: 600 } }],
    baseDiv: { point: 65, low: 60, high: 70 },
    statedTotalDiv: { point: 350, low: 300, high: 400 },
    steps: ["Buy the fractured base.", "Chaos until the second flat."],
  },
  market: { priceDiv: { point: 380, low: 350, high: 450 }, date: "2026-10-06", source: "owner trade check" },
  sources: [
    { kind: "video", ref: "TWgmQuiLeHA", at: "2:20–2:26" },
    { kind: "web", ref: "https://poe2db.tw/us/Breach_Ring", at: null },
    { kind: "owner", ref: "trade check", at: null },
  ],
  confidence: "medium",
  factCheck: { date: "2026-10-07", verdict: "ok", notes: "checked against the transcript" },
};

type Mutate = (draft: GoldenEntryInput & Record<string, unknown>) => void;
function rejects(mutate: Mutate, why: RegExp): void {
  const draft = structuredClone(VALID) as GoldenEntryInput & Record<string, unknown>;
  mutate(draft);
  const result = goldenEntrySchema.safeParse(draft);
  assert.equal(result.success, false, `expected a rejection matching ${why}`);
  assert.match(result.error.issues.map((i) => i.message).join(" | "), why);
}

ok("golden schema: the reference entry parses, startMode defaults to request", () => {
  const parsed = goldenEntrySchema.safeParse(VALID);
  assert.ok(parsed.success, JSON.stringify(parsed.error?.issues.slice(0, 3)));
  assert.equal(parsed.data.startMode, "request");
});

ok("golden schema: rejects each defect class", () => {
  rejects((d) => void (d.creator.materials[0]!.id = "chaos-orb"), /not a planner material id/);
  rejects((d) => void (d.creator.tags = ["chaos-loop", "teleport"] as never), /Invalid enum value/);
  rejects((d) => void (d.creator.tags = ["chaos-loop", "chaos-loop"]), /listed twice/);
  rejects((d) => void (d.creator.materials = [...d.creator.materials, { id: "chaos", uses: { point: 1, low: 1, high: 1 } }]), /listed twice/);
  rejects((d) => void (d.creator.baseDiv = { point: 50, low: 60, high: 70 }), /low ≤ point ≤ high/);
  rejects((d) => void (d.creator.materials[0]!.uses = { point: 0, low: 0, high: 0 }), /used at least a little/);
  rejects((d) => void (d.sources[0]!.ref = "not-a-video-id"), /11-character YouTube id/);
  rejects((d) => void (d.sources[1]!.ref = "http://poe2db.tw"), /https URL/);
  rejects((d) => void (d.sources[2]!.at = "1:00"), /only a video source/);
  rejects((d) => void (d.planRequest = { ...d.planRequest, targets: [] }), /pick at least one mod/);
  rejects((d) => void (d.market = { priceDiv: { point: 1, low: 1, high: 1 }, date: "6.10.2026", source: "x" }), /YYYY-MM-DD/);
  rejects((d) => void (d.startMode = "compare", (d.planRequest.start = { kind: "bought", carried: null, askDiv: null })), /leave planRequest.start out/);
  rejects((d) => void (d.extra = 1), /Unrecognized key/);
  rejects((d) => void (d.id = "Not Kebab"), /kebab-case/);
});

ok("committed golden set and price snapshot parse (ids = filenames)", () => {
  const entries = readGoldenEntries();
  assert.ok(entries.some((e) => e.id === "breach-ring-3-t1-attack-flats-owner"), "the owner's seed entry is committed");
  const snapshot = readPriceSnapshot();
  assert.ok(Object.keys(snapshot.prices).length > 50, "the snapshot prices most planner materials");
});

ok("price snapshot: keeps planner materials only, lists the unpriced, derives Exalted per Divine", () => {
  const s = buildSnapshot({ league: "L", fetchedAt: new Date("2026-10-07T00:00:00Z"), source: "test", divPerUnit: new Map([["exalted", 0.004], ["chaos", 0.035], ["annul", 0], ["mirror-of-kalandra", 1000]]) });
  assert.deepEqual(Object.keys(s.prices).sort(), ["chaos", "exalted"]);
  assert.ok(s.unpriced.includes("annul") && !s.unpriced.includes("mirror-of-kalandra"));
  assert.equal(s.exaltPerDivine, 250);
  assert.ok(priceSnapshotSchema.safeParse(s).success);
  assert.equal(priceSnapshotSchema.safeParse({ ...s, prices: { ...s.prices, "mirror-of-kalandra": 1000 } }).success, false);
});

ok("tag table: one row per planner method and start move, each with exactly one step pattern", () => {
  const ids = [...ALL_METHODS.map((m) => m.id), ...START_METHOD_IDS].sort();
  assert.deepEqual(Object.keys(METHOD_TAGS).sort(), ids);
  assert.deepEqual([...MACRO_METHOD_IDS].sort(), ids);
  for (const id of ids) assert.ok(STEP_PATTERNS.some(([, m]) => m === id), `${id} has a step pattern`);
  for (const tags of Object.values(METHOD_TAGS)) for (const t of tags) assert.ok((GOLDEN_TAGS as readonly string[]).includes(t));
});

ok("tag table: step variants map to their macro, an unknown step method throws", () => {
  const cases: Array<[string, string]> = [
    ["slam-prefix-exalt-perfect-catalysing", "slam-fill"],
    ["slam-suffix-exalt", "slam-fill"],
    ["magic-loop-aug-greater", "magic-loop"],
    ["desecrate-ancient-echoes", "desecrate"],
    ["desecrate-liege", "desecrate"],
    ["essence-perfect:perfect-essence-of-the-mind:suffix", "essence-perfect"],
    ["alloy:swift-alloy:suffix", "alloy"],
    ["alloy:sovereign-alloy", "alloy"],
    ["essence-greater:greater-essence-of-opulence", "essence-greater"],
    ["breach-quality:prefix", "breach-quality"],
    ["strip-prefix", "strip-side"],
    ["strip-contempt", "strip-contempt"],
    ["strip-desecrated", "strip-desecrated"],
    ["strip-junk", "strip-junk"],
    ["acquire-anchored-suffix", "acquire-anchored"],
  ];
  for (const [step, macro] of cases) assert.equal(macroOf(step), macro, step);
  assert.throws(() => macroOf("brand-new-method"), /matches 0 tag patterns/);
  assert.deepEqual(stepTags({ method: "alloy:swift-alloy:suffix", materials: [] }), ["alloy"], "an alloy step is tagged alloy");
});

ok("tag derivation: materials name the Exalt tier and omens; unused materials don't count", () => {
  const mat = (id: string, group: "currency" | "omen" | "catalyst", point: number) => ({ id, label: id, group, qty: { point, low: 0, high: point }, unitDiv: null, totalDiv: null });
  const tags = stepTags({ method: "slam-prefix-exalt-perfect", materials: [mat("perfect-exalted-orb", "currency", 2), mat("omen-of-sinistral-exaltation", "omen", 2), mat("annul", "currency", 0), mat("xophs-catalyst", "catalyst", 10)] });
  assert.deepEqual(tags.sort(), ["catalyse", "exalt-omen-side", "perfect-exalt"]);
});

ok("tag derivation: every step of the fixture plans maps (clean and bought starts)", () => {
  const cat = loadCraftCatalog();
  const reqs = [BREACH_RING, FRACTURED_T1RES_RING, FRACTURE_PLUS3_AMULET, OWNER_FLAT_RING, FOUR_FLAT_DUSK, OWNER_POOL_RING(undefined), OWNER_POOL_RING({ kind: "bought", carried: null, askDiv: null })];
  const seen = new Set<string>();
  for (const req of reqs) {
    const plan = planCraft(req, { cat, prices: fixturePrices(), exaltPerDivine: 250, league: "Test", now: new Date("2026-10-07T00:00:00Z") });
    for (const t of planTags(plan.steps)) seen.add(t);
  }
  for (const t of ["bought-base", "fracture-target", "whittle", "desecrate"]) assert.ok(seen.has(t), `fixture plans produce ${t}`);
});

runScoreCases(ok);
console.log(`\n${passed} craft:eval check(s) passed`);
