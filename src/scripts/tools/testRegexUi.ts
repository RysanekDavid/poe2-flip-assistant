/* Regex UI support logic, run from testRegexTool.ts: presets for every sub-tab (schema + DB +
 * per-tab filter), share-link round trips, the explain worker's deadline runner, the explain job,
 * the vendor composer and the trade2 link builder. Everything here is DOM-free. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { listRegexPresets, saveRegexPreset } from "../../db/regexPresetQueries";
import { VendorDataSchema, RegexPoolSchema, type RegexPool } from "../../core/tools/regex/pools/schema";
import { composeVendor } from "../../core/tools/regex/vendorCompose";
import { compileSearch, matchesItem } from "../../core/tools/regex/searchEmulator";
import { PresetParamsSchema, type PresetParams } from "../../lib/tools/regexContract";
import { REGEX_TABS, emptyPoolSelection, encodeShare, thresholdKey, type TabSelection, type WaystoneSelection } from "../../lib/tools/regexPoolContract";
import { readShare, shareUrl } from "../../lib/tools/regexShareUrl";
import { PASTED_ITEM_KEY, runExplainJob } from "../../lib/tools/regexExplainJob";
import { TimedWorker, type Timers, type WorkerPort } from "../../lib/tools/regexWorkerRunner";
import { presetsForTab } from "../../components/tools/regex/presetView";
import { emptyVendorSelection, setModState, setThreshold } from "../../components/tools/regex/selectionOps";

export const loadPool = (tab: string): RegexPool => RegexPoolSchema.parse(JSON.parse(readFileSync(join(process.cwd(), `src/data/poe2/regex/${tab}.json`), "utf8")));

/** A waystone selection like the owner's check: 3 wanted (one with a threshold), 2 avoided, T14–16. */
export function sampleWaystone(pool: RegexPool): WaystoneSelection {
  const ids = pool.mods.map((m) => m.id);
  let sel = emptyPoolSelection("waystone");
  for (const id of ids.slice(0, 3)) sel = setModState(sel, id, "want");
  for (const id of ids.slice(5, 7)) sel = setModState(sel, id, "avoid");
  sel = setThreshold(sel, thresholdKey(ids[0] ?? "", 0, 0), { min: 20, max: null });
  return { ...sel, tier: { min: 14, max: 16 } };
}

function paramsForEveryTab(waystone: WaystoneSelection): PresetParams[] {
  return REGEX_TABS.map((tab): PresetParams => {
    if (tab === "price") return { tab, mode: "keep", minDiv: 2, categories: ["Runes"], includeUniques: false };
    if (tab === "vendor") return { ...emptyVendorSelection(), classes: ["Boots"], movementSpeed: 25 };
    if (tab === "waystone") return waystone;
    return setModState(emptyPoolSelection(tab), "SomeMod", "avoid");
  });
}

/** Every tab's selection saves, reloads unchanged, and shows only on its own sub-tab. */
export function testPresetsPerTab(userId: number): void {
  const all = paramsForEveryTab(sampleWaystone(loadPool("waystone")));
  for (const params of all) {
    assert.deepEqual(PresetParamsSchema.parse(JSON.parse(JSON.stringify(params))), params, `${params.tab} params survive JSON + schema`);
    const saved = saveRegexPreset(userId, "L", `p-${params.tab}`, params);
    assert.deepEqual(saved.params, params, `${params.tab} preset round-trips through the DB`);
  }
  const listed = listRegexPresets(userId);
  for (const tab of REGEX_TABS) {
    assert.deepEqual(presetsForTab(listed, tab).map((p) => p.name), [`p-${tab}`], `the ${tab} bar shows only its own preset`);
  }
  const broken = { id: -1, name: "broken", league: "L", params: null, invalid: "mode: bad", updatedAt: "" };
  assert.ok(REGEX_TABS.every((tab) => presetsForTab([broken], tab).length === 1), "an unparseable row stays deletable on every tab");
}

