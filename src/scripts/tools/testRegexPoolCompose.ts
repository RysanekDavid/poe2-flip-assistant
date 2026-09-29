/* Pool composer property test: 300 seeded random selections per pool, each checked against synthetic
 * tooltip items built from the pool itself — wanted mods light up, a lone unselected mod does not,
 * avoided mods and failed filters hide the item, every string fits maxChars and alsoMatches is sound.
 * Run: npm run test:tools:regex (chained) or tsx src/scripts/tools/testRegexPoolCompose.ts */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { composePool, type PoolComposeResult } from "../../core/tools/regex/poolCompose";
import { modKey } from "../../core/tools/regex/poolNamespace";
import { POOL_HEADERS, RARITIES } from "../../core/tools/regex/pools/headers";
import { POOL_TABS, RegexPoolSchema, type PoolMod, type RegexPool } from "../../core/tools/regex/pools/schema";
import { compileSafeRegex } from "../../core/tools/regex/safeRegex";
import { compileSearch, matchesItem, type CompiledSearch } from "../../core/tools/regex/searchEmulator";
import { decodeShare, emptyPoolSelection, encodeShare, type PoolTabSelection } from "../../lib/tools/regexPoolContract";
import { itemLines, makeRng, passingSpec, randomSelection, roll, rolledLines, satisfying, type ItemSpec, type Rng } from "./regexPoolFixtures";

const SELECTIONS_PER_POOL = 300;
const MAX_CHARS = [250, 250, 250, 120, 60] as const;

interface Case {
  rng: Rng;
  pool: RegexPool;
  sel: PoolTabSelection;
  res: PoolComposeResult;
  chunks: CompiledSearch[];
}

const stats = { cases: 0, positives: 0, negatives: 0, avoids: 0, filters: 0, split: 0, empty: 0 };

function lit(c: Case, spec: ItemSpec): boolean {
  const lines = itemLines(c.rng, c.pool.tab, spec);
  const hits = c.chunks.map((s) => matchesItem(s, lines));
  return c.sel.match === "all" ? hits.every(Boolean) : hits.some(Boolean);
}

const wantedMods = (c: Case): PoolMod[] => c.pool.mods.filter((m) => c.sel.mods[m.id] === "want");
const avoidedMods = (c: Case): PoolMod[] => c.pool.mods.filter((m) => c.sel.mods[m.id] === "avoid");

/** Wanted mods whose own token is trustworthy (not masked, dropped or a flagged fallback). */
function usableWants(c: Case): PoolMod[] {
  const flagged = new Set(c.res.tokens.filter((t) => t.verify).flatMap((t) => t.covers));
  return wantedMods(c).filter((m) => !c.res.masked.includes(m.id) && !c.res.uncovered.includes(m.id) && !flagged.has(modKey(m.id)));
}

function checkPositive(c: Case): ItemSpec | null {
  const usable = usableWants(c);
  const wants = wantedMods(c);
  const chosen = c.sel.match === "all" ? (usable.length === wants.length ? wants : []) : usable.length > 0 ? [c.rng.pick(usable)] : [];
  if (chosen.length === 0) return null;
  const spec = passingSpec(c.rng, c.pool, c.sel, chosen.map((m) => roll(c.rng, m, satisfying(c.sel, m))));
  assert.ok(lit(c, spec), `${c.pool.tab}: wanted ${chosen.map((m) => m.id).join("+")} not lit by ${JSON.stringify(c.res.chunks.map((x) => x.text))}`);
  stats.positives += 1;
  return spec;
}

function checkUnselected(c: Case): void {
  if (wantedMods(c).length === 0) return;
  const reached = new Set(c.res.tokens.filter((t) => t.kind === "mod" || t.kind === "threshold").flatMap((t) => [...t.alsoMatches, ...t.covers.map((k) => k.slice(4))]));
  const candidates = c.pool.mods.filter((m) => !(m.id in c.sel.mods) && !reached.has(m.id));
  if (candidates.length === 0) return;
  const other = c.rng.pick(candidates);
  const spec = passingSpec(c.rng, c.pool, c.sel, [roll(c.rng, other)]);
  assert.equal(lit(c, spec), false, `${c.pool.tab}: lone unselected ${other.id} lit by ${JSON.stringify(c.res.chunks.map((x) => x.text))}`);
  stats.negatives += 1;
}

function checkAvoided(c: Case, positive: ItemSpec): void {
  const avoids = avoidedMods(c);
  if (avoids.length === 0) return;
  const spec = { ...positive, mods: [...positive.mods, roll(c.rng, c.rng.pick(avoids))] };
  assert.equal(lit(c, spec), false, `${c.pool.tab}: avoided mod did not hide the item (${JSON.stringify(c.res.chunks.map((x) => x.text))})`);
  stats.avoids += 1;
}

