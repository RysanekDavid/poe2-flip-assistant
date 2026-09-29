/* Stash-search emulator: the restricted regex dialect (accept/reject, ReDoS shapes refused), tooltip
 * normalization of real clipboard pastes, poe2.re tokens as expectations, and composed pool strings
 * run against the golden corpus (src/scripts/tools/regexCorpus/).
 * Run: npm run test:tools:regex (chained) or tsx src/scripts/tools/testRegexEmulator.ts */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SAFE_REGEX_LINE_CHARS, SafeRegexError, compileSafeRegex, parseSafeRegex, serializeSafeRegex } from "../../core/tools/regex/safeRegex";
import { compileSearch, evaluateSearch, matchesItem, tooltipLines } from "../../core/tools/regex/searchEmulator";
import { SearchParseError } from "../../core/tools/regex/explain";
import { composePool } from "../../core/tools/regex/poolCompose";
import { POOL_HEADERS } from "../../core/tools/regex/pools/headers";
import { RegexPoolSchema, type RegexPool } from "../../core/tools/regex/pools/schema";
import { generalizeLine } from "../../core/tools/regex/pools/template";
import { emptyPoolSelection, thresholdKey, type WaystoneSelection } from "../../lib/tools/regexPoolContract";

const CORPUS = join(process.cwd(), "src/scripts/tools/regexCorpus");
const corpus = (name: string): string => readFileSync(join(CORPUS, name), "utf8");

function testDialect(): void {
  const accepted = ["abc", "y: r", "er 1[0-6]\\)", "m rar.*", "(1[5-9]|[2-3].|4[0-2])%", "^monsters t", "ness$", "[^a-c]x?", "\\d+% i", "a|b|c", "\\+\\.", "(a|(b|c))d"];
  for (const p of accepted) assert.doesNotThrow(() => compileSafeRegex(p), `"${p}" is in the dialect`);
  const rejected: Array<[string, number]> = [
    ["(.+)+x", 4], // quantified group — the classic ReDoS shape
    ["(a*)*", 4],
    ["a**", 2],
    ["a+?", 2],
    ["a{2,5}", 1],
    ["(?=a)b", 1],
    ["(a)\\1", 3],
    ["\\w+", 0],
    ["\\b", 0],
    ["[z-a]", 3],
    ["[abc", 0],
    ["(ab", 0],
    ["ab)", 2],
    ["a||b", 2],
    ["*a", 0],
    ["^*", 1],
    ["a.*b.*c.*d", 0], // four unbounded repeats in one branch: over the step budget
    ["x|a.*b.*c", 2], // the budget is per top-level branch; the error points at the branch
    ["(a|b)(a|b)(a|b)(a|b)(a|b)(a|b)(a|b)(a|b)(a|b)x", 0],
    ["a?a?a?a?a?a?a?a?a?aaaaaaaaa", 0],
    ["", 0],
    ["a\\", 1],
  ];
  for (const [p, position] of rejected) {
    assert.throws(() => parseSafeRegex(p), (e: unknown) => e instanceof SafeRegexError && e.position === position, `"${p}" must be refused at ${position}`);
  }
  assert.equal(serializeSafeRegex(parseSafeRegex("(a|b)c\\d[x-z]")), "(?:a|b)c[0-9][x-z]", "groups become non-capturing, \\d an explicit class");
  const worst = testAdversarialTiming();
  console.log(`[regex] worst accepted adversarial shape: ${worst.worst.toFixed(1)} ms cold (${worst.shape.slice(0, 50)})`);
  const line = "a".repeat(SAFE_REGEX_LINE_CHARS);
  assert.throws(() => matchesItem(compileSearch("a.*z"), [`${line}x`]), RangeError, "longer lines are refused, not tested");
  // composer "any" output: several spanning tokens, one .* per top-level branch
  assert.doesNotThrow(() => compileSearch('"r skills h| .*% increased are|inions have .*% increased m| .*% increased sk"'), "unbounded repeats count per branch");
  assert.doesNotThrow(() => parseSafeRegex(Array.from({ length: 17 }, () => "(a|b)(c|d)(e|f)(g|h)").join("|")), "a long top-level alternation adds up, it does not multiply");
}

