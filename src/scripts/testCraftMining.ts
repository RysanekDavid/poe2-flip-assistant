/*
 * Craft-mining contract (npm run test:research, under runWithTestEnv):
 *   - the committed research tree (docs/research/craft-mining) parses and passes every cross-check;
 *   - the method vocabulary matches the planner's ALL_METHODS, and the out-of-patch table cites
 *     entities and patch-notes threads the KB already uses;
 *   - the extraction, route and priors schemas accept the reference examples and reject each
 *     defect class (missing timestamp, long quote, unflagged out-of-patch omen, bought start that
 *     does not ask, group asking more than it lists, table_reading promoted to a prior, …);
 *   - the loader fails loudly on cross-file defects, built in a temp copy of the tree.
 */
import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { entityById } from "../core/entities/load";
import { CRAFT_MINING_DIR, loadCraftMining, readCraftMining } from "../core/research/craftMining/load";
import { OUT_OF_PATCH } from "../core/research/craftMining/outOfPatch";
import { craftVideoExtractionSchema, priorsFileSchema, routeFileSchema } from "../core/research/craftMining/schema";
import { PLANNER_METHOD_IDS } from "../core/research/craftMining/schemaParts";
import { ALL_METHODS } from "../core/tools/planner/methods";
import { VALID_EXTRACTION, VALID_PRIORS, VALID_ROUTE_FILE } from "./craftMiningFixtures";

let passed = 0;
function ok(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`PASS  ${name}`);
}

type Mutate<T> = (draft: T) => void;
const variant = <T>(base: T, mutate: Mutate<T>): T => {
  const draft = structuredClone(base);
  mutate(draft);
  return draft;
};
/** Asserts the schema rejects the variant, with an issue message matching `why`. */
function rejects<T>(schema: { safeParse: (v: unknown) => { success: boolean; error?: { issues: { message: string }[] } } }, base: T, mutate: Mutate<T>, why: RegExp): void {
  const result = schema.safeParse(variant(base, mutate));
  assert.equal(result.success, false, `expected a rejection matching ${why}`);
  const messages = (result.error?.issues ?? []).map((i) => i.message).join(" | ");
  assert.match(messages, why);
}

ok("committed craft-mining tree parses with every cross-check", () => {
  const mining = loadCraftMining();
  const ring = mining.archetypes.find((a) => a.archetype.id === "ring-attack-flat");
  assert.ok(ring, "ring-attack-flat archetype present");
  assert.equal(ring.candidates.candidates.length, 10);
  assert.equal(ring.candidates.candidates.filter((c) => c.decision === "kept").length, 6);
  assert.equal(ring.marketSample?.items.length, 5);
  const groups = ring.archetype.targets.filter((t) => t.anyOf.length > 1);
  assert.ok(groups.some((g) => g.count === 3 && g.anyOf.some((m) => m.family === "PhysicalDamage")), "attack flats are an any-of group incl. phys");
});

ok("method vocabulary equals the planner's ALL_METHODS ids", () => {
  assert.deepEqual([...PLANNER_METHOD_IDS].sort(), ALL_METHODS.map((m) => m.id).sort());
});

ok("out-of-patch table: entities exist, patch-notes threads are the ones the crafting KB cites", () => {
  const kb = readFileSync(join(process.cwd(), "docs/research/poe2-crafting-knowledge.md"), "utf8");
  assert.equal(OUT_OF_PATCH.length, 4);
  for (const row of OUT_OF_PATCH) {
    for (const id of row.entityIds) assert.ok(entityById(id), `${row.id}: entity ${id} exists`);
    assert.ok(kb.includes(row.source.url), `${row.id}: ${row.source.url} is cited in poe2-crafting-knowledge.md`);
  }
});

ok("extraction schema: reference example parses", () => {
  const parsed = craftVideoExtractionSchema.safeParse(VALID_EXTRACTION);
  assert.ok(parsed.success, JSON.stringify(parsed.error?.issues.slice(0, 3)));
});

