/*
 * Warnings for a composed pool search. Every compromise the composer made (split strings, rounded
 * numbers, anchors, fallbacks, masked or dropped mods, unverified header spellings, ignored
 * selection entries) becomes one visible chip — the player must never get a quietly weaker string.
 */
import type { PoolWarning } from "../../../lib/tools/regexPoolContract";
import { headerKey } from "./poolNamespace";
import type { PoolToken } from "./poolTokens";
import type { ComposeContext } from "./poolTerms";

export interface WarningInput {
  ctx: ComposeContext;
  tokens: readonly PoolToken[];
  chunks: ReadonlyArray<{ text: string }>;
  masked: readonly string[];
  uncovered: readonly string[];
}

const list = (ids: readonly string[], max = 6): string => (ids.length <= max ? ids.join(", ") : `${ids.slice(0, max).join(", ")} … +${ids.length - max}`);

function splitWarnings({ ctx, chunks }: WarningInput): PoolWarning[] {
  if (chunks.length <= 1) return [];
  if (ctx.selection.match === "any") {
    return [{ code: "multi-string", label: `${chunks.length} strings`, detail: "The wanted mods did not fit one string. Paste each string in turn; an item is a match if ANY of them lights it." }];
  }
  return [{ code: "all-split", label: `${chunks.length} strings (all)`, detail: 'An "all" search did not fit one string, so each string checks only some of the wanted mods. A match must light up in EVERY string.' }];
}

function tokenWarnings({ tokens }: WarningInput): PoolWarning[] {
  const out: PoolWarning[] = [];
  const rounded = tokens.filter((t) => t.rounded);
  if (rounded.length > 0) out.push({ code: "rounded", label: `${rounded.length} rounded`, detail: "Some thresholds were widened to whole tens to fit the character limit — slightly lower rolls also match." });
  const anchored = tokens.filter((t) => t.anchored);
  if (anchored.length > 0) out.push({ code: "anchors", label: "uses ^ / $", detail: "Line anchors (^ start, $ end) are the least-tested part of the search dialect — verify these strings in-game once." });
  const verify = tokens.filter((t) => t.verify);
  if (verify.length > 0) {
    const hits = [...new Set(verify.flatMap((t) => t.collisions))];
    out.push({ code: "verify-in-game", label: `${verify.length} to verify`, detail: `No fragment avoids every other line, so these may also light: ${list(hits)}.` });
  }
  return out;
}

function headerWarnings({ ctx, tokens }: WarningInput): PoolWarning[] {
  const used = new Set(tokens.flatMap((t) => t.covers));
  const unverified = ctx.headers.filter((h) => h.verified === "unverified" && used.has(headerKey(h.id)));
  if (unverified.length === 0) return [];
  return [{ code: "unverified-header", label: `${unverified.length} unverified line`, detail: `Spelling not yet seen in a clipboard paste: ${list(unverified.map((h) => h.template))}. Verify in-game.` }];
}

function selectionWarnings({ ctx, masked, uncovered, tokens }: WarningInput): PoolWarning[] {
  const out: PoolWarning[] = [];
  if (tokens.some((t) => t.kind === "avoid") || ctx.selection.corrupted === "exclude") {
    out.push({ code: "negation-scope", label: '"!a|b" = none of', detail: 'A leading ! is read as "none of a|b|…", as poe2.re strings rely on; confirmed by that tool, not yet by our own in-game test.' });
  }
  if (masked.length > 0) out.push({ code: "masked", label: `${masked.length} masked`, detail: `The avoid part also matches these wanted mods, so items with them stay dark: ${list(masked)}.` });
  if (uncovered.length > 0) out.push({ code: "uncovered", label: `${uncovered.length} not in any string`, detail: `Too long to fit next to the filters: ${list(uncovered)}. Raise max chars or drop filters.` });
  if (ctx.notes.unknown.length > 0) out.push({ code: "unknown-mod", label: `${ctx.notes.unknown.length} unknown`, detail: `Not in the current game data (renamed or removed by a patch): ${list(ctx.notes.unknown)}.` });
  if (ctx.notes.ignored.length > 0) out.push({ code: "threshold-ignored", label: `${ctx.notes.ignored.length} ignored`, detail: ctx.notes.ignored.join("; ") });
  return out;
}

export function buildPoolWarnings(input: WarningInput): PoolWarning[] {
  return [...splitWarnings(input), ...tokenWarnings(input), ...headerWarnings(input), ...selectionWarnings(input)];
}