const DOTS = ".".repeat(100);
const G11 = "(a|a|a|a|a|a|a|a|a|a|a)";
const G10 = "(a|a|a|a|a|a|a|a|a|a)";

/** Review-reported ReDoS shapes and relatives: each is refused, or runs < 50 ms COLD on every line. */
const ADVERSARIAL = [
  "a?a?a?a?a?a?a?a?aaaaaaaa[a-z]*[a-z]*b",
  "a?a?a?a?a?a?a?a?aaaaaaaa.*b.*c",
  "a.*a.*z",
  "[a-z]*[a-z]*b",
  ".*.*b",
  "a?a?a?a?a?a?a?aaaaaaa.*b",
  "a?a?a?a?a?a?aaaaaa.*b",
  "(a|a)(a|a)(a|a)(a|a)(a|a)(a|a)(a|a).*b",
  "(a|a)(a|a)(a|a)(a|a)(a|a)(a|a)(a|a)(a|a)b",
  "a?a?a?a?a?a?a?a?aaaaaaaab",
  "\\d+\\d+x",
  "[0-9]*[0-9]*[0-9]*x",
  // tail re-matched after .* when V8 has no literal-tail fast path (anchor or group after it)
  `${G11}${G10}.*${DOTS}$b`,
  `${G11}${G10}.*${DOTS}(b)`,
  `${DOTS}^b`,
  `.*${DOTS}^b`,
  `a.*${DOTS}$b`,
  `(a|b).*${".".repeat(60)}(b)`,
  `a?a?a?a?a?a?.*${".".repeat(20)}$b`,
  `[a-z]*${"[a-z]".repeat(20)}$`,
  // top-level alternatives run in turn: three heavy branches in one term, four medium ones
  [1, 2, 3].map((i) => `${G11}${G10}.*${DOTS}$${"bcd"[i - 1]}`).join("|"),
  [0, 1, 2, 3].map((i) => `.*${".".repeat(105)}$${"bcde"[i]}`).join("|"),
  [0, 1, 2, 3].map((i) => `${"xyzw"[i]}.*${".".repeat(105)}(b)`).join("|"),
  // just under the budgets: these must be accepted AND fast, or the model is too loose
  `.*${".".repeat(50)}$b`,
  [0, 1].map((i) => `.*${".".repeat(40)}$${"bc"[i]}`).join("|"),
  `(a|b)(a|b).*${".".repeat(12)}(b)`,
  "a?a?a?a?aaaa.*b",
];

/** Shapes the budget must accept (so the timing assertions above measure something real). */
const NEAR_LIMIT = ADVERSARIAL.slice(-4);

function testAdversarialTiming(): { worst: number; shape: string } {
  const lines = ["a".repeat(SAFE_REGEX_LINE_CHARS), "b".repeat(SAFE_REGEX_LINE_CHARS), `${"a".repeat(150)}${"b".repeat(150)}`, "1".repeat(SAFE_REGEX_LINE_CHARS)];
  let worst = { worst: 0, shape: "" };
  for (const shape of NEAR_LIMIT) assert.doesNotThrow(() => compileSearch(`"${shape}"`), `near-limit shape ${shape.slice(0, 40)} is accepted`);
  for (const shape of ADVERSARIAL) {
    for (const line of lines) {
      let compiled: ReturnType<typeof compileSearch>;
      try {
        compiled = compileSearch(`"${shape}"`); // fresh RegExp per line: the timing below is a cold first run
      } catch (error: unknown) {
        assert.ok(error instanceof SafeRegexError, `${shape.slice(0, 40)} failed with ${String(error)}`);
        break;
      }
      const t0 = performance.now();
      matchesItem(compiled, [line]);
      const ms = performance.now() - t0;
      assert.ok(ms < 50, `accepted shape ${shape.slice(0, 60)} took ${ms.toFixed(1)} ms cold on a ${line.length}-char line`);
      if (ms > worst.worst) worst = { worst: ms, shape };
    }
  }
  return worst;
}

