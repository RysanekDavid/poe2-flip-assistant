/* League name → header emblem. Pins the parallel-variant parsing (HC/SSF reuse the parent emblem
 * with a badge) and that leagues without art fall back to none. Run: npm run test:league */
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { LEAGUE_EMBLEM_IDS, leagueEmblemFor } from "../lib/leagueEmblem";

assert.deepEqual(leagueEmblemFor("Runes of Aldur"), { id: "runes-of-aldur", badge: null });
assert.deepEqual(leagueEmblemFor("Forbidden Rites"), { id: "forbidden-rites", badge: null });
assert.deepEqual(leagueEmblemFor("  forbidden   RITES "), { id: "forbidden-rites", badge: null }, "case and spacing tolerant");

assert.deepEqual(leagueEmblemFor("HC Forbidden Rites"), { id: "forbidden-rites", badge: "HC" });
assert.deepEqual(leagueEmblemFor("SSF Runes of Aldur"), { id: "runes-of-aldur", badge: "SSF" });
assert.deepEqual(leagueEmblemFor("HC SSF Runes of Aldur"), { id: "runes-of-aldur", badge: "HC SSF" });
assert.deepEqual(leagueEmblemFor("SSF HC Runes of Aldur"), { id: "runes-of-aldur", badge: "HC SSF" }, "badge order is fixed");

for (const none of ["Standard", "Hardcore", "SSF Standard", "HC", "Dawn of the Hunt", "Ruthless Runes of Aldur", ""]) {
  assert.equal(leagueEmblemFor(none), null, `"${none}" has no emblem`);
}

// Every id the mapping can return must have its PNG, or the header import breaks the build.
for (const id of LEAGUE_EMBLEM_IDS) {
  assert.ok(existsSync(join(process.cwd(), "src/assets/leagues", `${id}.png`)), `missing emblem art for ${id}`);
}

console.log("ALL PASS — league emblems map by name, variants badge, unknown leagues fall back");
