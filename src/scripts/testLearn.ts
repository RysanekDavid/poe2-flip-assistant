/* New-player mode + Learn tab against a TEMP DB. No network.
 * Run: npm run test:learn (runWithTestEnv sets DB_PATH / OWNER_PASSWORD / AUTH_SECRET). */
import assert from "node:assert/strict";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import Database from "better-sqlite3";
import type { PricedItem } from "../api/types";
import { signSession } from "../auth/auth";
import { meResponse } from "../auth/meResponse";
import { config } from "../config/env";
import { TAB_IDS, TAB_REDIRECTS, TABS, TOOL_REDIRECTS, followRenames, parseTabRoute, redirectTab, redirectTool, tabIdSchema, tabMeta } from "../components/shell/tabRegistry";
import { TOOL_ICON_KEYS } from "../components/shell/toolIconKeys";
import { tourStepsFor } from "../components/onboardingTour";
import { entityById } from "../core/entities/load";
import { ATLAS_CHECKLIST, CURRENCY_PRIMER, primerCards } from "../core/learn/data";
import { entitiesGet, navModeGet, navModePost, primerGet, progressGet, progressPost } from "../core/learn/handlers";
import { loadLookupPrices, lookupEntities, pickupHintOf, sellRouteOf } from "../core/learn/lookup";
import { leagueForUser } from "../core/leagueUsers";
import { getDb } from "../db/database";
import { insertSnapshots, replaceScoutValues, SCOUT_UNIQUE_SOURCE } from "../db/marketQueries";
import { createUser, getUserById, type UserRow } from "../db/userQueries";
import { CLAIM_VERDICTS, type ClaimVerdict } from "../lib/claim";
import { entitySearchResponseSchema, isWorthPickingUp, primerResponseSchema, progressResponseSchema } from "../lib/learnContract";
import { currentData, entitySearchUrl, type Remote } from "../lib/learnSearch";
import { BEGINNER_TABS, BEGINNER_TOOLS, defaultTabFor, parseModeRoute, subTabsFor, visibleTabs, visibleTools } from "../lib/navMode";
import { REGEX_TABS } from "../lib/tools/regexPoolContract";
import { scoutKey } from "../lib/scoutKey";

if (!/scratchpad|tmp|temp/.test(config.dbPath)) {
  console.error(`refusing to run against ${config.dbPath} — point DB_PATH at a temp file.`);
  process.exit(1);
}

const pass = (what: string): void => console.log(`PASS  ${what}`);

function resetDb(): void {
  for (const suffix of ["", "-wal", "-shm"]) rmSync(`${config.dbPath}${suffix}`, { force: true });
}

