/* Per-user leagues: resolution, validation, the poller's dwell/cap rules, watchlist stamping and
 * the two switch entry points. Against a TEMP DB.
 * Run: npm run test:user-league (src/scripts/runWithTestEnv.ts sets DB_PATH).
 *
 * NO NETWORK: the scout league list and the rates bootstrap are both injected. */
import assert from "node:assert/strict";
import { config } from "../config/env";
import { getDb } from "../db/database";
import { clearLeagueCache, getDefaultLeague, setActiveLeague } from "../core/leagueState";
import {
  LEAGUE_DWELL_MS,
  MAX_POLLED_LEAGUES,
  canonicalLeague,
  clearUserLeague,
  clearUserLeagueCache,
  getPolledLeagues,
  leagueForUser,
  ownLeague,
  setUserLeague,
} from "../core/leagueUsers";
import { orderNewestFirst, switchDefaultLeague, switchViewLeague, type SwitchDeps } from "../core/leagueSwitch";
import { registerLeagues } from "../db/leagueQueries";
import { addWatch, getWatchlist, getWatchlistForLeague } from "../db/watchlistQueries";
import {
  deletePosition,
  getFlips,
  getOpenPositions,
  getPosition,
  getTrades,
  insertFlip,
  insertPosition,
  insertTrade,
  realizedPnl,
} from "../db/queries";

if (!/scratchpad|tmp|temp/.test(config.dbPath)) {
  console.error(`refusing to run against ${config.dbPath} — point DB_PATH at a temp file.`);
  process.exit(1);
}

const ALPHA = "League Alpha";
const BETA = "League Beta";
const GAMMA = "League Gamma";
const DELTA = "League Delta";
const EPSILON = "League Epsilon";

const db = getDb();
db.exec(`
  DELETE FROM watchlist; DELETE FROM alerts; DELETE FROM users; DELETE FROM app_settings;
  DELETE FROM positions; DELETE FROM flips; DELETE FROM trades;
`);
clearLeagueCache();
clearUserLeagueCache();

// Owner is id=1 everywhere else in the app; keep that here so role-sensitive paths read true.
const OWNER = seedUser(1, "owner", "owner");
const MEMBER = seedUser(2, "member", "member");
const THIRD = seedUser(3, "third", "member");

main()
  .then(() => {
    db.close();
    console.log(
      "ALL PASS — per-user leagues, dwell/cap polling, case folding, per-league ledgers and both switches",
    );
  })
  .catch((error: unknown) => {
    db.close();
    console.error(error);
    process.exit(1);
  });

async function main(): Promise<void> {
  testFallbackAndOverride();
  testValidationAndCacheIsolation();
  testPolledLeagues();
  testCaseInsensitiveLeagues();
  testWatchlistStampingAndFiltering();
  testLedgersAreStrictlyPerLeague();
  await testViewSwitch();
  await testFollowDefault();
  await testDefaultSwitch();
  testNewestFirstOrdering();
}

/** Dropdown order comes from league_registry chronology, never from a source's list order. */
function testNewestFirstOrdering(): void {
  const put = db.prepare("INSERT OR IGNORE INTO league_registry (league, first_seen_at) VALUES (?, ?)");
  put.run("Old League", "2025-01-01T00:00:00Z");
  put.run("New League", "2026-01-01T00:00:00Z");
  assert.deepEqual(orderNewestFirst(["Old League", "New League"], db), ["New League", "Old League"]);
  // HC variants inherit their base league's position in the timeline.
  assert.deepEqual(orderNewestFirst(["HC Old League", "HC New League"], db), [
    "HC New League",
    "HC Old League",
  ]);
  // Permanent leagues have no registry entry and sink to the bottom.
  assert.equal(orderNewestFirst(["Standard", "New League", "Hardcore"], db)[0], "New League");
  // The seeded real history keeps its known chronology.
  assert.deepEqual(
    orderNewestFirst(
      ["Dawn of the Hunt", "Forbidden Rites", "Runes of Aldur", "Rise of the Abyssal", "Fate of the Vaal"],
      db,
    ),
    ["Forbidden Rites", "Runes of Aldur", "Fate of the Vaal", "Rise of the Abyssal", "Dawn of the Hunt"],
  );
  // First sighting stamps once; a brand-new league immediately sorts first.
  registerLeagues(["Brand New"], db);
  assert.equal(orderNewestFirst(["Brand New", "Forbidden Rites"], db)[0], "Brand New");
}

