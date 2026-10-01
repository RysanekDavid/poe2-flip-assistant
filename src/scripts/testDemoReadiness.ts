import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { RECIPES } from "../core/craftRecipes";

const source = (...segments: string[]): string =>
  readFileSync(join(process.cwd(), ...segments), "utf8");

// The estimated-row caveat lives once, in the Top Flips legend behind the Flips page header.
const discover = source("src", "components", "DiscoverColumns.tsx");
const strategies = source("src", "components", "farm", "strategies", "StrategiesTool.tsx");
const bosses = source("src", "components", "farm", "BossesTool.tsx");
const craft = source("src", "components", "CraftTopPicks.tsx");
const comparable = source("src", "components", "craft", "MarginBreakdown.tsx");
const coach = source("src", "components", "coach", "CoachMessage.tsx");
const composer = source("src", "components", "coach", "CoachComposer.tsx");

assert.match(discover, /heuristic estimate, not executable/);
// Farm never shows a Div/hour: the strategy trend is a price move, and bosses say why none is shown.
assert.match(strategies, /a price move, not profit per hour/);
assert.match(bosses, /No Div\/hour/);
assert.match(craft, /modelled EV · curated hit rates · instant-buyout asks, not sales/);
assert.match(comparable, /asks, not sales/);
// Exactly one verify-in-game notice: the composer footer, never repeated per message.
assert.match(composer, /Read-only guidance · verify prices and item state in-game before acting/);
assert.doesNotMatch(coach, /verify prices/i);
assert.match(coach, /No external tools or sources were used for this response/);

const recipe = RECIPES.find((candidate) => candidate.key === "boots_putrefaction");
assert.ok(recipe, "Demo recipe boots_putrefaction must exist");
assert.equal(recipe.label, "Boots · putrefaction ES (caster)");
assert.ok(recipe.materials.length > 0, "Demo recipe needs itemized materials");
assert.ok(recipe.guide.phases.length >= 2, "Demo recipe needs a multi-phase guide");
assert.ok(recipe.guide.marketCheck.length > 0, "Demo recipe needs a go/no-go market check");
assert.ok(recipe.hitRate > 0 && recipe.hitRate <= 1, "Demo recipe hit rate must be bounded");

console.log("ALL PASS — Demo labels, evidence boundary, and selected Craft recipe");
