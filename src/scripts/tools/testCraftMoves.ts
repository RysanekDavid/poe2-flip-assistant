/* Craft moves scaffold: the sub-tool is registered, its lazy panel exists, and the stored-selection
 * schema accepts it while rejecting ids that are not tools. Run: npm run test:tools:craft-moves */
import assert from "node:assert/strict";
import { toolIdSchema } from "../../components/tools/toolRegistry";
import { assertToolPanel } from "./toolsTestKit";

assertToolPanel("craft-moves", "CraftMovesTool");
assert.equal(toolIdSchema.parse("craft-moves"), "craft-moves");
// a stale localStorage value (e.g. a tab id, or a renamed tool) must not select a missing panel
for (const bad of ["hunt", "craftmoves", "", "CRAFT-MOVES"]) {
  assert.equal(toolIdSchema.safeParse(bad).success, false, `"${bad}" must not parse as a tool id`);
}
console.log("ALL PASS — craft-moves registered, panel wiring, stored-selection validation");