function seedUser(id: number, name: string, role: string): number {
  db.prepare("INSERT INTO users (id, name, password_hash, api_key, role) VALUES (?, ?, 'hash', ?, ?)").run(
    id,
    name,
    `pk_${name}`,
    role,
  );
  return id;
}

/** A user with no league of their own follows the app default, and follows it as it moves. */
function testFallbackAndOverride(): void {
  clearLeagueCache();
  clearUserLeagueCache();
  assert.equal(getDefaultLeague(), config.league); // nothing stored → env fallback
  assert.equal(leagueForUser(MEMBER), config.league);

  setActiveLeague(ALPHA);
  clearUserLeagueCache();
  assert.equal(leagueForUser(MEMBER), ALPHA, "NULL users.league follows the default");

  setUserLeague(MEMBER, BETA);
  assert.equal(leagueForUser(MEMBER), BETA, "own league beats the default");
  assert.equal(leagueForUser(OWNER), ALPHA, "one user's choice must not move anyone else");

  // Moving the default leaves the user who chose their own where they are.
  setActiveLeague(GAMMA);
  clearUserLeagueCache();
  assert.equal(leagueForUser(MEMBER), BETA);
  assert.equal(leagueForUser(OWNER), GAMMA);

  clearUserLeague(MEMBER);
  assert.equal(leagueForUser(MEMBER), GAMMA, "clearing returns the user to the default");
  setActiveLeague(ALPHA);
}

function testValidationAndCacheIsolation(): void {
  clearUserLeagueCache();
  assert.throws(() => setUserLeague(MEMBER, "   "), /must not be empty/);
  assert.throws(() => setUserLeague(MEMBER, "L".repeat(61)), /at most 60/);
  // Control characters would ride into trade2 URLs and the Coach system prompt.
  assert.throws(() => setUserLeague(MEMBER, "Forbidden\nRites"), /control characters/);
  assert.throws(() => setUserLeague(MEMBER, `Forbidden${String.fromCharCode(0)}Rites`), /control characters/);
  assert.throws(() => setUserLeague(999, BETA), /no user with id 999/);
  assert.equal(leagueForUser(MEMBER), ALPHA, "rejected writes changed nothing");

  assert.deepEqual(setUserLeague(MEMBER, `  ${BETA}  `), { league: BETA }, "stored trimmed");

  // The cache is per user: switching one must not hand the other a stale (or the new) answer.
  setUserLeague(THIRD, GAMMA);
  assert.equal(leagueForUser(MEMBER), BETA);
  assert.equal(leagueForUser(THIRD), GAMMA);
  setUserLeague(MEMBER, DELTA);
  assert.equal(leagueForUser(MEMBER), DELTA, "the switching user sees it immediately");
  assert.equal(leagueForUser(THIRD), GAMMA, "the other user's memo is untouched");

  clearUserLeague(MEMBER);
  clearUserLeague(THIRD);
}

/** The poller's set: default always, own leagues only once they have settled, capped at four. */
function testPolledLeagues(): void {
  clearLeagueCache();
  clearUserLeagueCache();
  setActiveLeague(ALPHA);
  const now = Date.parse("2026-09-18T12:00:00.000Z");

  assert.deepEqual(getPolledLeagues(undefined, now), [ALPHA], "NULL users are ignored entirely");

  // A league picked seconds ago is a click-through, not a workload.
  held(MEMBER, BETA, now - 60_000);
  assert.deepEqual(getPolledLeagues(undefined, now), [ALPHA], "a fresh switch is not polled yet");

  held(MEMBER, BETA, now - LEAGUE_DWELL_MS);
  assert.deepEqual(getPolledLeagues(undefined, now), [ALPHA, BETA], "exactly at the dwell it counts");

  // Same league from two accounts appears once; the default is never duplicated either.
  held(THIRD, BETA, now - 2 * LEAGUE_DWELL_MS);
  assert.deepEqual(getPolledLeagues(undefined, now), [ALPHA, BETA]);
  held(THIRD, ALPHA, now - 2 * LEAGUE_DWELL_MS);
  assert.deepEqual(getPolledLeagues(undefined, now), [ALPHA, BETA]);

  // Past the cap the longest-held win. BETA has been held five minutes; these three are hours
  // old, so BETA is the one that loses its slot.
  held(OWNER, GAMMA, now - 90 * 60_000);
  held(THIRD, DELTA, now - 60 * 60_000);
  const extra = seedUser(4, "fourth", "member");
  held(extra, EPSILON, now - 30 * 60_000);
  const polled = getPolledLeagues(undefined, now);
  assert.equal(polled.length, MAX_POLLED_LEAGUES);
  assert.deepEqual(polled, [ALPHA, GAMMA, DELTA, EPSILON], "default first, then oldest dwell first");
  assert.ok(!polled.includes(BETA), "the most recently picked league is the one dropped");

  db.prepare("DELETE FROM users WHERE id = ?").run(extra);
  for (const id of [OWNER, MEMBER, THIRD]) clearUserLeague(id);
}