ok("extraction schema rejects each defect class", () => {
  const s = craftVideoExtractionSchema;
  rejects(s, VALID_EXTRACTION, (x) => Reflect.deleteProperty(x.steps[0]!, "at"), /Required/);
  rejects(s, VALID_EXTRACTION, (x) => void (x.measured[0]!.at = "about three minutes in"), /transcript timestamp/);
  rejects(s, VALID_EXTRACTION, (x) => void (x.claims[0]!.quote = "word ".repeat(26)), /at most 25 words/);
  rejects(s, VALID_EXTRACTION, (x) => void (x.steps[0]!.note = null), /"other" action/);
  rejects(s, VALID_EXTRACTION, (x) => void x.steps[1]!.omens.push("omen-of-homogenising-exaltation"), /out of patch/);
  rejects(s, VALID_EXTRACTION, (x) => void (x.patch.outOfPatch.flag = true), /gives reasons/);
  rejects(s, VALID_EXTRACTION, (x) => void (x.claims[0]!.kind = "material_price"), /names its material/);
  rejects(s, VALID_EXTRACTION, (x) => Object.assign(x.claims[0]!, { low: null, high: null }), /state a value/);
  rejects(s, VALID_EXTRACTION, (x) => void (x.measured[1]!.howMeasured = "read_off_a_tool" as "table_reading"), /Invalid enum/);
  rejects(s, VALID_EXTRACTION, (x) => void (x.steps[1]!.order = 1), /strictly increasing/);
  rejects(s, VALID_EXTRACTION, (x) => Object.assign(x, { extra: true }), /Unrecognized key/);
  // a flagged video naming the mechanic is legal: out-of-patch is recorded, not hidden
  const flagged = variant(VALID_EXTRACTION, (x) => {
    x.steps[1]!.omens.push("omen-of-homogenising-exaltation");
    x.patch.outOfPatch = { flag: true, reasons: ["uses Homogenising Exaltation"], mechanics: ["homogenising-omens"] };
  });
  assert.ok(s.safeParse(flagged).success);
});

ok("route schema: reference template parses (bought fractured start, any-of roles)", () => {
  const parsed = routeFileSchema.safeParse(VALID_ROUTE_FILE);
  assert.ok(parsed.success, JSON.stringify(parsed.error?.issues.slice(0, 3)));
});

ok("route schema rejects each defect class", () => {
  const s = routeFileSchema;
  const t = (f: typeof VALID_ROUTE_FILE) => f.templates[0]!;
  rejects(s, VALID_ROUTE_FILE, (f) => void (t(f).start.requiresPlayerConsent = false), /must ask the player/);
  rejects(s, VALID_ROUTE_FILE, (f) => void (t(f).start.carried = []), /carries at least one target role/);
  rejects(s, VALID_ROUTE_FILE, (f) => void (t(f).start.carried[0]!.fractured = false), /carries a fractured role/);
  rejects(s, VALID_ROUTE_FILE, (f) => void (t(f).start.kind = "clean"), /only a bought one/);
  rejects(s, VALID_ROUTE_FILE, (f) => void (t(f).targetRoles[1]!.count = 4), /exceeds the 3 families/);
  rejects(s, VALID_ROUTE_FILE, (f) => void t(f).targetRoles[0]!.anyOf.push({ ...t(f).targetRoles[0]!.anyOf[0]! }), /listed twice/);
  rejects(s, VALID_ROUTE_FILE, (f) => void (t(f).skeleton[0]!.method = "spam-chaos" as "chaos-loop"), /Invalid/);
  rejects(s, VALID_ROUTE_FILE, (f) => void (t(f).skeleton[3]!.note = null), /unsupported phase/);
  rejects(s, VALID_ROUTE_FILE, (f) => void (t(f).skeleton[0]!.targetRole = "rarity"), /no target role "rarity"/);
  rejects(s, VALID_ROUTE_FILE, (f) => void (t(f).decisionPoints[0]!.salvage = "vendor"), /no salvage "vendor"/);
  rejects(s, VALID_ROUTE_FILE, (f) => void (t(f).costClaims[0]!.sourceRef = "docs/kb/sources/transcripts/99-x.txt"), /not the ref of any source/);
  rejects(s, VALID_ROUTE_FILE, (f) => void t(f).conflicts[0]!.positions.pop(), /at least 2/);
  rejects(s, VALID_ROUTE_FILE, (f) => void (t(f).costClaims[0]!.low = 900), /high is below low/);
  rejects(s, VALID_ROUTE_FILE, (f) => void (t(f).archetype = "ring-caster"), /expected "ring-attack-flat"/);
  const magic = variant(VALID_ROUTE_FILE, (f) => {
    t(f).start = { kind: "bought_magic_with_target", carried: [{ role: "attack-flats", fractured: false }], askClaims: [], requiresPlayerConsent: true };
  });
  assert.ok(s.safeParse(magic).success, "a bought magic start with a non-fractured target is legal");
});

