import { officialPatchVersions } from "../../db/craftQueries";
import { patchImpactSource } from "../../db/priceAtQueries";
import { PATCH_VERSION_RE } from "../../sources/patchNotes/contracts";
import { patchTexts } from "../patchImpact/catalog";
import { mapPatchItems, tokenize, type CatalogEntry, type PatchText } from "../patchImpact/match";
import { comparePatch } from "../tools/bossEv/schema";
import type { StaleReason } from "./schema";

/**
 * A recipe goes stale when an official patch newer than the one it was verified on names one of
 * the entities it depends on. The names come from the patch title, change list and AI summary, via
 * the same whole-name matcher the patch→price view uses. No table: the answer is recomputed from
 * official_patch and memoized, because it only changes when a patch thread lands.
 */

export interface PatchDoc {
  threadId: number;
  version: string;
  title: string;
  texts: PatchText[];
}

export interface StaleSubject {
  key: string;
  patchVerified: string;
  names: readonly string[];
}

/**
 * Base currency that patch prose mentions almost every patch (drop tables, vendor recipes, bug
 * fixes). Matching them would mark every recipe stale on every patch, so the badge would mean
 * nothing; the tiered orbs (Greater/Perfect) and every omen, bone, essence and liquid still count.
 */
export const TOO_COMMON_NAMES: ReadonlySet<string> = new Set([
  "Divine Orb", "Exalted Orb", "Chaos Orb", "Orb of Annulment", "Regal Orb", "Orb of Alchemy", "Orb of Augmentation",
  "Orb of Transmutation", "Vaal Orb", "Artificer's Orb", "Armourer's Scrap",
]);

const nameKey = (name: string): string => tokenize(name).join(" ");

/** Pure: stale reasons per recipe key (recipes with none are absent). */
export function patchStaleness(subjects: readonly StaleSubject[], patches: readonly PatchDoc[]): Map<string, StaleReason[]> {
  const out = new Map<string, StaleReason[]>();
  for (const patch of patches) {
    const newer = subjects.filter((s) => comparePatch(patch.version, s.patchVerified) > 0);
    if (newer.length === 0) continue;
    const catalog: CatalogEntry[] = [...new Set(newer.flatMap((s) => s.names))].map((name) => ({ name, kind: "exchange", itemId: null, category: null, icon: null }));
    const named = new Set(mapPatchItems(patch.texts, catalog).items.map((m) => nameKey(m.entry.name)));
    for (const s of newer) {
      const items = s.names.filter((n) => named.has(nameKey(n)));
      if (items.length === 0) continue;
      const reasons = out.get(s.key) ?? [];
      reasons.push({ kind: "patch", version: patch.version, threadId: patch.threadId, title: patch.title, items: [...items].sort() });
      out.set(s.key, reasons);
    }
  }
  return out;
}

/** Forum titles carry "0.5.5B" as often as "0.5.5b"; rows without a version (thread-123) cannot be ordered. */
function versionOf(versionText: string): string | null {
  const v = versionText.trim().toLowerCase();
  return PATCH_VERSION_RE.test(v) ? v : null;
}

/** Patch texts newer than `since`, read from official_patch (+ its summary when done). */
export function loadPatchDocs(since: string): PatchDoc[] {
  const docs: PatchDoc[] = [];
  for (const row of officialPatchVersions()) {
    const version = versionOf(row.versionText);
    if (version === null || comparePatch(version, since) <= 0) continue;
    const source = patchImpactSource(row.threadId);
    if (!source) throw new Error(`official patch ${row.threadId} vanished between two reads`);
    docs.push({ threadId: row.threadId, version, title: row.title, texts: patchTexts(source) });
  }
  return docs;
}

export const PATCH_STALE_TTL_MS = 15 * 60_000;
let cache: { atMs: number; value: Map<string, StaleReason[]> } | null = null;

/** Memoized for 15 min: a patch thread lands a few times a month, the Craft tab polls every minute. */
export function recipePatchStaleness(subjects: readonly StaleSubject[], nowMs = Date.now()): Map<string, StaleReason[]> {
  if (cache && nowMs - cache.atMs < PATCH_STALE_TTL_MS) return cache.value;
  const oldest = subjects.reduce<string | null>((min, s) => (min === null || comparePatch(s.patchVerified, min) < 0 ? s.patchVerified : min), null);
  const value = oldest === null ? new Map<string, StaleReason[]>() : patchStaleness(subjects, loadPatchDocs(oldest));
  cache = { atMs: nowMs, value };
  return value;
}

/** Tests seed official_patch between reads; production never needs this. */
export function resetPatchStaleCache(): void {
  cache = null;
}
