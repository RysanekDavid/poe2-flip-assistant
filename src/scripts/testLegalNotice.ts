/* The GGG third-party disclaimer is a condition of the developer terms, not decoration: it must stay
 * verbatim, in the root layout (so every page, /login included, renders it) and inside a footer that
 * is not hidden. Run: npm run test:deploy-config */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const NOTICE = "This product isn't affiliated with or endorsed by Grinding Gear Games in any way.";

const layout = readFileSync(join(process.cwd(), "src/app/layout.tsx"), "utf8");
assert.ok(layout.includes(NOTICE), "root layout must contain the GGG notice verbatim (straight apostrophe)");

const footer = /<footer className="([^"]*)">([\s\S]*?)<\/footer>/.exec(layout);
assert.ok(footer, "the notice must be rendered inside a <footer> in the root layout");
const [, classes = "", body = ""] = footer;
assert.ok(body.includes(NOTICE), "the notice must be the footer's content");
for (const hiding of ["hidden", "sr-only", "invisible", "opacity-0"]) {
  assert.ok(!classes.split(/\s+/).includes(hiding), `the notice footer must not be hidden (found "${hiding}")`);
}
assert.match(layout, /<LegalFooter \/>/, "the root layout must render the footer");

console.log("ALL PASS — GGG notice is verbatim and visible in the root layout");