export function testShareRoundTrip(): void {
  const selection = sampleWaystone(loadPool("waystone"));
  const url = new URL(shareUrl("https://flip.example", "/", selection));
  assert.equal(url.searchParams.get("tab"), "regex");
  assert.equal(url.searchParams.get("tool"), "waystone", "the link opens the sub-tab the selection belongs to");
  const read = readShare(url.searchParams.get("tool"), url.searchParams.get("s"));
  assert.deepEqual(read, { kind: "ok", selection }, "share link → identical selection");
  const vendor: TabSelection = { ...emptyVendorSelection(), resistances: { fire: 30, cold: null, lightning: null, chaos: null } };
  assert.deepEqual(readShare("vendor", encodeShare(vendor)), { kind: "ok", selection: vendor });
  assert.equal(readShare("waystone", null).kind, "none");
  const wrongTab = readShare("tablet", url.searchParams.get("s"));
  assert.ok(wrongTab.kind === "error" && /waystone/.test(wrongTab.message), "a tool/selection mismatch is reported, not guessed");
  const bad = readShare(null, "not*base64");
  assert.ok(bad.kind === "error" && /base64url/.test(bad.message), "garbage shows a readable error");
  const code = url.searchParams.get("s") ?? "";
  assert.equal(readShare(null, code.slice(0, -6)).kind, "error", "a truncated code is rejected");
  const huge = emptyPoolSelection("jewel");
  huge.mods = Object.fromEntries(Array.from({ length: 400 }, (_, i) => [`AVeryLongModIdentifierNumber${i}`, "want" as const]));
  assert.throws(() => shareUrl("https://x", "/", huge), /limit/, "an over-long selection refuses to make a link");
}

interface FakePort extends WorkerPort {
  posted: unknown[];
  terminated: boolean;
  reply: (data: unknown) => void;
  crash: (message: string) => void;
}

function fakeWorkers(): { ports: FakePort[]; create: () => WorkerPort } {
  const ports: FakePort[] = [];
  const create = (): WorkerPort => {
    let onData: (d: unknown) => void = () => undefined;
    let onError: (m: string) => void = () => undefined;
    const port: FakePort = {
      posted: [],
      terminated: false,
      post: (m) => port.posted.push(m),
      terminate: () => {
        port.terminated = true;
      },
      listen: (d, e) => {
        onData = d;
        onError = e;
      },
      reply: (d) => onData(d),
      crash: (m) => onError(m),
    };
    ports.push(port);
    return port;
  };
  return { ports, create };
}

function manualTimers(): Timers & { fire: () => void; live: number } {
  const pending = new Map<number, () => void>();
  let next = 1;
  return {
    set: (fn) => {
      pending.set(next, fn);
      return next++;
    },
    clear: (h) => void pending.delete(h as number),
    fire: () => {
      const all = [...pending.values()];
      pending.clear();
      all.forEach((fn) => fn());
    },
    get live() {
      return pending.size;
    },
  };
}

const jobId = (port: FakePort, i = port.posted.length - 1): number => (port.posted[i] as { id: number }).id;

function makeRunner() {
  const { ports, create } = fakeWorkers();
  const timers = manualTimers();
  const runner = new TimedWorker<string, number>({ create, parse: (d) => (typeof d === "number" ? d : Number.NaN), timeoutMs: 200, startupMs: 5000, timers });
  return { ports, timers, runner };
}

/** Deadline runner: ready handshake, answers, timeouts (kill + fresh worker), supersession. */
async function testRunnerDeadline(): Promise<void> {
  const { ports, timers, runner } = makeRunner();
  const ok = runner.run("a");
  const p0 = ports[0];
  assert.ok(p0);
  assert.equal(timers.live, 1, "a cold worker runs the startup clock, not the job deadline");
  p0.reply({ ready: true });
  assert.equal(timers.live, 1, "the handshake swaps the startup clock for the deadline");
  p0.reply({ id: jobId(p0), result: 7 });
  assert.deepEqual(await ok, { kind: "ok", value: 7 });
  assert.equal(timers.live, 0, "an answered job clears its deadline");

  const slow = runner.run("(.+)+x");
  timers.fire();
  assert.deepEqual(await slow, { kind: "timeout", ms: 200 });
  assert.ok(p0.terminated, "an overrun kills the busy worker");
  p0.reply({ id: jobId(p0), result: 1 }); // late answer from the dead worker must be ignored
  const after = runner.run("b");
  const p1 = ports[1];
  assert.ok(p1 && runner.created === 2, "the next job gets a fresh worker");
  const superseding = runner.run("c");
  assert.deepEqual(await after, { kind: "superseded" }, "a newer job supersedes a running one");
  assert.ok(p1.terminated, "the superseded job's busy worker is killed");
  const p2 = ports[2];
  assert.ok(p2);
  p2.reply({ ready: true });
  p2.reply({ id: jobId(p2), error: "search is empty" });
  assert.deepEqual(await superseding, { kind: "failed", message: "search is empty" });
  assert.equal(p2.terminated, false, "a reported error keeps the healthy worker");
  runner.dispose();
  assert.equal(timers.live, 0, "dispose leaves no timer behind");
}

