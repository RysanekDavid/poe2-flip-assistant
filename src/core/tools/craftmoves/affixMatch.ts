import type { AffixSide, CatalogCombo } from "./catalog";
import type { ParsedItem } from "../../itemParser";
import { cleanItemLine, matchAt, resolveHits, type MatchPool, type TemplateHit } from "./modMatcher";
import type { Affix, AffixKind, ItemState } from "./classify";

/**
 * Line-level half of classification: split the explicit block into affix groups (at Ctrl+Alt+C
 * headers when present) and match each group against the base's catalog pool.
 */

interface Line {
  text: string;
  kind: AffixKind;
}

export interface LineGroup {
  header: HeaderInfo | null;
  lines: Line[];
}

interface HeaderInfo {
  side: AffixSide | null;
  name: string | null;
  kind: AffixKind | null;
  skip: boolean; // implicit / enchant / rune / unique headers
}

const AFFIX_MARKERS = new Set<string>(["explicit", "crafted", "fractured", "desecrated"]);
// "Label: value" property lines and the instruction text jewels/charms carry are never affixes
// ("Quality (Attribute Modifiers): +20% (augmented)" is the catalysed Quality line)
const PROPERTY_LINE = /^[A-Z][A-Za-z' ]{0,40}(?: \([^)]*\))?:\s/;
const DESCRIPTION_LINE = /^(Place into an allocated|Right click to|Can only be|Travel to|Use this|This item can be)/i;
// basic copy: "... unrevealed ..."; advanced copy: `{ Prefix Modifier "" }` then a bare "Desecrated Prefix"
const UNREVEALED = /\bunrevealed\b|^Desecrated (Prefix|Suffix)( Modifier)?$/i;

/** "{ Prefix Modifier "Hale" (Tier: 8) — Life }" → side/name/kind. */
export function parseHeader(line: string): HeaderInfo | null {
  const m = /^\{\s*(.*?)\s*\}$/.exec(line);
  if (!m) return null;
  const body = m[1]!;
  const side: AffixSide | null = /\bprefix\b/i.test(body) ? "prefix" : /\bsuffix\b/i.test(body) ? "suffix" : null;
  const kind: AffixKind | null = /\bdesecrated\b/i.test(body)
    ? "desecrated"
    : /\bfractured\b/i.test(body)
      ? "fractured"
      : /\bcrafted\b/i.test(body)
        ? "crafted"
        : null;
  return {
    side,
    name: /"([^"]+)"/.exec(body)?.[1] ?? null,
    kind,
    skip: side == null && /\b(implicit|enchant|rune|unique|corrupted)\b/i.test(body),
  };
}

/** Explicit-bucket lines split at advanced-copy headers; property/description lines set aside. */
export function groupLines(parsed: ParsedItem, ignored: string[]): LineGroup[] {
  const groups: LineGroup[] = [{ header: null, lines: [] }];
  for (const m of parsed.mods) {
    const header = parseHeader(m.raw);
    if (header) {
      groups.push({ header, lines: [] });
      continue;
    }
    if (!AFFIX_MARKERS.has(m.marker)) continue;
    const text = cleanItemLine(m.raw);
    if (PROPERTY_LINE.test(text) || DESCRIPTION_LINE.test(text)) {
      ignored.push(text);
      continue;
    }
    groups[groups.length - 1]!.lines.push({ text, kind: m.marker as AffixKind });
  }
  return groups.filter((g) => g.lines.length > 0 && !g.header?.skip);
}

function domainFits(kind: AffixKind, h: TemplateHit): boolean {
  if (kind === "desecrated") return h.mod.domain === "desecrated";
  if (kind === "crafted") return h.mod.domain === "item";
  return h.mod.domain === "item" && !h.mod.craftedOnly;
}

function tierOf(combo: CatalogCombo, side: AffixSide | null, family: string, modId: string | null, desecrated: boolean) {
  if (modId == null) return null;
  const pools = desecrated ? [combo.desecrated] : side ? [combo[side]] : [combo.prefix, combo.suffix];
  for (const pool of pools) {
    const tiers = pool[family];
    if (!tiers || !(modId in tiers)) continue;
    const ordered = Object.entries(tiers).sort((a, b) => a[1] - b[1]).map(([id]) => id);
    return { rank: ordered.indexOf(modId) + 1, of: ordered.length };
  }
  return null;
}

export interface MatchContext {
  pool: MatchPool;
  combo: CatalogCombo;
  ilvl: number | null;
  state: ItemState;
}

function unrevealedAffix(line: Line, header: HeaderInfo | null): Affix {
  const side = header?.side ?? (/\bprefix\b/i.test(line.text) ? "prefix" : /\bsuffix\b/i.test(line.text) ? "suffix" : null);
  return { lines: [line.text], kind: "desecrated", side, family: null, modId: null, level: null, tier: null, unrevealed: true, note: null };
}

