/* Pins the KB §2 (Fracturing Orb) wording the planner's fracture, blocker and self-fracture rest on,
 * and checks the creator quote against its transcript — like KB6_FACTS for the liquid rules. A KB
 * edit that changes one of these facts fails here, so the planner is re-read instead of silently
 * drifting. Imported by testCraftPlanner.ts. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { KB } from "../../core/tools/craftmoves/ruleTypes";

/** Verbatim §2 fragments (whitespace-normalised) behind each planner fracture behaviour. */
export const KB2_FACTS: ReadonlyArray<{ rule: string; text: string }> = [
  { rule: "fracture requirements", text: "Fracture a random modifier on a rare item with at least 4 modifiers" },
  { rule: "uniform pick (assumption)", text: "A uniform pick among the eligible (non-desecrated) mods is the standard community assumption, never tested [unverified]" },
  { rule: "one fracture", text: "**One fracture per item, ever.**" },
  { rule: "crafted fracturable", text: "**Crafted mods can be fractured** [single-source" },
  { rule: "blocker counts", text: "**Desecrated mods can't be fractured but DO count toward the 4-mod minimum**" },
  { rule: "self-fracture source", text: "Alohaa, docs/kb/sources/transcripts/32 (kPBToE_G5t8) at 0:51–1:46" },
  { rule: "self-fracture blocker", text: "(3) add one desecrated mod → 4 mods, 3 the orb can pick" },
  { rule: "self-fracture odds", text: "(4) Fracturing Orb → \"a one in three chance to hit\" the flat; a miss means a new base" },
  { rule: "self-fracture chaos", text: "(5) remove the two loose mods, then Chaos Orb ~200–300 times for the second tier-1 flat" },
  { rule: "planner shape", text: "fracture a LANDED wanted mod, never the last one" },
  { rule: "owner ban kept", text: "never Greater Exaltation (owner rule)" },
  { rule: "alloy keeper", text: "a crafted or alloy keeper would be fracturable too (Belton, transcript 25 at 1:54–2:47)" },
];

const TRANSCRIPTS = join(process.cwd(), "docs", "kb", "sources", "transcripts");

/** Caption text inside [from, to] (m:ss), timestamps dropped and lines joined. */
export function captionsBetween(file: string, from: number, to: number): string {
  const secs = (m: string, s: string) => Number(m) * 60 + Number(s);
  return readFileSync(join(TRANSCRIPTS, file), "utf8")
    .split(/\r?\n/)
    .flatMap((line) => {
      const m = /^\[(\d+):(\d{2})\] (.*)$/.exec(line);
      return m && secs(m[1]!, m[2]!) >= from && secs(m[1]!, m[2]!) <= to ? [m[3]!] : [];
    })
    .join(" ")
    .replace(/\s+/g, " ");
}

/** The quoted creator words really sit inside the cited window. */
function testTranscriptQuotes(): void {
  const alohaa = captionsBetween("32-endgame-ring-amulet-attack-crafting-alohaa.txt", 51, 106);
  for (const quote of ["a desecrated modifier cannot be fractured", "I have three mods right here and if I use a fracturing orb, I have a one in three chance to hit", "roughly 200 to 300 chaos on average"]) {
    assert.ok(alohaa.includes(quote), `Alohaa 0:51–1:46 says: ${quote}`);
  }
  const belton = captionsBetween("25-plus-6-to-plus-8-spellslinger-wand-belton.txt", 114, 167).toLowerCase();
  assert.ok(belton.includes("fractur"), "Belton 1:54–2:47 fractures the crafted mod");
}

export function testKbFracture(): void {
  const kbText = readFileSync(join(process.cwd(), "docs", "research", KB), "utf8").replace(/\r/g, "");
  const start = kbText.indexOf("## 2.");
  const section2 = kbText.slice(start, kbText.indexOf("## 3.", start)).replace(/\s+/g, " ");
  assert.ok(start >= 0 && section2.length > 0, "KB §2 exists");
  for (const f of KB2_FACTS) assert.ok(section2.includes(f.text), `KB §2 no longer states (${f.rule}): ${f.text}`);
  testTranscriptQuotes();
}