/** Stamp a user's league with an explicit "held since", bypassing setUserLeague's `now`. */
function held(userId: number, league: string, sinceMs: number): void {
  db.prepare("UPDATE users SET league = ?, league_set_at = ? WHERE id = ?").run(
    league,
    new Date(sinceMs).toISOString(),
    userId,
  );
  clearUserLeagueCache(userId);
}

/**
 * A watched row belongs to the market it was added under. The poller reads it back through that
 * lens, so a user on another league is not alerted on thresholds set for an economy they left.
 */
function testWatchlistStampingAndFiltering(): void {
  clearLeagueCache();
  clearUserLeagueCache();
  setActiveLeague(ALPHA);
  db.exec("DELETE FROM watchlist");

  setUserLeague(MEMBER, BETA);
  addWatch(MEMBER, { itemId: "divine", itemName: "Divine Orb", category: "Currency" });
  addWatch(OWNER, { itemId: "divine", itemName: "Divine Orb", category: "Currency" }); // owner follows default

  assert.equal(getWatchlist(MEMBER).length, 1);
  assert.deepEqual(
    getWatchlistForLeague(MEMBER, BETA).map((w) => w.league),
    [BETA],
    "stamped with the ADDING user's league, not the app default",
  );
  assert.deepEqual(getWatchlistForLeague(MEMBER, ALPHA), [], "another league's rows are not evaluated");
  assert.deepEqual(
    getWatchlistForLeague(OWNER, ALPHA).map((w) => w.item_id),
    ["divine"],
    "a user on the default league stamps the default",
  );
  assert.deepEqual(getWatchlistForLeague(OWNER, BETA), [], "one user's rows never leak into another's league");

  // Re-adding after a switch re-stamps the row, so it follows the user to the new market.
  setUserLeague(MEMBER, GAMMA);
  addWatch(MEMBER, { itemId: "divine", itemName: "Divine Orb", category: "Currency" });
  assert.deepEqual(getWatchlistForLeague(MEMBER, GAMMA).map((w) => w.league), [GAMMA]);
  assert.deepEqual(getWatchlistForLeague(MEMBER, BETA), []);

  db.exec("DELETE FROM watchlist");
  clearUserLeague(MEMBER);
}

/** Fake scout list + instant bootstrap — no socket is opened by this suite. */
function deps(known: string[], bootstrap: string = "cx"): SwitchDeps {
  return {
    leagueNames: async () => known,
    bootstrap: async () => bootstrap,
  };
}

function failingDeps(): SwitchDeps {
  return {
    leagueNames: async () => {
      throw new Error("scout down");
    },
    bootstrap: async () => "failed",
  };
}

/** Any member may move their own view; the name is validated and stored in scout's spelling. */
async function testViewSwitch(): Promise<void> {
  clearLeagueCache();
  clearUserLeagueCache();
  setActiveLeague(ALPHA);
  const known = deps([ALPHA, BETA, GAMMA]);

  const ok = await switchViewLeague(MEMBER, BETA.toLowerCase(), known);
  assert.deepEqual(ok, { ok: true, league: BETA, ratesSource: "cx" }, "scout's spelling wins");
  assert.equal(leagueForUser(MEMBER), BETA);
  assert.equal(getDefaultLeague(), ALPHA, "a view switch must not move the app default");
  assert.equal(leagueForUser(OWNER), ALPHA, "…nor anyone else's view");

  // A no-op skips the scout round trip entirely — these deps would throw if it did not.
  assert.deepEqual(await switchViewLeague(MEMBER, ` ${BETA} `, failingDeps()), {
    ok: true,
    league: BETA,
    ratesSource: null,
  });

  const unknown = await switchViewLeague(MEMBER, "Ghost League", known);
  assert.deepEqual(unknown, { ok: false, error: unknown.ok ? "" : unknown.error, status: 400 });
  assert.match(unknown.ok ? "" : unknown.error, /unknown league "Ghost League"/);
  assert.equal(leagueForUser(MEMBER), BETA, "a refused switch changes nothing");

  const down = await switchViewLeague(MEMBER, GAMMA, failingDeps());
  assert.equal(down.ok, false);
  assert.equal(down.ok ? 0 : down.status, 503, "an unverifiable league fails loud, not silently");
  assert.equal(leagueForUser(MEMBER), BETA);

  clearUserLeague(MEMBER);
}

