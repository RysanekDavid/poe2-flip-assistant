import type Database from "better-sqlite3";
import { getDb } from "../../db/database";
import { busiestLeagueBetween, itemPricesBetween, oldestSnapshotMs, patchImpactSource, type PricePoint } from "../../db/priceAtQueries";
import type { ImpactCategory, ImpactItem, LikelyAffected, PatchImpactResponse, PatchTextSource } from "../../lib/patchImpactContract";
import { PATCH_TEXT_SOURCES } from "../../lib/patchImpactContract";
import { buildNameCatalog, patchTexts, type NameCatalog } from "./catalog";
import { mapPatchItems, type ItemMatch, type PatchMatches } from "./match";
import { categoryMedians, horizonDue, itemMoves, PRE_GAP_MS, snapshotWindow, type ItemMoves } from "./moves";
import { patchTimeOf, type PatchTime } from "./patchTime";

/**
 * Patches › price impact: which exchange items a patch names and how their prices moved after it.
 * Correlation only — the UI says so. Read-only over stored data (0 network requests).
 */

const DAY_MS = 86_400_000;
export const IMPACT_MEMO_MS = 15 * 60_000;
const MEMO_MAX = 100;

export interface ImpactOptions {
  nowMs: number;
  retentionDays: number;
  /** League whose names are matched when no league has snapshots around the patch. */
  fallbackLeague: string;
  /** Craft-catalog base names ("likely affected" only — bases have no exchange price). */
  bases: readonly string[];
  db?: Database.Database;
}

function pricedItems(matches: ItemMatch[], moves: Map<string, ItemMoves>): ImpactItem[] {
  const out: ImpactItem[] = [];
  for (const { entry, sources } of matches) {
    if (entry.kind !== "ninja" || entry.itemId === null) continue;
    const m = moves.get(entry.itemId);
    if (!m) throw new Error(`patch impact: no moves computed for matched item ${entry.itemId}`);
    out.push({ itemId: entry.itemId, name: entry.name, category: entry.category ?? "", icon: entry.icon, sources, preDiv: m.preDiv, points: m.points });
  }
  // Biggest absolute latest move first; unmeasured rows sink.
  const key = (i: ImpactItem): number => {
    const pct = i.points.d7.pct ?? i.points.h72.pct ?? i.points.h24.pct;
    return pct === null ? -1 : Math.abs(pct);
  };
  return out.sort((a, b) => key(b) - key(a) || a.name.localeCompare(b.name));
}

function categoriesOf(matches: PatchMatches, catalog: NameCatalog, moves: Map<string, ItemMoves>): ImpactCategory[] {
  const hits = new Map<string, { keywords: string[]; sources: Set<PatchTextSource> }>();
  for (const c of matches.categories) hits.set(c.category, { keywords: c.keywords, sources: new Set(c.sources) });
  for (const { entry, sources } of matches.items) {
    if (entry.kind !== "ninja" || !entry.category) continue;
    const hit = hits.get(entry.category) ?? { keywords: [], sources: new Set<PatchTextSource>() };
    for (const s of sources) hit.sources.add(s);
    hits.set(entry.category, hit);
  }
  return [...hits.entries()]
    .map(([category, hit]) => {
      const members = catalog.ninja.filter((r) => r.category === category).map((r) => moves.get(r.itemId));
      const measured = members.filter((m): m is ItemMoves => m !== undefined);
      return { category, keywords: hit.keywords, sources: PATCH_TEXT_SOURCES.filter((s) => hit.sources.has(s)), medians: categoryMedians(measured) };
    })
    .sort((a, b) => a.category.localeCompare(b.category));
}

function likelyAffected(matches: PatchMatches): LikelyAffected[] {
  const out: LikelyAffected[] = [];
  for (const { entry, sources } of matches.items) {
    if (entry.kind === "ninja") continue;
    out.push({ name: entry.name, kind: entry.kind, sources });
  }
  return out;
}

/** Item ids whose history is read: every named item plus every member of a touched category. */
function idsToRead(matches: PatchMatches, catalog: NameCatalog): string[] {
  const ids = new Set<string>();
  const categories = new Set(matches.categories.map((c) => c.category));
  for (const { entry } of matches.items) {
    if (entry.kind !== "ninja" || entry.itemId === null) continue;
    ids.add(entry.itemId);
    if (entry.category) categories.add(entry.category);
  }
  for (const r of catalog.ninja) if (categories.has(r.category)) ids.add(r.itemId);
  return [...ids];
}

function bannerFor(time: PatchTime, league: string | null, moves: Map<string, ItemMoves>, opts: ImpactOptions, db: Database.Database): PatchImpactResponse["banner"] {
  if (time.ms < opts.nowMs - opts.retentionDays * DAY_MS) return "history_not_retained";
  if (league === null) return "no_history_league";
  const oldest = oldestSnapshotMs(league, db);
  const historyStartsBefore = oldest !== null && oldest <= time.ms - PRE_GAP_MS;
  const anyPre = moves.size === 0 || [...moves.values()].some((m) => m.preDiv !== null);
  return historyStartsBefore && anyPre ? null : "no_pre_data";
}

/** null when the thread does not exist. */
export function computePatchImpact(threadId: number, opts: ImpactOptions): PatchImpactResponse | null {
  const db = opts.db ?? getDb();
  const source = patchImpactSource(threadId, db);
  if (!source) return null;
  const time = patchTimeOf(source);
  const window = snapshotWindow(time.ms);
  const league = busiestLeagueBetween(window.fromMs, window.toMs, db);
  const catalog = buildNameCatalog(league ?? opts.fallbackLeague, opts.bases, db);
  const matches = mapPatchItems(patchTexts(source), catalog.entries);
  const ids = idsToRead(matches, catalog);
  const prices = league === null ? new Map<string, PricePoint[]>() : itemPricesBetween(league, ids, window.fromMs, window.toMs, db);
  const moves = new Map<string, ItemMoves>();
  for (const id of ids) moves.set(id, itemMoves(prices.get(id) ?? [], time.ms, opts.nowMs));
  return {
    threadId,
    patchTime: { at: new Date(time.ms).toISOString(), source: time.source, raw: time.raw },
    league,
    due: { h24: horizonDue(time.ms, opts.nowMs, "h24"), h72: horizonDue(time.ms, opts.nowMs, "h72"), d7: horizonDue(time.ms, opts.nowMs, "d7") },
    banner: bannerFor(time, league, moves, opts, db),
    retentionDays: opts.retentionDays,
    items: pricedItems(matches.items, moves),
    categories: categoriesOf(matches, catalog, moves),
    likelyAffected: likelyAffected(matches),
    computedAt: new Date(opts.nowMs).toISOString(),
  };
}

const memo = new Map<string, { atMs: number; value: PatchImpactResponse | null }>();

/**
 * 15-minute memo: the answer only changes when an hourly snapshot lands or a horizon passes, and
 * each expanded card would otherwise re-scan the league's snapshot window.
 */
export function patchImpactMemo(threadId: number, opts: ImpactOptions): PatchImpactResponse | null {
  const key = `${threadId}|${opts.fallbackLeague}`;
  const hit = memo.get(key);
  if (hit && opts.nowMs - hit.atMs < IMPACT_MEMO_MS) return hit.value;
  const value = computePatchImpact(threadId, opts);
  memo.delete(key);
  memo.set(key, { atMs: opts.nowMs, value });
  if (memo.size > MEMO_MAX) {
    const oldest = memo.keys().next();
    if (!oldest.done) memo.delete(oldest.value);
  }
  return value;
}

export function clearPatchImpactMemo(): void {
  memo.clear();
}
