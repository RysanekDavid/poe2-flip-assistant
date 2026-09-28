import type { AffixSide, CatalogCombo, CatalogMod, CraftCatalog } from "./catalog";

/**
 * Match pasted mod lines against catalog templates. A template "+(10-19) to maximum Life" becomes a
 * regex with one capture per range; a line matches a tier only when every captured value sits in
 * that tier's range. Multi-line mods (hybrids) match consecutive lines.
 */

const NUM = String.raw`(-?\d+(?:\.\d+)?)`;
const RANGE = /\((-?\d+(?:\.\d+)?)-(-?\d+(?:\.\d+)?)\)/g;

interface TemplateLine {
  re: RegExp;
  ranges: Array<[number, number]>;
}

interface CompiledMod {
  modId: string;
  mod: CatalogMod;
  lines: TemplateLine[];
}

/** Shape key both sides reduce to: every number → "#", leading "+" dropped, lower-case. */
export function shapeOf(line: string): string {
  return line
    .replace(RANGE, "#")
    .replace(/-?\d+(?:\.\d+)?/g, "#")
    .replace(/\+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Advanced-copy values "+19(10-19) to …" → "+19 to …"; whitespace collapsed. */
export function cleanItemLine(line: string): string {
  return line
    .replace(/(-?\d+(?:\.\d+)?)\((-?\d+(?:\.\d+)?)[-–—](-?\d+(?:\.\d+)?)\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/*
 * Time-Lost (radius) jewels print every mod as "Notable|Small Passive Skills in Radius also grant
 * <mod>", while RePoE stores only <mod> — and which wrapper a mod gets is not derivable from its
 * stat ids. So matching compares the inner form; the displayed line keeps the wrapper.
 */
const RADIUS_WRAPPER = /^(?:Notable|Small) Passive Skills in Radius also grant /i;

/** The form a pasted line is matched in: the radius-jewel wrapper removed. */
export const matchForm = (line: string): string => line.replace(RADIUS_WRAPPER, "");

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function compileLine(line: string): TemplateLine {
  const ranges: Array<[number, number]> = [];
  let pattern = "";
  let last = 0;
  for (const m of line.matchAll(RANGE)) {
    pattern += escapeRe(line.slice(last, m.index));
    pattern += NUM;
    const lo = Number(m[1]);
    const hi = Number(m[2]);
    ranges.push([Math.min(lo, hi), Math.max(lo, hi)]);
    last = (m.index ?? 0) + m[0].length;
  }
  pattern += escapeRe(line.slice(last));
  // the game prints "+7" where a template may carry no sign (and vice versa)
  const body = pattern.replace(/^\\\+/, "");
  return { re: new RegExp(`^\\+?${body}$`, "i"), ranges };
}

const compiled = new Map<string, CompiledMod>();

function compile(cat: CraftCatalog, modId: string): CompiledMod {
  const hit = compiled.get(modId);
  if (hit && hit.mod === cat.mods[modId]) return hit;
  const mod = cat.mods[modId];
  if (!mod) throw new Error(`craft catalog pool references unknown mod ${modId}`);
  const out: CompiledMod = { modId, mod, lines: mod.text.split("\n").map(compileLine) };
  compiled.set(modId, out);
  return out;
}

/** How a candidate relates to the pasted lines: exact tier fit, or the family's text with an out-of-range value. */
export interface TemplateHit {
  modId: string;
  mod: CatalogMod;
  lineCount: number;
  inRange: boolean;
}

function tryMatch(c: CompiledMod, lines: readonly string[], at: number): TemplateHit | null {
  if (at + c.lines.length > lines.length) return null;
  let inRange = true;
  for (let k = 0; k < c.lines.length; k++) {
    const tl = c.lines[k]!;
    const m = tl.re.exec(lines[at + k]!);
    if (!m) return null;
    tl.ranges.forEach(([lo, hi], i) => {
      const v = Number(m[i + 1]);
      // an all-negative range can print as its magnitude ("(-20--10)% …" shown as "15% reduced …")
      const fits = (v >= lo && v <= hi) || (hi < 0 && -v >= -hi && -v <= -lo);
      if (!fits) inRange = false;
    });
  }
  return { modId: c.modId, mod: c.mod, lineCount: c.lines.length, inRange };
}

/** Candidate pools a line may come from, keyed by the first template line's shape. */
export interface MatchPool {
  byShape: Map<string, string[]>;
  cat: CraftCatalog;
}

function addFamilies(ids: Set<string>, pool: CatalogCombo["prefix"]): void {
  for (const tiers of Object.values(pool)) for (const id of Object.keys(tiers)) ids.add(id);
}

/** Pool for one base combo: its prefix/suffix/desecrated tiers, plus (optionally) every crafted-only mod. */
export function buildPool(cat: CraftCatalog, combo: CatalogCombo, withCraftedOnly: boolean): MatchPool {
  const ids = new Set<string>();
  addFamilies(ids, combo.prefix);
  addFamilies(ids, combo.suffix);
  addFamilies(ids, combo.desecrated);
  if (withCraftedOnly) for (const [id, m] of Object.entries(cat.mods)) if (m.craftedOnly) ids.add(id);
  const byShape = new Map<string, string[]>();
  for (const id of ids) {
    const first = cat.mods[id]?.text.split("\n")[0];
    if (first == null) throw new Error(`craft catalog pool references unknown mod ${id}`);
    const key = shapeOf(first);
    const arr = byShape.get(key);
    if (arr) arr.push(id);
    else byShape.set(key, [id]);
  }
  return { byShape, cat };
}

/** Every template (any tier/family in the pool) that matches the lines starting at `at`. */
export function matchAt(pool: MatchPool, lines: readonly string[], at: number): TemplateHit[] {
  const forms = lines.map(matchForm);
  const ids = pool.byShape.get(shapeOf(forms[at]!)) ?? [];
  const hits: TemplateHit[] = [];
  for (const id of ids) {
    const hit = tryMatch(compile(pool.cat, id), forms, at);
    if (hit) hits.push(hit);
  }
  return hits;
}

/** A resolved affix: the family/side it belongs to and, when the values fit one, its tier. */
export interface FamilyResolution {
  family: string;
  side: AffixSide | null; // null = the text fits families on both sides
  modId: string | null; // the tier whose range holds every value; null when none does
  level: number | null;
  lineCount: number;
  familyAmbiguous: boolean;
  outOfRange: boolean;
}

/** Collapse template hits of one line group into a family/side/tier answer. */
export function resolveHits(hits: readonly TemplateHit[], ilvl: number | null): FamilyResolution | null {
  if (hits.length === 0) return null;
  const lineCount = Math.max(...hits.map((h) => h.lineCount));
  const longest = hits.filter((h) => h.lineCount === lineCount);
  const families = new Set(longest.map((h) => h.mod.family));
  const sides = new Set(longest.map((h) => h.mod.side));
  const fitting = longest.filter((h) => h.inRange);
  // an item cannot carry a tier above its item level, so prefer the highest reachable fitting tier
  const reachable = fitting.filter((h) => ilvl == null || h.mod.level <= ilvl);
  const pickFrom = reachable.length > 0 ? reachable : fitting;
  const best = pickFrom.sort((a, b) => b.mod.level - a.mod.level)[0] ?? null;
  const family = best?.mod.family ?? longest[0]!.mod.family;
  return {
    family,
    side: sides.size === 1 ? [...sides][0]! : null,
    modId: best?.modId ?? null,
    level: best?.mod.level ?? null,
    lineCount,
    familyAmbiguous: families.size > 1,
    outOfRange: best == null,
  };
}