function checkFilters(c: Case, positive: ItemSpec): void {
  const s = c.sel;
  const variants: ItemSpec[] = [];
  if (s.rarity.length > 0 && s.rarity.length < RARITIES.length) variants.push({ ...positive, rarity: c.rng.pick(RARITIES.filter((r) => !s.rarity.includes(r))) });
  if (s.corrupted !== "any") variants.push({ ...positive, corrupted: s.corrupted === "exclude" });
  if (s.tab === "waystone" && s.tier && (s.tier.min > 1 || s.tier.max < 16)) {
    variants.push({ ...positive, tier: s.tier.min > 1 ? s.tier.min - 1 : s.tier.max + 1 });
  }
  // a rounded property token deliberately accepts down to the ten below min (warned as "rounded")
  const floor = (min: number): number => (c.res.tokens.some((t) => t.kind === "property" && t.rounded) ? Math.floor(min / 10) * 10 : min);
  for (const [id, r] of Object.entries(s.props)) if (floor(r.min) > 0) variants.push({ ...positive, props: new Map([...positive.props, [id, floor(r.min) - 1]]) });
  for (const v of variants) {
    assert.equal(lit(c, v), false, `${c.pool.tab}: a failed filter still lit (${JSON.stringify(c.res.chunks.map((x) => x.text))}) spec ${JSON.stringify({ ...v, props: [...v.props], mods: v.mods.map((m) => [m.mod.id, [...m.forced]]) })} sel ${JSON.stringify(s)}`);
    stats.filters += 1;
  }
}

/** Random rolls of every other mod: a token hitting one must list it in alsoMatches. */
function checkAlsoMatches(c: Case): void {
  for (const t of c.res.tokens) {
    if (t.kind !== "mod" && t.kind !== "threshold" && t.kind !== "avoid") continue;
    const regex = compileSafeRegex(t.text);
    for (const m of c.rng.sample(c.pool.mods, 12)) {
      if (t.covers.includes(modKey(m.id))) continue;
      if (rolledLines(c.rng, roll(c.rng, m)).some((l) => regex.test(l))) assert.ok(t.alsoMatches.includes(m.id), `${c.pool.tab}: token ${t.text} hits ${m.id} but alsoMatches omits it`);
    }
  }
}

function runCase(rng: Rng, pool: RegexPool): void {
  const sel = randomSelection(rng, pool);
  assert.deepEqual(decodeShare(encodeShare(sel)), sel, "share link round-trips the selection");
  const maxChars = rng.pick(MAX_CHARS);
  const res = composePool(pool, POOL_HEADERS[pool.tab], sel, { maxChars });
  stats.cases += 1;
  for (const chunk of res.chunks) assert.ok(chunk.chars === chunk.text.length && chunk.chars <= maxChars, `${pool.tab}: chunk over ${maxChars}: ${chunk.text}`);
  if (res.reason !== null) {
    assert.deepEqual(res.chunks, [], "a reason means no strings");
    stats.empty += 1;
    return;
  }
  if (res.chunks.length > 1) stats.split += 1;
  const c: Case = { rng, pool, sel, res, chunks: res.chunks.map((x) => compileSearch(x.text)) };
  checkAlsoMatches(c);
  checkUnselected(c);
  const positive = checkPositive(c);
  if (!positive) return;
  checkAvoided(c, positive);
  checkFilters(c, positive);
}

function testEdges(pool: RegexPool): void {
  const none = composePool(pool, POOL_HEADERS[pool.tab], emptyPoolSelection(pool.tab), { maxChars: 250 });
  assert.equal(none.chunks.length, 0);
  assert.match(none.reason ?? "", /nothing selected/);
  const stale = composePool(pool, POOL_HEADERS[pool.tab], { ...emptyPoolSelection(pool.tab), mods: { GoneInPatch9: "want" } }, { maxChars: 250 });
  assert.ok(stale.warnings.some((w) => w.code === "unknown-mod"), "a preset id missing from the data is reported, not dropped silently");
  const every = Object.fromEntries(pool.mods.slice(0, 40).map((m) => [m.id, "want" as const]));
  const many = composePool(pool, POOL_HEADERS[pool.tab], { ...emptyPoolSelection(pool.tab), mods: every }, { maxChars: 20 });
  assert.ok(many.chunks.length > 1 && many.warnings.some((w) => w.code === "multi-string"), `${pool.tab}: 40 wanted mods in 20 chars split with a warning: ${JSON.stringify({ c: many.chunks, w: many.warnings, r: many.reason })}`);
  assert.deepEqual(new Set(many.chunks.flatMap((c) => c.covers).concat(many.uncovered)), new Set(Object.keys(every)), "every wanted mod is in a string or reported uncovered");
}

function testShareRejects(): void {
  for (const bad of ["", "!!!", "e30", encodeURIComponent("{}"), "x".repeat(7000)]) assert.throws(() => decodeShare(bad), Error, `share code "${bad.slice(0, 12)}" is refused`);
}

const seed = Number(process.env.REGEX_PROPERTY_SEED ?? 20260929);
const t0 = Date.now();
testShareRejects();
for (const tab of POOL_TABS) {
  const pool = RegexPoolSchema.parse(JSON.parse(readFileSync(join(process.cwd(), `src/data/poe2/regex/${tab}.json`), "utf8")));
  testEdges(pool);
  const rng = makeRng(seed + tab.length);
  for (let i = 0; i < SELECTIONS_PER_POOL; i++) runCase(rng, pool);
}
console.log(
  `ALL PASS — pool compose property test (seed ${seed}, ${Date.now() - t0} ms): ${stats.cases} selections, ${stats.positives} wanted lit, ` +
    `${stats.negatives} unselected dark, ${stats.avoids} avoided hidden, ${stats.filters} failed filters dark, ${stats.split} split, ${stats.empty} empty`,
);
