import type { ResolvedStat, StatIndex } from "./statResolver";

/**
 * Pseudo-mod grouping (ported from Exiled Exchange 2's PSEUDO_RULES). The trade site sums
 * several real mods into one synthetic "total" stat — e.g. +Fire Res, +All-Ele Res and a
 * dual-res mod all feed `#% total Elemental Resistance`, weighted by how many elements each
 * source covers. Searching the pseudo total (instead of each explicit) is what makes a
 * comparable search return results on a full rare: the explicits are too specific, the
 * pseudo totals are what buyers actually filter on.
 *
 * We resolve the pseudo's trade id from the SAME catalog (by its template text) rather than
 * hardcoding `pseudo.stat_XXXX` — PoE2 ids aren't stable across our knowledge, the catalog is.
 */
interface PseudoRule {
  pseudoText: string; // catalog template of the pseudo total
  required?: RegExp; // pseudo only forms if a source matching this is present
  sources: Array<{ match: RegExp; mult: number }>; // ref patterns + element-count weight
}

const PSEUDO_RULES: PseudoRule[] = [
  {
    pseudoText: "#% total Elemental Resistance",
    sources: [
      { match: /to all elemental resistances$/, mult: 3 },
      { match: /to fire and cold resistances?$/, mult: 2 },
      { match: /to fire and lightning resistances?$/, mult: 2 },
      { match: /to cold and lightning resistances?$/, mult: 2 },
      { match: /^[+\-#%\s\d]*to fire resistance$/, mult: 1 },
      { match: /^[+\-#%\s\d]*to cold resistance$/, mult: 1 },
      { match: /^[+\-#%\s\d]*to lightning resistance$/, mult: 1 },
    ],
  },
  {
    pseudoText: "+# total maximum Life",
    required: /to maximum life$/,
    sources: [{ match: /to maximum life$/, mult: 1 }],
  },
  {
    pseudoText: "+# total to all Attributes",
    sources: [
      { match: /to all attributes$/, mult: 3 },
      { match: /to strength$/, mult: 1 },
      { match: /to dexterity$/, mult: 1 },
      { match: /to intelligence$/, mult: 1 },
    ],
  },
  {
    pseudoText: "+#% total maximum Elemental Resistance",
    sources: [{ match: /to maximum (fire|cold|lightning) resistance$/, mult: 1 }],
  },
];

const norm = (s: string): string => s.toLowerCase().replace(/\+/g, "").replace(/\s+/g, " ").trim();

const ALL_SOURCE_PATTERNS = PSEUDO_RULES.flatMap((r) => r.sources.map((s) => s.match));

/**
 * True if a mod's ref is a component a pseudo-total already absorbs (a single resistance, a
 * life roll, an attribute). A comparable search keeps the pseudo TOTAL and drops these generic
 * components — they don't make a rare expensive and only over-narrow the search. Distinctive
 * mods (skill levels, spell/attack damage, crit, speed, spirit) are NOT sources → kept.
 */
export function isPseudoSource(ref: string): boolean {
  return ALL_SOURCE_PATTERNS.some((re) => re.test(ref));
}

/** Derive pseudo-total stats from the resolved explicit/implicit mods. */
export function applyPseudos(resolved: ResolvedStat[], idx: StatIndex): ResolvedStat[] {
  const out: ResolvedStat[] = [];
  for (const rule of PSEUDO_RULES) {
    if (rule.required && !resolved.some((r) => rule.required!.test(r.ref))) continue;

    let total = 0;
    let hit = false;
    for (const r of resolved) {
      const src = rule.sources.find((s) => s.match.test(r.ref));
      if (src) {
        total += r.value * src.mult;
        hit = true;
      }
    }
    if (!hit || total <= 0) continue;

    const key = norm(rule.pseudoText);
    const cat = idx.byText.get(key)?.find((s) => s.group === "pseudo");
    if (!cat) continue; // catalog has no such pseudo id for this league — can't search it

    out.push({ id: cat.id, group: "pseudo", text: cat.text, ref: key, value: Math.round(total) });
  }
  return out;
}
