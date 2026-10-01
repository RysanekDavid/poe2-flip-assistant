/*
 * No curated data links a real-money-trading shop. claimSchema and the craft provenance schema
 * already reject one at load; this sweep also covers every URL that does not pass through those
 * schemas (boss loot, strategy notes, TS data tables) and the Coach's RAG corpus, whose citations
 * the Coach hands to players.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { isRmtUrl, RMT_DOMAINS } from "../lib/claim";
import { readKbManifest } from "./kbManifest";

// npm scripts run from the repo root
const ROOT = process.cwd();
// the RePoE snapshot is datamined game data with no citations; everything else here is curated
const TREES: ReadonlyArray<{ dir: string; ext: string; skip?: string }> = [
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

/** Curated trees plus exactly the files the Coach ingests (docs/kb manifest corpus). */
function curatedFiles(): string[] {
  const trees = TREES.flatMap(({ dir, ext, skip }) => filesUnder(join(ROOT, dir), ext, skip));
  const corpus = readKbManifest(ROOT).corpus.map((entry) => join(ROOT, entry.path));
  return [...trees, ...corpus];
}

function rmtHits(files: readonly string[]): string[] {
  return files.flatMap((file) =>
    (readFileSync(file, "utf8").match(URL_RE) ?? []).filter(isRmtUrl).map((url) => `${relative(ROOT, file)}: ${url}`),
  );
}

const files = curatedFiles();
assert.ok(files.length > 50, `expected to scan the curated data, found only ${files.length} files`);
assert.ok(files.some((f) => f.endsWith(".md")), "the Coach corpus must be part of the sweep");
const hits = rmtHits(files);
assert.deepEqual(hits, [], `curated data cites real-money-trading shops (RMT_DOMAINS):\n${hits.join("\n")}`);
console.log(`PASS  curated sources: ${files.length} files incl. the Coach corpus, no link to any of ${RMT_DOMAINS.length} RMT shops`);
