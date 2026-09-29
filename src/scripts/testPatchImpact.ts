import assert from "node:assert/strict";
import type Database from "better-sqlite3";
import { ensureCxTables } from "../db/cxMigrations";
import { toSqliteTime } from "../db/priceAtQueries";
import { PATCH_SOURCE_ID } from "../sources/patchNotes/contracts";
import { clearPatchImpactMemo, computePatchImpact, IMPACT_MEMO_MS, patchImpactMemo, type ImpactOptions } from "../core/patchImpact/impact";
import { mapPatchItems, type CatalogEntry } from "../core/patchImpact/match";
import { parseForumDateUtc, patchTimeOf } from "../core/patchImpact/patchTime";
import { patchImpactResponseSchema, type PatchImpactResponse } from "../lib/patchImpactContract";
import { openPatchDb } from "./testPatchHelpers";

/** Patches › price impact: time derivation, name matching, horizon moves, banners, memo. */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const T = Date.UTC(2026, 8, 18, 0, 30, 0); // "Sep 18, 2026, 12:30:00 AM" read as UTC
const LEAGUE = "Runes of Aldur";
const THREAD = 4_006_357;

function testPatchTime(): void {
  assert.equal(parseForumDateUtc("Sep 18, 2026, 12:30:00 AM"), T);
  assert.equal(parseForumDateUtc("Sep 11, 2026, 3:39:22 PM"), Date.UTC(2026, 8, 11, 15, 39, 22));
  assert.equal(parseForumDateUtc("September 8 2026"), Date.UTC(2026, 8, 8));
  assert.equal(parseForumDateUtc("2026-09-08 05:03"), Date.UTC(2026, 8, 8, 5, 3));
  assert.equal(parseForumDateUtc("Feb 31, 2026"), null, "a rolled-over date is a misparse");
  assert.equal(parseForumDateUtc("yesterday"), null);
  const firstSeen = "2026-09-18 02:00:00";
  assert.deepEqual(patchTimeOf({ publishedAt: null, publishedText: "Sep 18, 2026, 12:30:00 AM", firstSeenAt: firstSeen }), {
    ms: T, source: "published_text", raw: "Sep 18, 2026, 12:30:00 AM",
  });
  assert.equal(patchTimeOf({ publishedAt: null, publishedText: "today", firstSeenAt: firstSeen }).source, "first_seen");
  assert.equal(patchTimeOf({ publishedAt: null, publishedText: "today", firstSeenAt: firstSeen }).ms, Date.UTC(2026, 8, 18, 2));
  const explicit = patchTimeOf({ publishedAt: "2026-09-18T01:00:00.000Z", publishedText: "x", firstSeenAt: firstSeen });
  assert.equal(explicit.source, "published_at");
  assert.equal(explicit.ms, Date.UTC(2026, 8, 18, 1));
}

const entry = (name: string, kind: CatalogEntry["kind"], itemId: string | null = null, category: string | null = null): CatalogEntry => ({
  name, kind, itemId, category, icon: null,
});

function testMatching(): void {
  const catalog = [
    entry("Divine Orb", "ninja", "divine", "Currency"),
    entry("Divine Orb", "exchange"),
    entry("Greater Rune of Alacrity", "ninja", "greater-alacrity", "Runes"),
    entry("Rune of Alacrity", "ninja", "alacrity", "Runes"),
    entry("Gold", "ninja", "gold", "Currency"),
    entry("Kulemak's Invitation", "ninja", "kulemak", "Fragments"),
    entry("Headhunter", "unique"),
    entry("Incomplete", "unique"),
    entry("Ruby Ring", "base"),
  ];
  const { items, categories } = mapPatchItems([
    { source: "title", text: "0.5.5c Patch Notes" },
    { source: "body", text: "Fixed the Divine Orbital cannon.\nDivine Orbs drop more.\nGreater Rune of Alacrity grants more.\nKulemak’s Invitation is cheaper.\nGold costs reduced.\nHEADHUNTER changed.\nFixed an incomplete tooltip on ruby ring.\nNew omens added." },
    { source: "summary", text: "Divine Orb and Kulemak's Invitation prices may shift." },
  ], catalog);
  const found = new Map(items.map((m) => [m.entry.name, m]));
  assert.deepEqual([...found.keys()].sort(), ["Divine Orb", "Greater Rune of Alacrity", "Headhunter", "Kulemak's Invitation", "Ruby Ring"]);
  assert.ok(!found.has("Incomplete"), "a lowercase everyday word is not a one-word unique");
  assert.equal(found.get("Ruby Ring")?.entry.kind, "base", "multi-word names match in any case");
  assert.deepEqual(found.get("Divine Orb")?.sources, ["summary"], "plurals and longer words do not match");
  assert.equal(found.get("Divine Orb")?.entry.kind, "ninja", "the priced catalog wins a name clash");
  assert.deepEqual(found.get("Kulemak's Invitation")?.sources, ["body", "summary"], "curly apostrophes normalize");
  assert.equal(found.get("Headhunter")?.entry.kind, "unique");
  assert.ok(!found.has("Rune of Alacrity"), "the longest name at a position wins");
  assert.ok(!found.has("Gold"), "names under 5 chars are skipped");
  assert.deepEqual(categories.map((c) => c.category), ["Ritual", "Runes"]);
  assert.deepEqual(categories.find((c) => c.category === "Ritual")?.keywords, ["omens"]);
}