/** The app default is owner-only, and moving it announces itself in every feed. */
async function testDefaultSwitch(): Promise<void> {
  clearLeagueCache();
  clearUserLeagueCache();
  setActiveLeague(ALPHA);
  db.exec("DELETE FROM alerts");
  const known = deps([ALPHA, BETA, GAMMA]);

  const refused = await switchDefaultLeague("member", BETA, known);
  assert.deepEqual(refused, { ok: false, error: "owner only", status: 403 });
  assert.equal(getDefaultLeague(), ALPHA, "a member's attempt moved nothing");
  assert.equal(leagueAlerts(), 0, "…and announced nothing");

  const ok = await switchDefaultLeague("owner", BETA.toUpperCase(), known);
  assert.deepEqual(ok, { ok: true, league: BETA, ratesSource: "cx" });
  assert.equal(getDefaultLeague(), BETA);
  assert.equal(leagueAlerts(), 3, "market-wide news: one row per user");

  // Re-setting the same league is a no-op, not a second announcement.
  assert.deepEqual(await switchDefaultLeague("owner", BETA, failingDeps()), {
    ok: true,
    league: BETA,
    ratesSource: null,
  });
  assert.equal(leagueAlerts(), 3);

  setActiveLeague(ALPHA);
}

function leagueAlerts(): number {
  return (db.prepare("SELECT COUNT(*) AS c FROM alerts WHERE type = 'LEAGUE'").get() as { c: number }).c;
}

/**
 * A league name reaches SQL as an exact value, so two spellings are two markets: the poller would
 * sweep one and every panel would read the other, forever. Everything resolves to one canonical
 * spelling instead — here the app default's, which is the .env-vs-scout case clash in practice.
 */
function testCaseInsensitiveLeagues(): void {
  clearLeagueCache();
  clearUserLeagueCache();
  setActiveLeague("Standard");
  const now = Date.parse("2026-09-18T12:00:00.000Z");

  // MEMBER pinned the lower-case spelling; it must NOT become a second, never-read market.
  held(MEMBER, "standard", now - 60 * 60_000);
  assert.equal(canonicalLeague("standard"), "Standard");
  assert.equal(canonicalLeague("STANDARD"), "Standard");
  assert.equal(leagueForUser(MEMBER), "Standard", "a pinned spelling resolves to the canonical one");
  assert.deepEqual(getPolledLeagues(undefined, now), ["Standard"], "one market, swept once");

  // A non-default league keeps the longest-held spelling, and every reader agrees on it.
  held(THIRD, "league BETA", now - 90 * 60_000);
  held(OWNER, "League Beta", now - 30 * 60_000);
  assert.deepEqual(getPolledLeagues(undefined, now), ["Standard", "league BETA"]);
  assert.equal(leagueForUser(THIRD), "league BETA");
  assert.equal(leagueForUser(OWNER), "league BETA", "both spellings resolve to the swept one");

  // ...and a watchlist row stamped in either spelling is still evaluated against that sweep.
  db.exec("DELETE FROM watchlist");
  addWatch(OWNER, { itemId: "divine", itemName: "Divine Orb", category: "Currency" });
  db.prepare("UPDATE watchlist SET league = 'LEAGUE beta' WHERE user_id = ?").run(OWNER);
  assert.deepEqual(
    getWatchlistForLeague(OWNER, "league BETA").map((w) => w.item_id),
    ["divine"],
    "case must not hide a watched row from the poller",
  );

  db.exec("DELETE FROM watchlist");
  for (const id of [OWNER, MEMBER, THIRD]) clearUserLeague(id);
  clearLeagueCache();
  setActiveLeague(ALPHA);
}

/**
 * Positions, flips and trades are strictly per-league views: a flip belongs to the economy it was
 * made in, and a new league starts from zero. Nothing is deleted — switching back shows the other
 * league's ledger exactly as it was left.
 */