function testSearchParsing(): void {
  const s = compileSearch('"!m p|f l" col|"(1[5-9]|[2-9].)% of d" \\d');
  assert.deepEqual(s.terms.map((t) => t.negated), [true, false, false]);
  assert.ok(matchesItem(s, ["Monsters deal 17% of Damage as Extra Fire", "x 4"]), "| inside ( ) survives the term split");
  assert.equal(matchesItem(s, ["Monsters deal 17% of Damage as Extra Fire", "-10% maximum Player Resistances", "x 4"]), false, "negated alternation excludes");
  assert.throws(() => compileSearch('"(.+)+x"'), SafeRegexError, "pasted ReDoS is refused, not compiled");
  assert.throws(() => compileSearch('abc "def'), SearchParseError);
  assert.throws(() => compileSearch("a".repeat(501)), SearchParseError, "over 500 chars is refused before compiling");
  assert.throws(() => compileSearch("\\D5"), SafeRegexError, "\\D is refused, not lowercased into \\d");
  assert.throws(() => compileSearch('"x|\\W"'), SafeRegexError, "case-sensitive escapes survive term splitting");
  assert.ok(matchesItem("\\d5", ["Rune 45"]) && !matchesItem("\\d5", ["Rune X5"]), "\\d still means a digit");
  assert.ok(matchesItem("ABC", ["xabcx"]), "literals stay case-insensitive");
  assert.throws(() => matchesItem("abc", Array.from({ length: 101 }, () => "x")), RangeError, "over 100 lines is not one item");
  const ev = evaluateSearch('abc "!zzz"', ["xx", "xabcx"]);
  assert.deepEqual(ev, { ok: true, matched: true, terms: [{ raw: "abc", negated: false, holds: true, hitLines: [1] }, { raw: '"!zzz"', negated: true, holds: true, hitLines: [] }] });
  assert.deepEqual(evaluateSearch('"(.+)+x"', ["x"]), { ok: false, error: "a quantifier on a group can nest repetition — not supported (at char 5)", position: 4 }, "refusals come back as data for the worker");
  assert.equal(evaluateSearch("a", ["x".repeat(301)]).ok, false, "oversized lines are a refusal, not a throw");
  assert.throws(() => compileSearch(Array.from({ length: 41 }, (_, i) => `t${i}`).join(" ")), SearchParseError, "over 40 terms is refused");
}

function testCorpusNormalization(): void {
  const normal = tooltipLines(corpus("sidekick-1276-waystone.txt"));
  const advanced = tooltipLines(corpus("sidekick-1276-waystone.advanced.txt"));
  assert.deepEqual(advanced, normal, "advanced copy normalizes to the same tooltip lines");
  assert.ok(normal.includes("Item Rarity: +40%"), "(augmented) is clipboard-only");
  assert.ok(normal.includes("23% more Monster Life"));
  assert.ok(!normal.some((l) => l.startsWith("--")), "separators dropped");
}

function testPoe2reTokens(lines: readonly string[]): void {
  const magic = lines.map((l) => (l === "Rarity: Rare" ? "Rarity: Magic" : l));
  assert.ok(matchesItem('"y: r"', lines), "poe2.re `y: r` finds Rarity: Rare");
  assert.equal(matchesItem('"y: r"', magic), false, "…and not Rarity: Magic (Item/Monster Rarity lines read `y: +`)");
  const tier = (n: number): string[] => lines.map((l) => l.replace("(Tier 15)", `(Tier ${n})`));
  assert.ok(matchesItem('"er 1[0-6]\\)"', lines), "poe2.re tier 10–16 token finds T15");
  for (const n of [1, 5, 9]) assert.equal(matchesItem('"er 1[0-6]\\)"', tier(n)), false, `…not T${n}`);
  assert.ok(matchesItem('"m rar.*\\+([4-9].|1..)%"', lines), "poe2.re-style `m rar.*` reads Item Rarity +40%");
  assert.equal(matchesItem('"m rar.*\\+([5-9].|1..)%"', lines), false, "…and 40 is below 50");
}

function loadWaystone(): RegexPool {
  return RegexPoolSchema.parse(JSON.parse(readFileSync(join(process.cwd(), "src/data/poe2/regex/waystone.json"), "utf8")));
}