function seedPatch(db: Database.Database, bodyItems: string[], publishedText = "Sep 18, 2026, 12:30:00 AM"): void {
  const index = db.prepare(`INSERT INTO source_snapshot (source_id, snapshot_kind, external_id, source_url, http_status,
    content_sha256, artifact_path, content_bytes, valid, parser_name, parser_version, validation_policy, retrieved_at)
    VALUES (?, 'index', '2212', 'https://x', 200, ?, 'a', 1, 1, 't', 't', 't', 'now')`).run(PATCH_SOURCE_ID, "0".repeat(64)).lastInsertRowid;
  db.prepare(`INSERT INTO official_patch (thread_id, source_id, source_order, title, version_text, published_text,
    source_url, index_snapshot_id, body_valid, headings_json, list_items_json, first_seen_at)
    VALUES (?, ?, ?, '0.5.5c Patch Notes', '0.5.5c', ?, 'https://x', ?, 1, '[]', ?, '2026-09-18 02:00:00')`)
    .run(THREAD, PATCH_SOURCE_ID, THREAD, publishedText, index, JSON.stringify(bodyItems));
}

function snap(db: Database.Database, league: string, itemId: string, name: string, category: string, div: number, atMs: number): void {
  db.prepare(`INSERT INTO price_snapshots (league, item_id, item_name, category, chaos_equiv, volume, icon, fetched_at)
    VALUES (?, ?, ?, ?, ?, 1, NULL, ?)`).run(league, itemId, name, category, div, toSqliteTime(atMs));
}

function openImpactDb(): Database.Database {
  const db = openPatchDb();
  ensureCxTables(db);
  return db;
}

const options = (db: Database.Database, nowMs: number, retentionDays = 30): ImpactOptions => ({
  db, nowMs, retentionDays, fallbackLeague: LEAGUE, bases: ["Ruby Ring"],
});

function seedMarket(db: Database.Database): void {
  // Exalted: pre 0.010 → +24h 0.011 (1h off target) → +72h only 4h off (outside ±3h) → +7d 0.012.
  snap(db, LEAGUE, "exalted", "Exalted Orb", "Currency", 0.009, T - 8 * HOUR); // outside the pre lookback
  snap(db, LEAGUE, "exalted", "Exalted Orb", "Currency", 0.01, T - 2 * HOUR);
  snap(db, LEAGUE, "exalted", "Exalted Orb", "Currency", 0.5, T - 30 * 60_000); // inside the 1h gap: not "pre"
  snap(db, LEAGUE, "exalted", "Exalted Orb", "Currency", 0.011, T + DAY + HOUR);
  snap(db, LEAGUE, "exalted", "Exalted Orb", "Currency", 0.02, T + 3 * DAY + 4 * HOUR);
  snap(db, LEAGUE, "exalted", "Exalted Orb", "Currency", 0.012, T + 7 * DAY - 2 * HOUR);
  // Chaos: flat (a real 0 %) — and a Currency member the patch never names, so it only feeds the median.
  snap(db, LEAGUE, "chaos", "Chaos Orb", "Currency", 0.05, T - 3 * HOUR);
  snap(db, LEAGUE, "chaos", "Chaos Orb", "Currency", 0.05, T + DAY);
  // Runes item first seen after the patch → no pre, every % null.
  snap(db, LEAGUE, "alacrity", "Greater Rune of Alacrity", "Runes", 2, T + DAY);
  snap(db, "Standard", "exalted", "Exalted Orb", "Currency", 0.001, T + DAY);
}