function testLedgersAreStrictlyPerLeague(): void {
  clearLeagueCache();
  clearUserLeagueCache();
  setActiveLeague(ALPHA);
  db.exec("DELETE FROM positions; DELETE FROM flips; DELETE FROM trades;");

  const inAlpha = insertPosition(MEMBER, ALPHA, {
    item_id: "divine", item_name: "Divine Orb", qty: 2, buy_price: 10, buy_ccy: "EXALT", buy_div_unit: 0.5, notes: null,
  });
  const inBeta = insertPosition(MEMBER, BETA, {
    item_id: "chaos", item_name: "Chaos Orb", qty: 5, buy_price: 3, buy_ccy: "EXALT", buy_div_unit: 0.1, notes: null,
  });

  assert.deepEqual(getOpenPositions(MEMBER, ALPHA).map((p) => p.id), [inAlpha.id], "only this league's rows");
  assert.deepEqual(getOpenPositions(MEMBER, BETA).map((p) => p.id), [inBeta.id]);

  // Closing (or cancelling) a foreign-league id must find nothing at all — not a 403, a 404.
  assert.equal(getPosition(MEMBER, ALPHA, inBeta.id), undefined, "a foreign position does not exist here");
  assert.equal(getPosition(MEMBER, BETA, inBeta.id)?.id, inBeta.id);
  deletePosition(MEMBER, ALPHA, inBeta.id);
  assert.equal(getPosition(MEMBER, BETA, inBeta.id)?.id, inBeta.id, "a foreign-league delete is a no-op");

  // Realized ledgers: Divines from two economies are never summed into one number.
  insertFlip(MEMBER, ALPHA, {
    item_id: "divine", item_name: "Divine Orb", qty: 1, buy_price: 1, buy_ccy: "EXALT",
    sell_price: 2, sell_ccy: "EXALT", profit_div: 4, profit_chaos: 40, notes: null,
  });
  insertFlip(MEMBER, BETA, {
    item_id: "chaos", item_name: "Chaos Orb", qty: 1, buy_price: 1, buy_ccy: "EXALT",
    sell_price: 2, sell_ccy: "EXALT", profit_div: 7, profit_chaos: 70, notes: null,
  });
  assert.equal(realizedPnl(MEMBER, ALPHA).total, 4);
  assert.equal(realizedPnl(MEMBER, BETA).total, 7, "a new league starts from zero, not from Alpha's total");
  assert.equal(getFlips(MEMBER, ALPHA).length, 1);
  assert.equal(getFlips(MEMBER, GAMMA).length, 0, "an untouched league is empty, not a mixture");

  insertTrade(MEMBER, ALPHA, {
    item_id: "divine", item_name: "Divine Orb", side: "BUY", currency: "EXALT",
    rate: 1, quantity: 1, total_currency: 1, profit_chaos: null, notes: null,
  });
  assert.equal(getTrades(MEMBER, ALPHA).length, 1);
  assert.equal(getTrades(MEMBER, BETA).length, 0);

  // Switching back finds the other league's ledger untouched.
  assert.deepEqual(getOpenPositions(MEMBER, BETA).map((p) => p.id), [inBeta.id]);
  db.exec("DELETE FROM positions; DELETE FROM flips; DELETE FROM trades;");
}

/**
 * Following the default must be reachable, or a user who once pinned this league sits in a dead
 * market next league while everyone else moves on.
 */
async function testFollowDefault(): Promise<void> {
  clearLeagueCache();
  clearUserLeagueCache();
  setActiveLeague(ALPHA);
  const known = deps([ALPHA, BETA, GAMMA]);

  const pinned = await switchViewLeague(MEMBER, BETA, known);
  assert.equal(pinned.ok && pinned.league, BETA);
  assert.equal(ownLeague(MEMBER), BETA, "pinned");

  // Moving the default leaves a pinned user exactly where they are — that is the point of a pin.
  setActiveLeague(GAMMA);
  clearUserLeagueCache();
  assert.equal(leagueForUser(MEMBER), BETA);

  // null = un-pin. The scout list is never consulted: there is no name to validate.
  const freed = await switchViewLeague(MEMBER, null, failingDeps());
  assert.deepEqual(freed, { ok: true, league: GAMMA, ratesSource: "failed" });
  assert.equal(ownLeague(MEMBER), null, "un-pinned");
  assert.equal(leagueForUser(MEMBER), GAMMA);

  // ...and from now on they move WITH the default.
  setActiveLeague(ALPHA);
  clearUserLeagueCache();
  assert.equal(leagueForUser(MEMBER), ALPHA, "a following user tracks the default as it moves");
  assert.equal(ownLeague(MEMBER), null);
}
