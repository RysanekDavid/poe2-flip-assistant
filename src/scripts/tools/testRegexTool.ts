/* Price regex: regex_presets schema + preset round-trip on the temp DB, and the pure core —
 * namespace, collision-safe fragments, greedy cover, chunking/quoting and the search parser.
 * Run: npm run test:tools:regex */
import assert from "node:assert/strict";
import type Database from "better-sqlite3";
import { applicationSchemaSql } from "../../db/schemaFiles";
import { deleteRegexPreset, listRegexPresets, saveRegexPreset } from "../../db/regexPresetQueries";
import { buildNamespace, type ExchangeInput, type NamespaceInput } from "../../core/tools/regex/namespace";
import { shortestUniqueFragment } from "../../core/tools/regex/fragment";
import {
  buildRegex,
  composeChunks,
  coverWithFragments,
  renderChunk,
  selectTargets,
  type FragmentPick,
} from "../../core/tools/regex/compose";
import { SearchParseError, explainSearch, parseSearch } from "../../core/tools/regex/explain";
import { emptyPoolSelection, thresholdKey } from "../../lib/tools/regexPoolContract";
import { assertPanelExport, columnsOf, freshToolsDb, insertUser } from "./toolsTestKit";
import { testExplainJob, testPresetsPerTab, testShareRoundTrip, testVendorCompose, testWorkerRunner } from "./testRegexUi";
import { testRegexUiLinks } from "./testRegexUiLinks";

function testSchemaOrder(): void {
  const ddl = applicationSchemaSql();
  const users = ddl.indexOf("CREATE TABLE IF NOT EXISTS users");
  const snapshots = ddl.indexOf("CREATE TABLE IF NOT EXISTS balance_snapshots");
  const presets = ddl.indexOf("CREATE TABLE IF NOT EXISTS regex_presets");
  const items = ddl.indexOf("CREATE TABLE IF NOT EXISTS balance_items");
  assert.ok(users >= 0 && snapshots >= 0 && presets >= 0 && items >= 0, "all four tables must be in the application DDL");
  assert.ok(users < presets && snapshots < items, "FK targets must be created before the tools tables");
}

function testPresets(): Database.Database {
  const db = freshToolsDb();
  assert.deepEqual(columnsOf(db, "regex_presets"), [
    "id", "user_id", "league", "name", "params_json", "created_at", "updated_at",
  ]);
  const insert = db.prepare("INSERT INTO regex_presets (user_id, league, name, params_json) VALUES (?, 'L', ?, '{}')");
  const alice = insertUser(db, "regex-alice");
  const bob = insertUser(db, "regex-bob");
  insert.run(alice, "chaos 5+");
  insert.run(bob, "chaos 5+"); // same name, different user — allowed
  assert.throws(() => insert.run(alice, "chaos 5+"), /UNIQUE/, "name is unique per user");
  assert.throws(() => insert.run(999_999, "orphan"), /FOREIGN KEY/, "preset needs a real user");

  db.prepare("DELETE FROM users WHERE id = ?").run(alice);
  const left = db.prepare("SELECT user_id FROM regex_presets").all() as Array<{ user_id: number }>;
  assert.deepEqual(left.map((r) => r.user_id), [bob], "deleting a user cascades to their presets only");
  return db;
}

/** Rows saved before tabs existed read as Price presets; pool-tab presets round-trip intact. */
function testPresetTabs(db: Database.Database, userId: number): void {
  const legacy = { mode: "trash", minDiv: 2, categories: ["Runes"], includeUniques: false };
  db.prepare("INSERT INTO regex_presets (user_id, league, name, params_json) VALUES (?, 'L', 'legacy', ?)").run(userId, JSON.stringify(legacy));
  const read = listRegexPresets(userId).find((p) => p.name === "legacy");
  assert.deepEqual(read?.params, { tab: "price", ...legacy }, "a row without tab migrates to the price tab on read");
  const pool = {
    ...emptyPoolSelection("waystone"),
    mods: { MapMonsterDamageAsFire: "want" as const, MapPlayerMaximumResists: "avoid" as const },
    thresholds: { [thresholdKey("MapMonsterDamageAsFire", 0, 0)]: { min: 15, max: null } },
    props: { itemRarity: { min: 40, max: null } },
    tier: { min: 15, max: 16 },
  };
  const savedPool = saveRegexPreset(userId, "L", "t15 fire", pool);
  assert.deepEqual(savedPool.params, pool, "a waystone preset survives the round-trip");
  db.prepare("INSERT INTO regex_presets (user_id, league, name, params_json) VALUES (?, 'L', 'future', ?)").run(userId, JSON.stringify({ tab: "maps3d" }));
  assert.match(listRegexPresets(userId).find((p) => p.name === "future")?.invalid ?? "", /tab/, "an unknown tab is flagged, not guessed");
  db.prepare("DELETE FROM regex_presets WHERE user_id = ?").run(userId);
}