/** A users table as it shipped before nav_mode, holding one account — then the real migrations run. */
function seedLegacyUser(): void {
  mkdirSync(dirname(config.dbPath), { recursive: true });
  const legacy = new Database(config.dbPath);
  legacy.exec(`CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
    api_key TEXT UNIQUE NOT NULL, role TEXT NOT NULL DEFAULT 'member', created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  legacy.prepare("INSERT INTO users (id, name, password_hash, api_key, role) VALUES (1, 'veteran', 'scrypt$x$y', 'pk_legacy', 'owner')").run();
  legacy.close();
}

async function testMigration(): Promise<void> {
  resetDb();
  seedLegacyUser();
  getDb();
  assert.equal(getUserById(1)?.nav_mode, "advanced", "an account from before nav_mode keeps the full nav");
  const fresh = await createUser("newbie", "newbie-password-1", "member");
  assert.equal(fresh.nav_mode, "beginner", "a new account starts in beginner nav");
  const trader = await createUser("trader", "trader-password-1", "member", { navMode: "advanced" });
  assert.equal(trader.nav_mode, "advanced", "addUser --advanced");
  assert.throws(() => getDb().prepare("UPDATE users SET nav_mode = 'expert' WHERE id = ?").run(fresh.id), /CHECK/, "DB rejects unknown modes");
  const cols = getDb().prepare("PRAGMA table_info(learn_progress)").all() as Array<{ name: string }>;
  assert.deepEqual(cols.map((c) => c.name), ["user_id", "step_id", "done_at"]);
  const fks = getDb().prepare("PRAGMA foreign_key_list(learn_progress)").all() as Array<{ table: string; on_delete: string }>;
  assert.ok(fks.length === 1 && fks[0]?.table === "users" && fks[0]?.on_delete === "CASCADE", "learn_progress → users ON DELETE CASCADE");
  pass("migration: legacy user → advanced, createUser → beginner, --advanced, CHECK, learn_progress table");
}

function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, { method: "POST", headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) });
}

async function testNavModeRoute(user: UserRow): Promise<void> {
  const url = "http://127.0.0.1/api/settings/nav-mode";
  assert.equal(navModeGet(null).status, 401);
  assert.deepEqual(await navModeGet(user).json(), { nav_mode: "beginner" });
  const switched = await navModePost(user, jsonRequest(url, { nav_mode: "advanced" }));
  assert.equal(switched.status, 200);
  assert.deepEqual(await switched.json(), { nav_mode: "advanced" });
  const reloaded = getUserById(user.id);
  assert.ok(reloaded);
  assert.deepEqual(await navModeGet(reloaded).json(), { nav_mode: "advanced" }, "the switch persisted");
  assert.deepEqual(await meResponse(signSession(user.id, 60_000)).json(), {
    user: { id: user.id, name: user.name, role: user.role, nav_mode: "advanced" },
  });
  assert.equal((await navModePost(reloaded, jsonRequest(url, { nav_mode: "expert" }))).status, 400);
  assert.equal((await navModePost(reloaded, jsonRequest(url, "{not json"))).status, 400);
  assert.equal((await navModePost(null, jsonRequest(url, { nav_mode: "beginner" }))).status, 401);
  await navModePost(reloaded, jsonRequest(url, { nav_mode: "beginner" }));
  assert.equal(getUserById(user.id)?.nav_mode, "beginner", "and back");
  pass("nav-mode route: GET/POST round-trip, /me carries nav_mode, 400 on bad body, 401 anonymous");
}

function testVisibility(): void {
  const beginner = visibleTabs("beginner").map((t) => t.id);
  assert.deepEqual(beginner, ["learn", "farm", "trade", "alerts", "settings", "coach"]);
  assert.deepEqual(visibleTabs("advanced").map((t) => t.id), [...TAB_IDS]);
  for (const hidden of ["flips", "craft", "wealth", "regex", "patches"] as const) assert.ok(!beginner.includes(hidden), `${hidden} hidden`);
  for (const [tab, tools] of Object.entries(BEGINNER_TOOLS)) {
    const known = tabMeta(tab as (typeof TAB_IDS)[number]).tools?.map((t) => t.id) ?? [];
    for (const tool of tools ?? []) assert.ok(known.includes(tool), `beginner tool ${tab}/${tool} exists in the registry`);
  }
  for (const tab of BEGINNER_TABS) assert.ok(TAB_IDS.includes(tab));
  assert.deepEqual(visibleTools("beginner", "farm")?.map((t) => t.id), ["strategies", "bosses"]);
  assert.deepEqual(visibleTools("beginner", "trade")?.map((t) => t.id), ["prices", "price"]);
  assert.deepEqual(visibleTools("beginner", "settings")?.map((t) => t.id), ["account", "notify", "mode", "system"]);
  assert.deepEqual(visibleTools("advanced", "farm")?.map((t) => t.id), ["strategies", "bosses"]);
  assert.equal(visibleTools("beginner", "alerts"), undefined);
  assert.equal(defaultTabFor("beginner"), "learn");
  assert.equal(defaultTabFor("advanced"), "flips");
  pass("visibleTabs / visibleTools / defaultTabFor");
}

/** The shell's sub-tab bar: hidden below two usable tools, and Regex switches through it too. */
function testSubTabs(): void {
  const ids = (mode: "beginner" | "advanced", tab: (typeof TAB_IDS)[number], role: "owner" | "member" = "owner") => subTabsFor(mode, tab, role)?.map((t) => t.id) ?? null;
  assert.deepEqual(ids("beginner", "farm"), ["strategies", "bosses"], "a beginner sees both Farm tools");
  assert.deepEqual(ids("beginner", "trade"), ["prices", "price"], "a beginner's Trade: Prices + Price check");
  assert.deepEqual(ids("advanced", "trade"), ["prices", "price", "opportunities", "methods"], "Methods is an advanced Trade tool");
  assert.ok(ids("advanced", "craft")?.includes("rollsell"), "Roll & sell is a Craft tool");
  assert.equal(ids("advanced", "alerts"), null, "no tools, no bar");
  assert.equal(ids("advanced", "coach"), null);
  assert.deepEqual(ids("advanced", "farm"), ["strategies", "bosses"]);
  assert.deepEqual(ids("beginner", "learn"), ["what", "currency", "atlas"]);
  assert.deepEqual(ids("beginner", "settings"), ["account", "notify", "mode", "system"], "the owner's Settings anchors include System");
  assert.deepEqual(ids("advanced", "settings", "member"), ["account", "notify", "mode"], "a member gets no System sub-tab (its panel is owner-only)");
  assert.deepEqual(ids("beginner", "settings", "member"), ["account", "notify", "mode"]);
  assert.deepEqual(parseTabRoute("settings", "system"), { tab: "settings", tool: "system", rejected: [] }, "tool=system still parses");
  assert.deepEqual(parseModeRoute("beginner", "settings", "system"), { tab: "settings", tool: "system", rejected: [], hidden: [] });
  assert.deepEqual(ids("advanced", "regex"), [...REGEX_TABS], "registry regex tools = REGEX_TABS, in order");
  assert.deepEqual(parseTabRoute("regex", null), { tab: "regex", tool: "waystone", rejected: [] });
  assert.deepEqual(parseTabRoute("regex", "jewel"), { tab: "regex", tool: "jewel", rejected: [] });
  assert.deepEqual(parseTabRoute("regex", "maps3d"), { tab: "regex", tool: "waystone", rejected: ["tool=maps3d"] }, "an unknown regex tool is rewritten");
  assert.deepEqual(parseTabRoute("alerts", "x"), { tab: "alerts", tool: null, rejected: ["tool=x"] }, "a tab without tools rejects every tool");
  assert.deepEqual(parseTabRoute("settings", "notify"), { tab: "settings", tool: "notify", rejected: [] }, "tool=notify deep link");
  for (const t of TABS) {
    const keys: readonly string[] = TOOL_ICON_KEYS[t.id];
    assert.deepEqual([...keys].sort(), (t.tools ?? []).map((tool) => tool.id).sort(), `${t.id}: sub-tab icons exactly cover the registry tools`);
    for (const tool of t.tools ?? []) assert.ok(tool.hint.trim().length > 0, `${t.id} › ${tool.id} has a hint`);
  }
  pass("sub-tab bar: hidden under 2 tools, owner-only System, regex tools = REGEX_TABS, unknown tools rewritten, every tool hinted + iconed");
}

/** Market board became Opportunities: the old ?tool=board still lands on it, in both modes' own way. */
function testToolRedirects(): void {
  assert.equal(redirectTool("trade", "board"), "opportunities", "old Market board link → Opportunities");
  assert.equal(redirectTool("farm", "board"), "strategies", "old Farm board link → Strategies (it took the heat strip)");
  assert.equal(redirectTool("farm", "bosses"), "bosses");
  assert.equal(redirectTool("trade", "prices"), "prices");
  assert.equal(redirectTool("trade", null), null);
  assert.equal(redirectTool("bogus", "board"), "board", "an unknown tab is left for the parser to reject");
  assert.deepEqual(parseModeRoute("advanced", "trade", redirectTool("trade", "board")), { tab: "trade", tool: "opportunities", rejected: [], hidden: [] });
  assert.deepEqual(
    parseModeRoute("beginner", "trade", redirectTool("trade", "board")),
    { tab: "trade", tool: "prices", rejected: [], hidden: ["tool=opportunities"] },
    "a beginner's old board link still falls back to what the mode shows",
  );
  for (const [tab, map] of Object.entries(TOOL_REDIRECTS)) {
    const tools = tabMeta(tab as (typeof TAB_IDS)[number]).tools?.map((t) => t.id) ?? [];
    for (const [from, to] of Object.entries(map ?? {})) {
      assert.ok(tools.includes(to), `${tab}: redirect target ${to} is a registry tool`);
      assert.ok(!tools.includes(from), `${tab}: redirected id ${from} is no longer a tool`);
    }
  }
  pass("renamed tools: ?tool=board → opportunities, targets exist, old ids retired");
}

/**
 * Exchange became Flips and Market became Trade: an old ?tab= lands on today's tab (a Market link's
 * ?tool=board too), and a beginner still gets the fallback of a hidden tab.
 */
function testTabRedirects(): void {
  assert.equal(redirectTab("exchange"), "flips", "old Exchange link → Flips");
  assert.equal(redirectTab("flips"), "flips");
  assert.equal(redirectTab("market"), "trade", "old Market link → Trade");
  assert.equal(redirectTab("trade"), "trade");
  assert.equal(redirectTab(null), null);
  assert.equal(redirectTab("toString"), "toString", "a prototype key is not a redirect; the parser rejects it");
  assert.equal(redirectTab("bogus"), "bogus", "an unknown tab is left for the parser to reject");
  assert.equal(redirectTool("trade", "toString"), "toString", "a prototype key is not a tool redirect");
  assert.equal(redirectTool("trade", "board"), "opportunities");
  assert.equal(redirectTool("market", "board"), "board", "tool renames key on today's tab id; followRenames maps the tab first");
  assert.deepEqual(parseModeRoute("advanced", redirectTab("exchange"), null), { tab: "flips", tool: null, rejected: [], hidden: [] });
  assert.deepEqual(
    parseModeRoute("beginner", redirectTab("exchange"), null),
    { tab: "learn", tool: "what", rejected: [], hidden: ["tab=flips"] },
    "a beginner's old Exchange link falls back like any hidden tab",
  );
  assert.deepEqual(parseModeRoute("advanced", "exchange", null).rejected, ["tab=exchange"], "the old id itself is no longer a tab");
  assert.deepEqual(parseModeRoute("advanced", "market", null).rejected, ["tab=market"], "nor is market");
  assert.deepEqual(parseModeRoute("beginner", redirectTab("market"), "price"), { tab: "trade", tool: "price", rejected: [], hidden: [] }, "Trade stays a beginner tab");
  // what useTabRoute hands AppShell: a non-empty `renamed` is what rewrites the URL (without a warning)
  assert.deepEqual(followRenames("exchange", null), { tab: "flips", tool: null, renamed: ["tab=exchange"] });
  assert.deepEqual(followRenames("flips", null), { tab: "flips", tool: null, renamed: [] }, "the current id is not rewritten");
  assert.deepEqual(followRenames("market", null), { tab: "trade", tool: null, renamed: ["tab=market"] });
  assert.deepEqual(followRenames("market", "price"), { tab: "trade", tool: "price", renamed: ["tab=market"] }, "a Learn-style ?tab=market&tool=price link");
  assert.deepEqual(followRenames("market", "board"), { tab: "trade", tool: "opportunities", renamed: ["tab=market", "tool=board"] }, "both renames in one old link");
  assert.deepEqual(followRenames("farm", "board"), { tab: "farm", tool: "strategies", renamed: ["tool=board"] }, "an old Farm board link lands on Strategies");
  assert.deepEqual(followRenames("trade", "board"), { tab: "trade", tool: "opportunities", renamed: ["tool=board"] });
  assert.deepEqual(followRenames("trade", "prices"), { tab: "trade", tool: "prices", renamed: [] });
  const oldBoard = followRenames("market", "board");
  assert.deepEqual(parseModeRoute("advanced", oldBoard.tab, oldBoard.tool), { tab: "trade", tool: "opportunities", rejected: [], hidden: [] });
  assert.deepEqual(parseModeRoute("beginner", oldBoard.tab, oldBoard.tool), { tab: "trade", tool: "prices", rejected: [], hidden: ["tool=opportunities"] });
  assert.deepEqual(followRenames(null, null), { tab: null, tool: null, renamed: [] });
  assert.deepEqual(followRenames("bogus", "x"), { tab: "bogus", tool: "x", renamed: [] }, "unknown ids are the parser's to reject");
  for (const [from, to] of TAB_REDIRECTS) {
    assert.ok(TAB_IDS.includes(to), `tab redirect target ${to} is a registry tab`);
    assert.ok(!tabIdSchema.safeParse(from).success, `redirected tab id ${from} is no longer a tab`);
  }
  pass("renamed tabs: ?tab=exchange → flips, ?tab=market(&tool=board) → trade(+opportunities), targets exist, old ids retired");
}

function testModeRoutes(): void {
  const route = (mode: "beginner" | "advanced", tab: string | null, tool: string | null) => parseModeRoute(mode, tab, tool);
  assert.deepEqual(route("beginner", null, null), { tab: "learn", tool: "what", rejected: [], hidden: [] });
  assert.deepEqual(route("beginner", "flips", null), { tab: "learn", tool: "what", rejected: [], hidden: ["tab=flips"] });
  assert.deepEqual(route("beginner", "craft", "moves"), { tab: "learn", tool: "what", rejected: [], hidden: ["tab=craft"] });
  assert.deepEqual(route("beginner", "farm", null), { tab: "farm", tool: "strategies", rejected: [], hidden: [] }, "Strategies is the Farm default");
  assert.deepEqual(route("beginner", "farm", "bosses"), { tab: "farm", tool: "bosses", rejected: [], hidden: [] }, "a beginner may open Bosses");
  assert.deepEqual(route("beginner", "farm", "board"), { tab: "farm", tool: "strategies", rejected: ["tool=board"], hidden: [] }, "board is renamed before parsing (followRenames), never a tool");
  assert.deepEqual(route("beginner", "trade", "opportunities"), { tab: "trade", tool: "prices", rejected: [], hidden: ["tool=opportunities"] });
  assert.deepEqual(route("beginner", "trade", null), { tab: "trade", tool: "prices", rejected: [], hidden: [] }, "Prices is the Trade default");
  assert.deepEqual(route("beginner", "bogus", "x"), { tab: "learn", tool: "what", rejected: ["tab=bogus", "tool=x"], hidden: [] });
  assert.deepEqual(route("beginner", "farm", "nope"), { tab: "farm", tool: "strategies", rejected: ["tool=nope"], hidden: [] });
  assert.deepEqual(route("beginner", "coach", null), { tab: "coach", tool: null, rejected: [], hidden: [] }, "Coach in both modes");
  assert.deepEqual(route("advanced", null, null), { tab: "flips", tool: null, rejected: [], hidden: [] });
  assert.deepEqual(route("advanced", "farm", null), { tab: "farm", tool: "strategies", rejected: [], hidden: [] });
  assert.deepEqual(route("advanced", "learn", "atlas"), { tab: "learn", tool: "atlas", rejected: [], hidden: [] });
  const beginnerTour = tourStepsFor("beginner").map((s) => s.element);
  assert.ok(beginnerTour.includes('[data-tour="farm"]'), "Farm's default tool is visible to a beginner, so its tour step stays");
  assert.ok(!beginnerTour.includes('[data-tour="alerts"]'), "tour skips hidden tabs");
  assert.ok(beginnerTour.includes('[data-tour="learn"]'));
  assert.equal(tourStepsFor("advanced").length, 5);
  pass("hidden-route redirect targets (tab, tool, unknown, Coach) + mode-filtered tour");
}

function testDataRefs(): Record<ClaimVerdict, number> {
  const grades = Object.fromEntries(CLAIM_VERDICTS.map((v) => [v, 0])) as Record<ClaimVerdict, number>;
  for (const entry of CURRENCY_PRIMER.entries) {
    assert.ok(entityById(entry.entity_id), `primer entity ${entry.entity_id} is in the catalog`);
    // One pickup rule: the curated "always" bucket is exactly the live lookup's "pick up" line.
    assert.equal(entry.pickup === "always", isWorthPickingUp(entry.ref_ex), `primer ${entry.entity_id}: bucket ${entry.pickup} vs ${entry.ref_ex} Ex`);
    assert.equal(entry.pickup === "always", pickupHintOf(entry.ref_ex, 1) === "pick_up");
    grades[entry.claim.v] += 1;
  }
  for (const step of ATLAS_CHECKLIST.steps) {
    for (const id of step.strategy_ids) {
      assert.ok(existsSync(join(process.cwd(), "src", "data", "poe2", "strategies", `${id}.json`)), `atlas step ${step.id} → strategy ${id}`);
    }
    grades[step.claim.v] += 1;
    for (const warning of step.warnings) if (warning.claim) grades[warning.claim.v] += 1;
  }
  const tablets = ATLAS_CHECKLIST.steps.find((s) => s.id === "boss-rush-maps")?.warnings[0];
  assert.equal(tablets?.claim?.v, "ss", "the tablet warning is one creator's advice and says so");
  assert.ok(ATLAS_CHECKLIST.steps.some((s) => s.warnings.some((w) => w.text.startsWith("Man Trap:"))), "poe2db spelling");
  pass(`JSON refs resolve: ${CURRENCY_PRIMER.entries.length} primer entries, ${ATLAS_CHECKLIST.steps.length} atlas steps`);
  return grades;
}

const seed = (itemId: string, baseValue: number): PricedItem => ({
  itemId, itemName: itemId, category: "Currency", baseValue, volume: 100, change7d: null, spark7d: null, icon: null,
});

/** The typeahead only offers (and Enter only picks) results for the text currently in the box. */
function testSearchFreshness(): void {
  assert.equal(entitySearchUrl("  "), null);
  const exUrl = entitySearchUrl(" exalted ");
  assert.equal(exUrl, "/api/entities?q=exalted&limit=8");
  const answered: Remote<string> = { kind: "ok", url: exUrl ?? "", data: "exalted rows" };
  assert.equal(currentData(answered, exUrl), "exalted rows");
  assert.equal(currentData(answered, entitySearchUrl("exalted orb")), null, "a debouncing newer query hides the stale rows");
  assert.equal(currentData(answered, null), null);
  assert.equal(currentData<string>({ kind: "loading" }, exUrl), null);
}

async function testLookup(user: UserRow): Promise<void> {
  const league = leagueForUser(user.id);
  // 1 div = 400 ex; transmute 0.0001 div = 0.04 ex.
  insertSnapshots(league, [seed("exalted", 1 / 400), seed("chaos", 1 / 20), seed("transmute", 0.0001)]);
  replaceScoutValues(league, SCOUT_UNIQUE_SOURCE, [{ nameKey: scoutKey("Headhunter"), div: 42 }]);
  const prices = loadLookupPrices(league, Date.now());
  assert.equal(prices.exPerDiv, 400);
  const [exalted] = lookupEntities("exalted orb", 8, prices);
  assert.equal(exalted?.id, "exalted");
  assert.equal(exalted?.sell_route, "cx");
  assert.equal(exalted?.price?.source, "ninja");
  assert.equal(exalted?.pickup_hint, "pick_up", "exactly 1 ex is worth picking up");
  assert.equal(lookupEntities("orb of transmutation", 1, prices)[0]?.pickup_hint, "low_value");
  const headhunter = lookupEntities("headhunter", 1, prices)[0];
  assert.deepEqual([headhunter?.sell_route, headhunter?.price?.div, headhunter?.price?.source, headhunter?.pickup_hint], ["trade", 42, "scout", "pick_up"]);
  const mageblood = lookupEntities("mageblood", 1, prices)[0];
  assert.deepEqual([mageblood?.price, mageblood?.pickup_hint], [null, "unknown"], "unpriced unique");
  assert.equal(sellRouteOf({ kind: "other", exchange_id: null }), "unknown");
  testSearchFreshness();
  assert.equal(pickupHintOf(0.5, null), "unknown", "no rate, no verdict");

  const get = (q: string) => entitiesGet(user, new URL(`http://127.0.0.1/api/entities?${q}`), Date.now());
  const body = entitySearchResponseSchema.parse(await get("q=omen%20of%20wh&limit=8").json());
  assert.equal(body.results[0]?.name, "Omen of Whittling");
  assert.equal(body.ex_per_div, 400);
  assert.equal(get("q=%20").status, 400);
  assert.equal(get("q=exalted&limit=21").status, 400);
  assert.equal(entitiesGet(null, new URL("http://127.0.0.1/api/entities?q=x"), Date.now()).status, 401);

  const primer = primerResponseSchema.parse(await primerGet(user, Date.now()).json());
  assert.equal(primer.cards.length, CURRENCY_PRIMER.entries.length);
  assert.ok(primer.cards.every((c) => c.entity.summary !== null), "every primer card has catalog text");
  assert.equal(primerCards(prices).length, CURRENCY_PRIMER.entries.length);
  pass("entity search + price (ninja/scout) + sell route + pickup rule; /api/entities and /api/learn/primer contracts");
}

async function testProgress(user: UserRow, other: UserRow): Promise<void> {
  const url = "http://127.0.0.1/api/learn/progress";
  const step = ATLAS_CHECKLIST.steps[0]?.id;
  assert.ok(step, "the checklist has steps");
  const read = async (u: UserRow) => progressResponseSchema.parse(await progressGet(u).json());
  assert.deepEqual((await read(user)).done, []);
  const ticked = progressResponseSchema.parse(await (await progressPost(user, jsonRequest(url, { step_id: step, done: true }), 1_000)).json());
  assert.deepEqual(ticked.done, [{ step_id: step, done_at: 1_000 }]);
  await progressPost(user, jsonRequest(url, { step_id: step, done: true }), 9_000);
  assert.deepEqual((await read(user)).done, [{ step_id: step, done_at: 1_000 }], "re-ticking keeps the first time");
  assert.deepEqual((await read(other)).done, [], "progress is per user");
  assert.equal((await progressPost(user, jsonRequest(url, { step_id: "no-such-step", done: true }), 1)).status, 400);
  assert.equal((await progressPost(user, jsonRequest(url, { step_id: step }), 1)).status, 400);
  assert.equal(progressGet(null).status, 401);
  await progressPost(user, jsonRequest(url, { step_id: step, done: false }), 2_000);
  assert.deepEqual((await read(user)).done, [], "unticked");
  await progressPost(other, jsonRequest(url, { step_id: step, done: true }), 3_000);
  getDb().prepare("DELETE FROM users WHERE id = ?").run(other.id);
  const left = getDb().prepare("SELECT COUNT(*) AS n FROM learn_progress WHERE user_id = ?").get(other.id) as { n: number };
  assert.equal(left.n, 0, "deleting a user cascades their progress");
  pass("progress round-trip: tick, idempotent re-tick, untick, unknown step 400, per-user, cascade");
}

async function main(): Promise<void> {
  await testMigration();
  const user = await createUser("learner", "learner-password-1", "member");
  const other = await createUser("learner-two", "learner-password-2", "member");
  await testNavModeRoute(user);
  testVisibility();
  testSubTabs();
  testToolRedirects();
  testTabRedirects();
  testModeRoutes();
  const grades = testDataRefs();
  await testLookup(user);
  await testProgress(user, other);
  console.log(`claim grades (primer + atlas): ${CLAIM_VERDICTS.map((v) => `${v} ${grades[v]}`).join(" · ")}`);
  console.log("ALL PASS — nav mode, Learn data refs, entity lookup, atlas progress");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
