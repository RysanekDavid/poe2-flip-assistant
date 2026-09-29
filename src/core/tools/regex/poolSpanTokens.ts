/*
 * Last resort before an unsafe fallback: a pattern that straddles one rolled number, e.g.
 * `r s.*a o` for "Banner Skills have #% increased Area of Effect", where the text on either side
 * of the number also exists alone ("Banner Skills have #% increased Duration", "#% increased Area of
 * Effect"). The connector is `\d+` (or `.*` for decimal lines); a line-leading number takes `^`.
 * Unlike literal fragments these cannot be checked through the trigram index, so every candidate
 * is compiled and tested against every namespace line with real digits in the number slots.
 */
import { escapeSearchText } from "./fragment";
import type { PoolNamespace } from "./poolNamespace";
import { fillSample, tokenCoversMod } from "./poolSamples";
import type { PoolMod } from "./pools/schema";
import { segmentsOf } from "./pools/template";
import { compileSafeRegex } from "./safeRegex";

// Any space forces quotes around the whole term (same trade-off as poolTokens).
const SPACE_PENALTY = 3;
// Beyond this many tried candidates the mod falls back to a flagged token rather than stall a keystroke.
const MAX_TRIES = 4000;
// A value with two digits exercises `\d+` and `.*` the same way any rolled number would.
const SAMPLE_VALUE = 12;

interface Span {
  text: string;
  anchored: boolean;
  cost: number;
}

/**
 * Literal edges next to the number: every suffix (lead) / prefix (trail) of the neighbouring text,
 * plus — when that text runs to the line's start/end — the whole text pinned with ^ / $. The
 * pinned form separates "#% increased Area of Effect" from "…Area of Effect of Curses".
 */
function edges(text: string, fromEnd: boolean, lineEdge: boolean): Array<{ text: string; anchored: boolean }> {
  const anchor = fromEnd ? "^" : "$";
  if (text.length === 0) return [{ text: anchor, anchored: true }];
  const parts = Array.from({ length: text.length }, (_, i) => {
    const part = fromEnd ? text.slice(text.length - i - 1) : text.slice(0, i + 1);
    return { text: escapeSearchText(part), anchored: false };
  });
  if (!lineEdge) return parts;
  const whole = escapeSearchText(text);
  return [...parts, { text: fromEnd ? `^${whole}` : `${whole}$`, anchored: true }];
}

function spansOf(mod: PoolMod): Span[] {
  const out = new Map<string, Span>();
  const tier = mod.tiers[0];
  for (const { line } of tier?.lines ?? []) {
    const target = mod.lines[line];
    if (!target) continue;
    const segs = segmentsOf(target.template);
    const connectors = target.numeric.decimals > 0 ? [".*"] : ["\\d+", ".*"];
    for (let i = 0; i + 1 < segs.length; i++) {
      for (const lead of edges(segs[i] ?? "", true, i === 0)) {
        for (const trail of edges(segs[i + 1] ?? "", false, i + 2 === segs.length)) {
          for (const conn of connectors) {
            const text = `${lead.text}${conn}${trail.text}`;
            const cost = text.length + (text.includes(" ") ? SPACE_PENALTY : 0);
            if (!out.has(text)) out.set(text, { text, anchored: lead.anchored || trail.anchored, cost });
          }
        }
      }
    }
  }
  return [...out.values()].sort((a, b) => a.cost - b.cost || Number(a.anchored) - Number(b.anchored) || a.text.localeCompare(b.text));
}

/** Cheapest number-straddling pattern that covers every tier and hits no other line; null if none. */
export function spanToken(
  ns: PoolNamespace,
  mod: PoolMod,
  allowed: ReadonlySet<string>,
  same: ReadonlySet<string>,
): { text: string; anchored: boolean } | null {
  const others = ns.lines.filter((l) => !allowed.has(l.owner) && !same.has(l.template)).map((l) => fillSample(l.template, SAMPLE_VALUE));
  for (const span of spansOf(mod).slice(0, MAX_TRIES)) {
    const regex = compileSafeRegex(span.text);
    if (!tokenCoversMod(regex, mod) || others.some((l) => regex.test(l))) continue;
    return { text: span.text, anchored: span.anchored };
  }
  return null;
}
