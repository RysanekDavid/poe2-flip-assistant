/* npm run craft:check-stats — resolve every recipe leg's stat texts against the LIVE trade2 stat
 * catalog (read-only data endpoint, no POESESSID) and print what each resolved to. A renamed or
 * mistyped stat silently widens a search into "any rare"; this lists every unresolved text with
 * the closest catalog candidates so the recipe data can be corrected. Exits 1 on any miss. */
import "../config/env";
import { fetchTradeMeta, type StatOption } from "../api/tradeMeta";
import { buildStatIndex } from "../core/statResolver";
import { legToQuery } from "../core/craftLegPricing";
import { RECIPES, type RecipeLegSpec } from "../core/craftRecipes";

const words = (t: string): string[] =>
  t.toLowerCase().replace(/[^a-z ]/g, " ").split(/\s+/).filter((w) => w.length >= 4);

/** Catalog entries sharing the most words with `text` — hints for fixing an unresolved spec. */
function candidates(text: string, catalog: readonly StatOption[]): string[] {
  const want = new Set(words(text));
  return catalog
    .map((s) => ({ s, score: words(s.text).filter((w) => want.has(w)).length }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.s.text.length - b.s.text.length)
    .slice(0, 6)
    .map((x) => `${x.s.group}: "${x.s.text}" (${x.s.id})`);
}

function checkLeg(key: string, side: string, leg: RecipeLegSpec, catalog: readonly StatOption[]): number {
  const idx = buildStatIndex([...catalog]);
  const { query, unresolved } = legToQuery(leg, idx);
  const byId = new Map(catalog.map((s) => [s.id, s]));
  for (const [i, f] of (query.stats ?? []).entries()) {
    const s = byId.get(f.id);
    console.log(`  ok   ${key}.${side}[${i}] ${s?.group}: "${s?.text}" ${f.min != null ? `≥${f.min}` : "(presence)"} → ${f.id}`);
  }
  for (const u of unresolved) {
    console.log(`  MISS ${key}.${side}: "${u}"`);
    for (const c of candidates(u.replace(/ \[.*\]$/, ""), catalog)) console.log(`         ? ${c}`);
  }
  return unresolved.length;
}

async function main(): Promise<void> {
  const { stats, flaggedStats } = await fetchTradeMeta();
  const catalog = [...stats, ...flaggedStats];
  const groups = [...new Set(catalog.map((s) => s.group))].join(", ");
  console.log(`trade2 catalog: ${catalog.length} stats in groups: ${groups}`);
  let misses = 0;
  for (const r of RECIPES) {
    console.log(`${r.key}`);
    misses += checkLeg(r.key, "base", r.base, catalog);
    misses += checkLeg(r.key, "result", r.result, catalog);
  }
  console.log(misses === 0 ? "\nALL RESOLVED" : `\n${misses} UNRESOLVED`);
  process.exit(misses === 0 ? 0 : 1);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
