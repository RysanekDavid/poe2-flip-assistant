/* Boss EV scaffold: the sub-tool is registered with its lazy panel, and the registry lists every
 * tool exactly once in TOOL_IDS order with a distinct module. Run: npm run test:tools:boss-ev */
import assert from "node:assert/strict";
import { TOOL_IDS, TOOLS } from "../../components/tools/toolRegistry";
import { assertToolPanel } from "./toolsTestKit";

assertToolPanel("boss-ev", "BossEvTool");
assert.deepEqual(TOOLS.map((t) => t.id), [...TOOL_IDS], "sub-nav order must match TOOL_IDS, each id once");
assert.equal(new Set(TOOLS.map((t) => t.module)).size, TOOLS.length, "each tool has its own panel module");
assert.equal(new Set(TOOLS.map((t) => t.label)).size, TOOLS.length, "sub-nav labels must be distinct");
console.log("ALL PASS — boss-ev registered, panel wiring, registry order and uniqueness");
