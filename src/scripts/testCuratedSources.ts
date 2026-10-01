/*
 * No curated data links a real-money-trading shop. claimSchema and the craft provenance schema
 * already reject one at load; this sweep also covers every URL that does not pass through those
 * schemas (boss loot, strategy notes, TS data tables), so a shop cannot slip in as plain text.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { isRmtUrl, RMT_DOMAINS } from "../lib/claim";

// npm scripts run from the repo root
const ROOT = process.cwd();
// the RePoE snapshot is datamined game data with no citations; everything else here is curated
const SCAN: ReadonlyArray<{ dir: string; ext: string; skip?: string }> = [
  { dir: "src/data/poe2", ext: ".json", skip: "repoe" },
  { dir: "src/core", ext: ".ts" },
];
const URL_RE = /https?:\/\/[^\s"'`)<>\]]+/g;

function filesUnder(dir: string, ext: string, skip: string | undefined): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return e.name === skip ? [] : filesUnder(path, ext, skip);
    return e.name.endsWith(ext) ? [path] : [];
  });
}

function rmtHits(): string[] {
  const hits: string[] = [];
  for (const { dir, ext, skip } of SCAN) {
    for (const file of filesUnder(join(ROOT, dir), ext, skip)) {
      for (const url of readFileSync(file, "utf8").match(URL_RE) ?? []) {
        if (isRmtUrl(url)) hits.push(`${relative(ROOT, file)}: ${url}`);
      }
    }
  }
  return hits;
}

const scanned = SCAN.reduce((n, { dir, ext, skip }) => n + filesUnder(join(ROOT, dir), ext, skip).length, 0);
assert.ok(scanned > 50, `expected to scan the curated data, found only ${scanned} files`);
const hits = rmtHits();
assert.deepEqual(hits, [], `curated data cites real-money-trading shops (RMT_DOMAINS):\n${hits.join("\n")}`);
console.log(`PASS  curated sources: ${scanned} files, no link to any of ${RMT_DOMAINS.length} RMT shops`);