/** Broken workers: malformed replies, crashes and a worker that never loads all fail loudly. */
async function testRunnerFailures(): Promise<void> {
  const { ports, timers, runner } = makeRunner();
  runner.warm();
  const p0 = ports[0];
  assert.ok(p0 && runner.created === 1, "warm() loads the worker before the first job");
  p0.reply({ ready: true });
  const malformed = runner.run("d");
  p0.reply({ nope: true });
  assert.equal((await malformed).kind, "failed");
  assert.ok(p0.terminated, "a malformed reply kills the worker");
  const crashed = runner.run("e");
  ports[1]?.crash("SyntaxError in worker");
  assert.deepEqual(await crashed, { kind: "failed", message: "worker crashed: SyntaxError in worker" });
  const stuck = runner.run("f");
  timers.fire();
  assert.deepEqual(await stuck, { kind: "failed", message: "the explain worker did not start within 5000 ms" });
  assert.ok(ports[2]?.terminated, "a worker that never loads is killed");
  runner.dispose();
}

export async function testWorkerRunner(): Promise<void> {
  await testRunnerDeadline();
  await testRunnerFailures();
}

export function testExplainJob(): void {
  const lines = { key: "fire", lines: ["Monsters deal 30% of Damage as Extra Fire"] };
  const pasted = { key: PASTED_ITEM_KEY, lines: ["Rarity: Rare", "Monsters deal 30% of Damage as Extra Fire"] };
  const out = runExplainJob({ search: '"y: r" fir', items: [lines, { key: "acc", lines: ["Monsters have 20% increased Accuracy Rating"] }, pasted] });
  assert.ok(out.ok);
  const byKey = new Map(out.items.map((i) => [i.key, i.evaluation]));
  const fire = byKey.get("fire");
  assert.ok(fire?.ok && fire.terms[1]?.hitLines.length === 1 && !fire.matched, "a bare mod line hits the mod term but not the rarity term");
  const item = byKey.get(PASTED_ITEM_KEY);
  assert.ok(item?.ok && item.matched, "the pasted rare item lights up");
  const refused = runExplainJob({ search: "(.+)+x", items: [lines] });
  assert.ok(!refused.ok && refused.position !== null, "nested repetition is refused with a position, once");
  assert.throws(() => runExplainJob({ search: "", items: [] }), "an empty search is a malformed job");
}

export function testVendorCompose(): void {
  const data = VendorDataSchema.parse(JSON.parse(readFileSync(join(process.cwd(), "src/data/poe2/regex/vendor.json"), "utf8")));
  const sel = { ...emptyVendorSelection(), movementSpeed: 25, resistances: { fire: 30, cold: null, lightning: null, chaos: null } };
  const any = composeVendor(data, sel, { maxChars: 250 });
  assert.equal(any.chunks.length, 1, any.reason ?? "one string");
  const search = compileSearch(any.chunks[0]?.text ?? "");
  assert.ok(matchesItem(search, ["Rarity: Magic", "25% increased Movement Speed"]), `${any.chunks[0]?.text} lights 25% MS`);
  assert.ok(matchesItem(search, ["+34% to Fire Resistance"]), "any mode: fire res alone lights");
  assert.ok(!matchesItem(search, ["15% increased Movement Speed", "+12% to Fire Resistance"]), "below both minimums stays dark");
  const all = composeVendor(data, { ...sel, match: "all", rarity: ["rare"] }, { maxChars: 250 });
  const strict = compileSearch(all.chunks[0]?.text ?? "");
  assert.ok(matchesItem(strict, ["Rarity: Rare", "30% increased Movement Speed", "+30% to Fire Resistance"]));
  assert.ok(!matchesItem(strict, ["Rarity: Magic", "30% increased Movement Speed", "+30% to Fire Resistance"]), "rarity filter is ANDed");
  assert.ok(!matchesItem(strict, ["Rarity: Rare", "30% increased Movement Speed"]), "all mode needs every property");
  const levels = composeVendor(data, { ...emptyVendorSelection(), requiredLevel: { min: 60, max: 70 }, sockets: 2 }, { maxChars: 250 });
  const lv = compileSearch(levels.chunks[0]?.text ?? "");
  assert.ok(matchesItem(lv, ["Requires: Level 65, 86 Str", "Sockets: S S S"]), `${levels.chunks[0]?.text} reads the level before the attributes`);
  assert.ok(!matchesItem(lv, ["Requires: Level 75", "Sockets: S S"]), "a level above the range stays dark");
  assert.ok(levels.warnings.some((w) => w.code === "verify-in-game"), "unverified spellings are flagged");
  assert.equal(composeVendor(data, emptyVendorSelection(), { maxChars: 250 }).chunks.length, 0, "an empty vendor selection makes no string");
}