ok("priors schema: reference parses; table_reading and unsupported bases are rejected", () => {
  assert.ok(priorsFileSchema.safeParse(VALID_PRIORS).success);
  const s = priorsFileSchema;
  rejects(s, VALID_PRIORS, (f) => void (f.entries[0]!.basis = "table_reading" as "creator_stated"), /Invalid enum/);
  rejects(s, VALID_PRIORS, (f) => void (f.entries[0]!.basis = "creator_measured"), /states its sample size/);
  rejects(s, VALID_PRIORS, (f) => void (f.entries[0]!.value.point = 9), /low <= point <= high/);
  rejects(s, VALID_PRIORS, (f) => void (f.entries[0]!.key = "craftOfExile.weight"), /not a known prior key/);
  rejects(s, VALID_PRIORS, (f) => void (f.entries[0]!.sources = []), /cites a video timestamp/);
  rejects(s, VALID_PRIORS, (f) => void f.entries.push(structuredClone(f.entries[0]!)), /unique/);
  rejects(s, VALID_PRIORS, (f) => void (f.entries[0]!.sources = [{ url: "https://www.g2g.com/poe2" }]), /real-money-trading/);
});

/** A temp copy of the committed tree plus one extraction, route file and priors file to break. */
function withTempTree(fn: (dirs: { research: string; routes: string; priors: string }) => void): void {
  const root = mkdtempSync(join(tmpdir(), "craft-mining-test-"));
  try {
    const dirs = { research: join(root, "research"), routes: join(root, "routes"), priors: join(root, "priors") };
    cpSync(CRAFT_MINING_DIR, dirs.research, { recursive: true });
    mkdirSync(join(dirs.research, "ring-attack-flat", "extractions"), { recursive: true });
    mkdirSync(dirs.routes);
    mkdirSync(dirs.priors);
    writeJson(join(dirs.research, "ring-attack-flat", "extractions", "_sSjC5LX_Ck.json"), VALID_EXTRACTION);
    writeJson(join(dirs.routes, "ring-attack-flat.json"), VALID_ROUTE_FILE);
    writeJson(join(dirs.priors, "global.json"), VALID_PRIORS);
    fn(dirs);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
const writeJson = (path: string, value: unknown): void => writeFileSync(path, JSON.stringify(value, null, 2));
const throwsWith = (fn: () => unknown, why: RegExp): void => assert.throws(fn, (e: unknown) => e instanceof Error && why.test(e.message));

ok("loader cross-checks: a full tree with extraction, route and prior passes", () => {
  withTempTree((dirs) => {
    const mining = readCraftMining(dirs);
    assert.equal(mining.archetypes[0]?.extractions.length, 1);
    assert.equal(mining.routes[0]?.templates.length, 1);
    assert.equal(mining.priors[0]?.entries.length, 1);
  });
});

ok("loader rejects a table_reading promoted to a prior, and a measured prior without own attempts", () => {
  withTempTree((dirs) => {
    const promoted = variant(VALID_PRIORS, (f) => {
      f.entries[0] = { ...f.entries[0]!, key: "tierWeight.Rings.prefix.ColdDamage.1", value: { point: 0.056, low: 0.056, high: 0.056 }, sources: [{ videoId: "_sSjC5LX_Ck", at: "2:44–2:48" }] };
    });
    writeJson(join(dirs.priors, "global.json"), promoted);
    throwsWith(() => readCraftMining(dirs), /table_reading/);
    writeJson(join(dirs.priors, "global.json"), variant(VALID_PRIORS, (f) => Object.assign(f.entries[0]!, { basis: "creator_measured", n: 350 })));
    throwsWith(() => readCraftMining(dirs), /own_attempts/);
    writeJson(join(dirs.priors, "global.json"), VALID_PRIORS);
    writeJson(join(dirs.priors, "rings.json"), VALID_PRIORS);
    throwsWith(() => readCraftMining(dirs), /belongs in global\.json/);
  });
});

ok("loader rejects cross-file defects in the research tree", () => {
  const cases: Array<[string, (dirs: { research: string; routes: string; priors: string }) => void, RegExp]> = [
    ["stray file", (d) => writeFileSync(join(d.research, "ring-attack-flat", "notes.txt"), "x"), /unknown file "notes.txt"/],
    ["extraction filename", (d) => writeJson(join(d.research, "ring-attack-flat", "extractions", "kE8Tn32yNp0.json"), VALID_EXTRACTION), /must equal the filename/],
    ["dropped video", (d) => writeJson(join(d.research, "ring-attack-flat", "extractions", "ZYSD4tpH1p0.json"), { ...VALID_EXTRACTION, videoId: "ZYSD4tpH1p0" }), /was dropped/],
    ["unknown entity", (d) => writeJson(join(d.research, "ring-attack-flat", "extractions", "_sSjC5LX_Ck.json"), variant(VALID_EXTRACTION, (x) => void (x.steps[0]!.materials = ["essence-of-nothing"]))), /not in the entity catalog/],
    ["omen kind", (d) => writeJson(join(d.research, "ring-attack-flat", "extractions", "_sSjC5LX_Ck.json"), variant(VALID_EXTRACTION, (x) => void (x.steps[1]!.omens = ["chaos"]))), /not an omen/],
    ["route base", (d) => writeJson(join(d.routes, "ring-attack-flat.json"), variant(VALID_ROUTE_FILE, (f) => void (f.templates[0]!.bases = ["Iron Greaves"]))), /not a Rings base/],
    ["route family", (d) => writeJson(join(d.routes, "ring-attack-flat.json"), variant(VALID_ROUTE_FILE, (f) => void (f.templates[0]!.targetRoles[1]!.anyOf[0]!.family = "IncreasedCastSpeedTypo"))), /not in the craft catalog/],
    ["natural family off-pool", (d) => writeJson(join(d.routes, "ring-attack-flat.json"), variant(VALID_ROUTE_FILE, (f) => void (f.templates[0]!.targetRoles[1]!.anyOf[2]!.source = "natural"))), /does not roll as a natural suffix/],
    ["route archetype file", (d) => writeJson(join(d.routes, "ring-caster.json"), VALID_ROUTE_FILE), /must equal the filename/],
  ];
  for (const [name, breakIt, why] of cases) {
    withTempTree((dirs) => {
      breakIt(dirs);
      assert.throws(() => readCraftMining(dirs), (e: unknown) => e instanceof Error && why.test(e.message), name);
    });
  }
});

console.log(`PASS  craft mining: ${passed} checks`);