function testPresetRoundTrip(db: Database.Database): void {
  const carol = insertUser(db, "regex-carol");
  const dave = insertUser(db, "regex-dave");
  const params = { tab: "price" as const, mode: "keep" as const, minDiv: 1.5, categories: ["Runes", "Currency"], includeUniques: true };
  const saved = saveRegexPreset(carol, "Runes of Aldur", "runes 1.5+", params);
  assert.deepEqual(saved.params, params, "params survive the JSON round-trip");
  assert.equal(saved.invalid, null);

  const again = saveRegexPreset(carol, "Standard", "runes 1.5+", { ...params, minDiv: 3 });
  assert.equal(again.id, saved.id, "same name upserts in place");
  assert.equal(again.league, "Standard");
  assert.equal(again.params?.tab === "price" ? again.params.minDiv : null, 3);
  testPresetTabs(db, dave);

  db.prepare("INSERT INTO regex_presets (user_id, league, name, params_json) VALUES (?, 'L', 'broken', ?)").run(
    carol,
    JSON.stringify({ mode: "hoard", minDiv: -1 }),
  );
  const listed = listRegexPresets(carol);
  assert.deepEqual(listed.map((p) => p.name), ["broken", "runes 1.5+"]);
  const broken = listed.find((p) => p.name === "broken");
  assert.equal(broken?.params, null, "an unparseable row is returned flagged, not dropped");
  assert.match(broken?.invalid ?? "", /mode/);
  assert.deepEqual(listRegexPresets(dave), [], "presets are per user");

  assert.equal(deleteRegexPreset(dave, saved.id), false, "cannot delete another user's preset");
  assert.equal(deleteRegexPreset(carol, saved.id), true);
  assert.deepEqual(listRegexPresets(carol).map((p) => p.name), ["broken"]);
}

const ex = (itemName: string, category: string, baseValue: number): ExchangeInput => ({
  itemId: itemName.toLowerCase().replace(/\W+/g, "-"),
  itemName,
  category,
  baseValue,
  icon: `https://example.test/${itemName}.png`,
});

function ns(partial: Partial<NamespaceInput>) {
  return buildNamespace({ exchange: [], uniqueValues: new Map(), uniqueNames: [], bases: [], statTexts: [], ...partial });
}

function entry(n: ReturnType<typeof ns>, key: string) {
  const e = n.byKey.get(key);
  assert.ok(e, `namespace must contain "${key}"`);
  return e;
}

function testNamespace(): void {
  const n = ns({
    exchange: [ex("Rune of Zorbing", "Runes", 2)],
    uniqueValues: new Map([["incomplete", 9], ["glimmerfang", 4]]),
    uniqueNames: ["Glimmerfang", "INCOMPLETE"],
    statTexts: ["Adds # to # Zorbing Damage", "rune of zorbing"],
  });
  assert.equal(n.byKey.has("incomplete"), false, "scout INCOMPLETE placeholder is dropped");
  assert.equal(entry(n, "rune of zorbing").kind, "exchange", "priced exchange entry wins the key over a stat line");
  assert.equal(entry(n, "glimmerfang").valueDiv, 4);
  const stat = entry(n, "adds to zorbing damage");
  assert.equal(stat.haystack, "adds\nto\nzorbing damage", "stat templates split at # so no fragment spans a number");
  assert.ok(n.byKey.has("stackable currency"), "item-text boilerplate lines are in the namespace");
}