function testMoves(): void {
  const db = openImpactDb();
  try {
    seedPatch(db, ["Exalted Orb drop rate increased.", "Greater Rune of Alacrity reworked.", "Headhunter nerfed."]);
    seedMarket(db);
    db.prepare("INSERT INTO item_values (league, name_key, value_div, source) VALUES (?, 'headhunter', 50, 'scout')").run(LEAGUE);
    const impact = computePatchImpact(THREAD, options(db, T + 8 * DAY));
    assert.ok(impact);
    patchImpactResponseSchema.parse(impact);
    assert.equal(impact.league, LEAGUE, "the league with the most snapshots in the window");
    assert.equal(impact.patchTime.source, "published_text");
    assert.equal(impact.patchTime.at, new Date(T).toISOString());
    assert.equal(impact.banner, null);
    const exalted = impact.items.find((i) => i.itemId === "exalted");
    assert.ok(exalted);
    assert.equal(exalted.preDiv, 0.01);
    assert.ok(Math.abs((exalted.points.h24.pct ?? NaN) - 10) < 1e-9);
    assert.deepEqual(exalted.points.h72, { div: null, pct: null }, "nothing within ±3h → null, never 0");
    assert.ok(Math.abs((exalted.points.d7.pct ?? NaN) - 20) < 1e-9);
    const rune = impact.items.find((i) => i.itemId === "alacrity");
    assert.ok(rune);
    assert.equal(rune.preDiv, null);
    assert.equal(rune.points.h24.div, 2);
    assert.equal(rune.points.h24.pct, null, "no pre → no %");
    const currency = impact.categories.find((c) => c.category === "Currency");
    assert.ok(currency);
    assert.equal(currency.medians.h24.n, 2, "median over the category incl. the unnamed flat Chaos");
    assert.ok(Math.abs((currency.medians.h24.pct ?? NaN) - 5) < 1e-9);
    assert.deepEqual(currency?.medians.h72, { pct: null, n: 0 });
    assert.deepEqual(impact.likelyAffected, [{ name: "Headhunter", kind: "unique", sources: ["body"] }]);
    assert.ok(!impact.items.some((i) => i.name === "Headhunter"), "uniques are never priced");
  } finally {
    db.close();
  }
}

function testHorizonsAndBanners(): void {
  const db = openImpactDb();
  try {
    seedPatch(db, ["Exalted Orb drop rate increased."]);
    seedMarket(db);
    const early = computePatchImpact(THREAD, options(db, T + 4 * DAY));
    assert.ok(early);
    assert.deepEqual(early.due, { h24: true, h72: true, d7: false });
    assert.deepEqual(early.items[0]?.points.d7, { div: null, pct: null }, "future horizon stays null");
    const old = computePatchImpact(THREAD, options(db, T + 40 * DAY));
    assert.equal(old?.banner, "history_not_retained");
    db.exec("DELETE FROM price_snapshots WHERE fetched_at < '2026-09-18 00:00:00'");
    assert.equal(computePatchImpact(THREAD, options(db, T + 8 * DAY))?.banner, "no_pre_data");
    db.exec("DELETE FROM price_snapshots");
    const empty = computePatchImpact(THREAD, options(db, T + 8 * DAY));
    assert.equal(empty?.banner, "no_history_league");
    assert.equal(empty?.league, null);
    assert.equal(computePatchImpact(999, options(db, T)), null);
  } finally {
    db.close();
  }
}

function testMemo(): void {
  const db = openImpactDb();
  try {
    clearPatchImpactMemo();
    seedPatch(db, ["Exalted Orb drop rate increased."]);
    const first = patchImpactMemo(THREAD, options(db, T + 8 * DAY));
    seedMarket(db);
    const cached: PatchImpactResponse | null = patchImpactMemo(THREAD, options(db, T + 8 * DAY + IMPACT_MEMO_MS - 1));
    assert.equal(cached, first, "served from the memo inside 15 minutes");
    const fresh = patchImpactMemo(THREAD, options(db, T + 8 * DAY + IMPACT_MEMO_MS));
    assert.notEqual(fresh, first);
    assert.equal(fresh?.league, LEAGUE, "recomputed after the memo expired");
  } finally {
    clearPatchImpactMemo();
    db.close();
  }
}

testPatchTime();
testMatching();
testMoves();
testHorizonsAndBanners();
testMemo();
console.log("patch impact tests passed");
