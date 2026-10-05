/*
 * npm run research:validate [-- --legality]
 * Parses every craft-mining file (docs/research/craft-mining/**, src/data/poe2/craft/routes and
 * priors) with its schema and the cross-file checks, and exits non-zero on the first defect.
 * --legality will project each route skeleton through the craftmoves rules; skeleton phases are
 * macro methods without concrete item states yet, so P0 refuses the flag instead of passing.
 */
import { CRAFT_MINING_DIR, PRIORS_DIR, readCraftMining, ROUTES_DIR } from "../core/research/craftMining/load";

const KNOWN_FLAGS = new Set(["--legality"]);

function main(argv: readonly string[]): number {
  const unknown = argv.filter((a) => !KNOWN_FLAGS.has(a));
  if (unknown.length > 0) {
    console.error(`research:validate: unknown argument(s) ${unknown.join(" ")} (known: ${[...KNOWN_FLAGS].join(", ")})`);
    return 2;
  }
  if (argv.includes("--legality")) {
    console.error("research:validate --legality is not implemented in P0: route skeletons name planner macro methods, not item states, so they cannot be projected through craftmoves evaluateRules yet (planned with the guided search, research-pipeline-plan P3).");
    return 2;
  }
  const mining = readCraftMining({ research: CRAFT_MINING_DIR, routes: ROUTES_DIR, priors: PRIORS_DIR });
  const extractions = mining.archetypes.reduce((n, a) => n + a.extractions.length, 0);
  const templates = mining.routes.reduce((n, r) => n + r.templates.length, 0);
  const priors = mining.priors.reduce((n, p) => n + p.entries.length, 0);
  console.log(
    `PASS  research:validate: ${mining.archetypes.length} archetype(s) [${mining.archetypes.map((a) => a.archetype.id).join(", ")}], ` +
      `${extractions} extraction(s), ${templates} route template(s), ${priors} prior(s)`,
  );
  return 0;
}

process.exitCode = main(process.argv.slice(2));