function testFragments(): void {
  const alone = ns({ exchange: [ex("Zorblax", "Currency", 3)] });
  const z = entry(alone, "zorblax");
  assert.deepEqual(shortestUniqueFragment(z, alone, new Set([z.key])), { fragment: "zor", literal: "zor", collisions: [] });

  const withStat = ns({ exchange: [ex("Zorblax", "Currency", 3)], statTexts: ["#% chance of Zorbing"] });
  const r = shortestUniqueFragment(entry(withStat, "zorblax"), withStat, new Set(["zorblax"]));
  assert.ok(!"% chance of zorbing".includes(r.fragment), `fragment "${r.fragment}" must avoid the stat text`);
  assert.equal(r.fragment, "rbl", "shortest substring not in the mod line");

  const pair = ns({ exchange: [ex("Zorblax", "Currency", 3), ex("Zorblax Prime", "Currency", 1)] });
  const prime = entry(pair, "zorblax prime");
  assert.equal(shortestUniqueFragment(prime, pair, new Set(["zorblax", "zorblax prime"])).fragment, "zor", "matching another selected item is fine");
  assert.equal(shortestUniqueFragment(prime, pair, new Set(["zorblax prime"])).fragment, "pri", "an unselected superstring owner forces a different fragment");

  const trapped = ns({ exchange: [ex("Rune", "Runes", 5)], statTexts: ["Rune of #"] });
  assert.deepEqual(shortestUniqueFragment(entry(trapped, "rune"), trapped, new Set(["rune"])), {
    fragment: "rune",
    literal: "rune",
    collisions: ["Rune of #"],
  }, "no safe substring → full name plus the collisions to verify in-game");

  const spaced = ns({
    exchange: [ex("Ab Cdefgh", "Currency", 1)],
    statTexts: ["abx", "bcd", "cde", "def", "efg", "fgh", "cdefg", "defgh"],
  });
  assert.equal(shortestUniqueFragment(entry(spaced, "ab cdefgh"), spaced, new Set()).fragment, "b c", "spaced fragment wins when ≥3 chars shorter");
  const punct = ns({ exchange: [ex("Kulemak's Invitation", "Fragments", 2)], statTexts: ["Invitation", "kulemak"] });
  const k = shortestUniqueFragment(entry(punct, "kulemak's invitation"), punct, new Set());
  assert.ok(/^[a-z' ]+$/.test(k.fragment) && "kulemak's invitation".includes(k.fragment), `apostrophe name gives a literal fragment (${k.fragment})`);
}

function testCoverAndSelect(): void {
  const n = ns({
    exchange: [ex("Zorblax", "Currency", 10), ex("Zorblax Prime", "Currency", 5), ex("Quuxite", "Runes", 0.2), ex("Blorp", "Runes", 7)],
    uniqueValues: new Map([["mirrorfang", 50]]),
    uniqueNames: ["Mirrorfang"],
  });
  const all = selectTargets(n, { minDiv: 1, categories: ["Currency", "Runes"], includeUniques: true });
  assert.deepEqual(all.map((t) => t.name), ["Mirrorfang", "Zorblax", "Blorp", "Zorblax Prime"], "value desc, threshold applied");
  assert.deepEqual(
    selectTargets(n, { minDiv: 1, categories: ["Runes"], includeUniques: false }).map((t) => t.name),
    ["Blorp"],
    "category filter and uniques toggle",
  );
  const picks = coverWithFragments(all, n);
  assert.equal(picks.length, 3, "Zorblax Prime rides on Zorblax's fragment");
  const zor = picks.find((p) => p.target.name === "Zorblax");
  assert.deepEqual(zor?.covers.map((t) => t.name), ["Zorblax", "Zorblax Prime"]);

  const gems = ns({ exchange: [ex("Uncut Skill Gem (Level 20)", "UncutGems", 9), ex("Skillet", "Currency", 2)] });
  assert.equal(entry(gems, "uncut skill gem (level 20)").haystack, "uncut skill gem", "ninja qualifier is not item text");
  const out = buildRegex(gems, { mode: "keep", minDiv: 1, categories: ["UncutGems"], includeUniques: false, maxChars: 50 });
  assert.deepEqual(out.uncovered.map((u) => u.reason), ["qualifier-not-item-text"]);
  assert.deepEqual(out.chunks, [], "an unsearchable name produces no string rather than one that matches nothing");
  const sk = buildRegex(gems, { mode: "keep", minDiv: 1, categories: ["Currency"], includeUniques: false, maxChars: 50 });
  assert.ok(!"uncut skill gem".includes(sk.covered[0]?.fragment ?? "uncut"), "the gem's bare name still collides");
}

const fakePick = (fragment: string): FragmentPick => {
  const target = { key: fragment, name: fragment, kind: "exchange" as const, valueDiv: 1, haystack: fragment };
  return { fragment, literal: fragment, target, collisions: [], covers: [target] };
};

function testChunking(): void {
  assert.equal(renderChunk(["abc", "def"], "keep"), "abc|def");
  assert.equal(renderChunk(["of the", "abc"], "keep"), '"of the|abc"', "any space quotes the whole alternation");
  assert.equal(renderChunk(["abc", "of the"], "trash"), '"!abc|of the"');

  const picks = ["abcd", "efgh", "ijkl", "mnopqrstuvwxyz0123", "qr"].map(fakePick);
  const { chunks, tooLong } = composeChunks(picks, 12, "keep");
  assert.deepEqual(tooLong.map((p) => p.fragment), ["mnopqrstuvwxyz0123"], "a fragment is never split");
  assert.deepEqual(chunks.map((c) => c.text), ["abcd|efgh|qr", "ijkl"], "first-fit, value order");
  for (const c of chunks) assert.ok(c.chars <= 12 && c.chars === c.text.length);
  const trash = composeChunks(picks.slice(0, 3), 12, "trash").chunks;
  assert.deepEqual(trash.map((c) => c.text), ['"!abcd|efgh"', '"!ijkl"'], "quotes and ! count against the limit");

  const n = ns({ exchange: [ex("Zorblax", "Currency", 10), ex("Blorp", "Runes", 7)] });
  const empty = buildRegex(n, { mode: "keep", minDiv: 1, categories: [], includeUniques: false, maxChars: 50 });
  assert.deepEqual(empty.chunks, []);
  assert.match(empty.reason ?? "", /no categories/);
  const trashOut = buildRegex(n, { mode: "trash", minDiv: 1, categories: ["Currency", "Runes"], includeUniques: false, maxChars: 20 });
  assert.equal(trashOut.chunks.length, 1);
  assert.deepEqual(trashOut.warnings.map((w) => w.code), ["trash-negation-unconfirmed"]);
  assert.ok(trashOut.covered.every((c) => c.perUnit), "exchange values are per unit");
}

function testParseAndExplain(): void {
  const ast = parseSearch('ZOR|"of the" !blorp');
  assert.deepEqual(ast.terms.map((t) => [t.negated, t.alternatives]), [[false, ["zor", "of the"]], [true, ["blorp"]]]);
  assert.deepEqual(parseSearch(renderChunk(["abc", "of the"], "trash")).terms[0]?.alternatives, ["abc", "of the"]);
  const cases: Array<[string, number]> = [['abc "def', 4], ["a||b", 0], ["!", 0], ["   ", 0], ["x |", 2]];
  for (const [text, position] of cases) {
    assert.throws(() => parseSearch(text), (e: unknown) => e instanceof SearchParseError && e.position === position, `"${text}"`);
  }
  const n = ns({ exchange: [ex("Zorblax", "Currency", 10), ex("Blorp", "Runes", 7)], statTexts: ["# Zorbing"] });
  const out = explainSearch(parseSearch("ZOR"), n);
  assert.deepEqual(out.terms[0]?.names.exchange, ["Zorblax"], "case-insensitive literal match");
  assert.equal(out.terms[0]?.counts.stat, 1, "stat lines counted");
  assert.deepEqual(explainSearch(parseSearch('"!zor"'), n).highlighted, ["Blorp"], "negation highlights the rest");
  const redos = explainSearch(parseSearch("(.+)+x"), n);
  assert.equal(redos.highlightedCount, 0, "regex syntax is matched literally — never evaluated server-side");
  const dotted = ns({ exchange: [ex("St. Zorb", "Currency", 1), ex("Stoat Zorb", "Currency", 1)] });
  assert.deepEqual(explainSearch(parseSearch("st\\."), dotted).highlighted, ["St. Zorb"], "a backslash-escape stands for the literal char");
}

function testTrashUncovered(): void {
  const n = ns({ exchange: [ex("Zorblax", "Currency", 10), ex("Uncut Skill Gem (Level 20)", "UncutGems", 9)] });
  const params = { minDiv: 1, categories: ["Currency", "UncutGems"], includeUniques: false, maxChars: 50 };
  const trash = buildRegex(n, { ...params, mode: "trash" });
  assert.equal(trash.mode, "trash");
  const lit = trash.warnings.find((w) => w.code === "trash-uncovered-lit");
  assert.ok(lit, "an uncovered valuable item in trash mode is flagged as lit");
  assert.match(lit.detail, /^1 valuable items can't be protected/);
  const keep = buildRegex(n, { ...params, mode: "keep" });
  assert.equal(keep.warnings.some((w) => w.code === "trash-uncovered-lit"), false, "keep mode leaves uncovered items dark");
}

testSchemaOrder();
const db = testPresets();
testPresetRoundTrip(db);
testNamespace();
testFragments();
testCoverAndSelect();
testChunking();
testParseAndExplain();
testTrashUncovered();
testPresetsPerTab(insertUser(db, "regex-erin"));
testShareRoundTrip();
testExplainJob();
testVendorCompose();
testRegexUiLinks();
assertPanelExport("src/components/tools/regex/RegexTool.tsx", "RegexTool", "src/components/shell/tabs/RegexTab.tsx");
// the worker runner is promise-based; CommonJS tsx has no top-level await
testWorkerRunner()
  .then(() =>
    console.log(
      "ALL PASS — regex_presets schema + round-trip, namespace, collision-safe fragments, cover, chunking, parser/explain, " +
        "presets per tab, share links, worker deadline, explain job + budget, vendor compose, trade link, ranges, session mirror, panel wiring",
    ),
  )
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
