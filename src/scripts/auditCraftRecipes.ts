/*
 * `npm run craft:audit-recipes` — writes src/data/poe2/craft/recipe-audit.json: per-recipe step
 * legality plus the game-text digests each recipe was verified against, stamped with the RePoE
 * artifact sha and game-data patch. Re-run after every `npm run sync:poe2-data` + `sync:entities`
 * and after editing recipe data; test:craft-provenance fails until the committed file is current.
 *
 *   --rebaseline key1,key2   accept the current game text for those recipes (after re-verifying
 *                            them on a same-patch RePoE refresh, where bumping patchVerified can't)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { RECIPES } from "../core/craftRecipes";
import { provenanceFor } from "../core/craftProvenanceData";
import { buildAuditFile, currentAuditDeps, parseAuditFile, RECIPE_AUDIT_PATH } from "../core/craftProvenance/audit";

function rebaselineKeys(argv: readonly string[]): Set<string> {
  const at = argv.indexOf("--rebaseline");
  if (at === -1) return new Set();
  const value = argv[at + 1];
  if (!value) throw new Error("--rebaseline needs a comma-separated list of recipe keys");
  const keys = new Set(value.split(",").map((k) => k.trim()).filter(Boolean));
  const unknown = [...keys].filter((k) => !RECIPES.some((r) => r.key === k));
  if (unknown.length > 0) throw new Error(`--rebaseline: unknown recipe key(s) ${unknown.join(", ")}`);
  return keys;
}

function main(): void {
  const deps = currentAuditDeps();
  const prev = existsSync(RECIPE_AUDIT_PATH) ? parseAuditFile(readFileSync(RECIPE_AUDIT_PATH, "utf8"), RECIPE_AUDIT_PATH) : null;
  const file = buildAuditFile(RECIPES, provenanceFor, deps, prev, rebaselineKeys(process.argv.slice(2)));
  mkdirSync(dirname(RECIPE_AUDIT_PATH), { recursive: true });
  writeFileSync(RECIPE_AUDIT_PATH, `${JSON.stringify(file, null, 2)}\n`);

  const rows = Object.entries(file.recipes);
  const count = (v: string) => rows.filter(([, r]) => r.verdict === v).length;
  console.log(
    `[craft-audit] wrote ${RECIPE_AUDIT_PATH} — ${rows.length} recipes (${count("ok")} ok, ${count("unknown")} unknown, ${count("violation")} violation), ` +
      `data ${file.game_data_patch} / RePoE ${file.repoe_version}`,
  );
  for (const [key, r] of rows) {
    if (r.repoeChanged.length > 0) console.log(`  STALE ${key}: game text changed for ${r.repoeChanged.join(", ")}`);
    for (const s of r.steps.filter((x) => x.verdict === "violation")) {
      console.log(`  VIOLATION ${key} step ${s.idx}: ${s.checks.filter((c) => c.verdict === "violation").map((c) => c.detail).join(" · ")}`);
    }
  }
}

main();
