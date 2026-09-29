/*
 * Collision namespace for the pool tabs: every line a stash of that item kind can show — each
 * pool mod (all tiers), the header lines, base names, collision-only foreign lines and the generic
 * item boilerplate. Same Namespace shape (and trigram index) as the price regex, so fragment.ts's
 * unsafeMatches works unchanged; `lines` adds the per-line view anchored (^/$) and numeric checks
 * need. Header, base and boilerplate entries are never in an "allowed" set for mod tokens: they
 * sit on every item, so a fragment touching them would light up the whole stash.
 */
import { ITEM_TEXT_BOILERPLATE, indexTrigrams, normalizeText, type NameEntry, type Namespace } from "./namespace";
import type { PoolHeader } from "./pools/headers";
import type { RegexPool, VendorData } from "./pools/schema";
import { segmentsOf } from "./pools/template";

export interface NsLine {
  /** Key of the entry that owns the line. */
  owner: string;
  /** Display template, numbers as "#". */
  template: string;
  /** Lowercased, whitespace-collapsed text between numbers (template.ts segments, normalized). */
  segments: string[];
}

export interface PoolNamespace extends Namespace {
  lines: readonly NsLine[];
  linesByOwner: ReadonlyMap<string, readonly NsLine[]>;
}

export const modKey = (id: string): string => `mod:${id}`;
export const headerKey = (id: string): string => `hdr:${id}`;
export const baseKey = (name: string): string => `base:${normalizeText(name)}`;
export const lineKey = (template: string): string => `line:${template}`;

/** Segment normalization matching the haystack: lowercased, runs of whitespace → one space, trimmed. */
export const normalizedSegments = (template: string): string[] => segmentsOf(template).map(normalizeText);

interface Source {
  key: string;
  name: string;
  templates: readonly string[];
}

function toEntry(src: Source): NameEntry {
  const haystack = src.templates
    .flatMap(normalizedSegments)
    .filter((s) => s.length > 0)
    .join("\n");
  return { key: src.key, name: src.name, kind: "stat", valueDiv: null, haystack };
}

function assemble(sources: readonly Source[]): PoolNamespace {
  const byKey = new Map<string, NameEntry>();
  const lines: NsLine[] = [];
  const linesByOwner = new Map<string, NsLine[]>();
  for (const src of sources) {
    if (byKey.has(src.key)) throw new Error(`duplicate namespace key ${src.key}`);
    byKey.set(src.key, toEntry(src));
    const own = src.templates.map((template) => ({ owner: src.key, template, segments: normalizedSegments(template) }));
    lines.push(...own);
    linesByOwner.set(src.key, own);
  }
  const entries = [...byKey.values()];
  return { entries, byKey, trigrams: indexTrigrams(entries), lines, linesByOwner };
}

const headerSources = (headers: readonly PoolHeader[]): Source[] =>
  headers.map((h) => ({ key: headerKey(h.id), name: h.template, templates: [h.template] }));

/*
 * Generic boilerplate minus the lines a header already spells out ("Corrupted", "Item Level" in
 * "Item Level: #"): the same tooltip line must not be two entries, or a header token would count
 * its own line as a collision.
 */
function boilerplateSources(headers: readonly PoolHeader[]): Source[] {
  const headerText = headers.map((h) => normalizeText(h.template));
  return ITEM_TEXT_BOILERPLATE.flatMap((text, i) =>
    headerText.some((h) => h.includes(normalizeText(text))) ? [] : [{ key: `boiler:${i}`, name: text, templates: [text] }],
  );
}

/** Namespace for one pool tab: its mods plus everything else an item of that tab prints. */
export function buildPoolNamespace(pool: RegexPool, headers: readonly PoolHeader[]): PoolNamespace {
  const mods = pool.mods.map((m) => ({ key: modKey(m.id), name: m.lines[0]?.template ?? m.id, templates: m.lines.map((l) => l.template) }));
  const bases = pool.bases.map((b) => ({ key: baseKey(b), name: b, templates: [b] }));
  const foreign = pool.foreignLines.map((t, i) => ({ key: `foreign:${i}`, name: t, templates: [t] }));
  return assemble([...mods, ...headerSources(headers), ...bases, ...foreign, ...boilerplateSources(headers)]);
}

/** Namespace for vendor screens: every equipment line, base and class name, plus vendor headers. */
export function buildVendorNamespace(vendor: VendorData, headers: readonly PoolHeader[]): PoolNamespace {
  const lines = vendor.lines.map((t) => ({ key: lineKey(t), name: t, templates: [t] }));
  const bases = vendor.bases.map((b) => ({ key: baseKey(b), name: b, templates: [b] }));
  const classes = vendor.classes.map((c) => ({ key: `class:${normalizeText(c)}`, name: c, templates: [`Item Class: ${c}`] }));
  return assemble([...lines, ...headerSources(headers), ...bases, ...classes, ...boilerplateSources(headers)]);
}

const memo = new WeakMap<object, PoolNamespace>();

/** One namespace per loaded dataset object; the trigram index is the expensive part. */
export function memoPoolNamespace(data: RegexPool | VendorData, build: () => PoolNamespace): PoolNamespace {
  const hit = memo.get(data);
  if (hit) return hit;
  const ns = build();
  memo.set(data, ns);
  return ns;
}