/** Every rolled line of the corpus waystone is a template of exactly one pool mod. */
function testCorpusInPool(pool: RegexPool, lines: readonly string[]): Map<string, string> {
  const owner = new Map<string, string>();
  const modLines = lines.slice(lines.indexOf("Item Level: 81") + 1, lines.findIndex((l) => l.startsWith("Can be used")));
  assert.equal(modLines.length, 8);
  for (const line of modLines) {
    const { template } = generalizeLine(line);
    const mods = pool.mods.filter((m) => m.lines.some((l) => l.template === template));
    assert.equal(mods.length, 1, `corpus line "${line}" belongs to exactly one pool mod (${mods.map((m) => m.id).join(",")})`);
    owner.set(line, mods[0]?.id ?? "");
  }
  return owner;
}

function compose(pool: RegexPool, sel: Partial<WaystoneSelection>, maxChars = 250): string[] {
  const out = composePool(pool, POOL_HEADERS.waystone, { ...emptyPoolSelection("waystone"), ...sel }, { maxChars });
  assert.equal(out.reason, null, `composed: ${out.reason ?? ""}`);
  return out.chunks.map((c) => c.text);
}

const lit = (chunks: readonly string[], lines: readonly string[]): boolean => chunks.some((c) => matchesItem(c, lines));

function testComposedAgainstCorpus(pool: RegexPool, lines: readonly string[], owner: Map<string, string>): void {
  const tough = owner.get("23% more Monster Life") ?? "";
  const ailment = owner.get("Monster have 106% increased Elemental Ailment Application") ?? "";
  assert.ok(lit(compose(pool, { mods: { [tough]: "want" } }), lines), "want Tough finds the corpus waystone");
  assert.ok(lit(compose(pool, { mods: { MapPlayerMaximumResists: "want", [tough]: "want" } }), lines), "any-mode with one present mod");
  assert.equal(lit(compose(pool, { mods: { MapPlayerMaximumResists: "want", [tough]: "want" }, match: "all" }), lines), false, "all-mode needs both");
  assert.equal(lit(compose(pool, { mods: { [tough]: "want", [ailment]: "avoid" } }), lines), false, "avoided mod hides it");
  assert.ok(lit(compose(pool, { mods: { [tough]: "want", MapPlayerMaximumResists: "avoid" } }), lines), "absent avoid keeps it");
  const th = (min: number, max: number | null) => ({ mods: { [ailment]: "want" as const }, thresholds: { [thresholdKey(ailment, 0, 0)]: { min, max } } });
  assert.ok(lit(compose(pool, th(100, null)), lines), "106 ≥ 100");
  assert.ok(lit(compose(pool, th(106, 106)), lines), "106 in 106..106");
  assert.equal(lit(compose(pool, th(107, null)), lines), false, "106 < 107");
  assert.equal(lit(compose(pool, th(10, 99)), lines), false, "106 > 99 (no digit-suffix false positive)");
  assert.ok(lit(compose(pool, { tier: { min: 15, max: 16 } }), lines), "T15 in 15–16");
  assert.equal(lit(compose(pool, { tier: { min: 1, max: 14 } }), lines), false, "T15 outside 1–14");
  assert.ok(lit(compose(pool, { props: { itemRarity: { min: 40, max: null } } }), lines), "Item Rarity +40 ≥ 40");
  assert.equal(lit(compose(pool, { props: { itemRarity: { min: 41, max: null } } }), lines), false, "…not ≥ 41");
  assert.ok(lit(compose(pool, { props: { monsterRarity: { min: 100, max: null }, waystoneDrop: { min: 120, max: 150 } } }), lines), "two properties");
  assert.ok(lit(compose(pool, { props: { revives: { min: 0, max: 0 } } }), lines), "Revives Available: 0");
  assert.ok(lit(compose(pool, { corrupted: "only" }), lines), "corrupted only");
  assert.equal(lit(compose(pool, { corrupted: "exclude" }), lines), false, "corrupted excluded");
  assert.ok(lit(compose(pool, { rarity: ["rare"] }), lines), "rarity rare");
  assert.equal(lit(compose(pool, { rarity: ["magic", "normal"] }), lines), false, "rarity magic/normal");
}

testDialect();
testSearchParsing();
testCorpusNormalization();
const lines = tooltipLines(corpus("sidekick-1276-waystone.txt"));
testPoe2reTokens(lines);
const pool = loadWaystone();
testComposedAgainstCorpus(pool, lines, testCorpusInPool(pool, lines));
console.log("ALL PASS — safe regex dialect, search parsing, corpus normalization, poe2.re expectations, composed strings vs Sidekick #1276");