/** Match the lines at `at`; returns the affix (or null = unmatched line) and how many lines it used. */
function matchOne(ctx: MatchContext, lines: Line[], at: number, header: HeaderInfo | null): { affix: Affix | null; used: number } {
  const line = lines[at]!;
  const kind = header?.kind ?? line.kind;
  if (UNREVEALED.test(line.text)) return { affix: unrevealedAffix(line, header), used: 1 };
  const texts = lines.map((l) => l.text);
  let hits = matchAt(ctx.pool, texts, at);
  if (header?.side) hits = hits.filter((h) => h.mod.side === header.side);
  // the header's affix name pins the exact tier — but only when that tier's range holds the value
  // (quality/catalyst boosts print values above the named tier's range)
  if (header?.name) {
    const named = hits.filter((h) => h.mod.name === header.name && h.inRange);
    if (named.length > 0) hits = named;
  }
  const preferred = hits.filter((h) => domainFits(kind, h));
  const res = resolveHits(preferred.length > 0 ? preferred : hits, ctx.ilvl);
  if (!res) return { affix: null, used: 1 };
  if (res.lineCount > 1 && header == null && splitsIntoSingles(ctx, texts, at, res.lineCount)) {
    ctx.state.flags.push({
      code: "ambiguous-split",
      message: `"${texts.slice(at, at + res.lineCount).join(" / ")}" reads as one hybrid mod or as separate mods — paste with Ctrl+Alt+C for exact affix headers`,
    });
  }
  const chosen = hits.find((h) => h.modId === res.modId);
  // a mod only a crafted source writes (essence, liquid emotion) IS the crafted mod, tagged or not
  const craftedOnly = chosen != null ? chosen.mod.craftedOnly : hits.every((h) => h.mod.craftedOnly);
  const desecrated = kind === "desecrated" || chosen?.mod.domain === "desecrated" || (res.modId == null && hits.every((h) => h.mod.domain === "desecrated"));
  const affix: Affix = {
    lines: texts.slice(at, at + res.lineCount),
    kind: desecrated ? "desecrated" : craftedOnly ? "crafted" : kind,
    side: header?.side ?? res.side,
    family: res.family,
    modId: res.modId,
    level: res.level,
    tier: tierOf(ctx.combo, res.side, res.family, res.modId, desecrated),
    unrevealed: false,
    note: res.outOfRange ? "value outside every tier range (quality / catalyst boost or a merged line)" : res.familyAmbiguous ? "text fits more than one mod family" : null,
  };
  return { affix, used: res.lineCount };
}

/** A hybrid match is ambiguous when each of its lines also stands alone as a single-line mod. */
function splitsIntoSingles(ctx: MatchContext, texts: string[], at: number, count: number): boolean {
  for (let k = 0; k < count; k++) {
    if (!matchAt(ctx.pool, texts, at + k).some((h) => h.lineCount === 1)) return false;
  }
  return true;
}

function uncataloguedAffix(lines: string[], kind: AffixKind, side: AffixSide | null, note: string): Affix {
  return { lines, kind, side, family: null, modId: null, level: null, tier: null, unrevealed: false, note };
}

/** One Ctrl+Alt+C header = exactly one affix, whatever its lines matched. */
function matchHeaderGroup(ctx: MatchContext, lines: Line[], header: HeaderInfo): void {
  const texts = lines.map((l) => l.text);
  const { affix } = matchOne(ctx, lines, 0, header);
  if (affix) {
    ctx.state.affixes.push({ ...affix, lines: texts });
    return;
  }
  const kind = header.kind ?? lines[0]!.kind;
  if (header.side == null && kind === "explicit") {
    ctx.state.unmatched.push(texts.join(" / "));
    return;
  }
  const note = header.side ? "text not in the catalog — side taken from the Ctrl+Alt+C header" : "text not in the catalog";
  ctx.state.affixes.push(uncataloguedAffix(texts, kind, header.side, note));
}

export function matchGroup(ctx: MatchContext, group: LineGroup): void {
  const { lines, header } = group;
  if (header) {
    matchHeaderGroup(ctx, lines, header);
    return;
  }
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const { affix, used } = matchOne(ctx, lines, i, null);
    if (affix) ctx.state.affixes.push(affix);
    // a crafted/fractured/desecrated tag still fills that slot even when the text is unknown —
    // dropping it would let a bone through on an item that already carries a desecrated mod
    else if (line.kind === "explicit") ctx.state.unmatched.push(line.text);
    else ctx.state.affixes.push(uncataloguedAffix([line.text], line.kind, null, `${line.kind} line not in the catalog`));
    i += used;
  }
}
