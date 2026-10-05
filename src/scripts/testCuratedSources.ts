/*
 * No curated data links a real-money-trading shop. claimSchema and the craft provenance schema
 * already reject one at load; this sweep also covers every URL that does not pass through those
 * schemas (boss loot, strategy notes, TS data tables, craft guide prose) and the Coach's RAG
 * corpus, whose citations the Coach hands to players.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { isRmtUrl, RMT_DOMAINS } from "../lib/claim";
import { recipeSourceSchema } from "../core/craftProvenance/schema";
import { readKbManifest } from "./kbManifest";

// npm scripts run from the repo root
const ROOT = process.cwd();
// the RePoE snapshot is datamined game data with no citations; everything else here is curated
const TREES: ReadonlyArray<{ dir: string; ext: string; skip?: string }> = [
  { dir: "src/data/poe2", ext: ".json", skip: "repoe" },
  { dir: "src/core", ext: ".ts" },
  // craft route mining: archetypes, candidates, extractions, synthesis notes and the transcripts they cite
  { dir: "docs/research/craft-mining", ext: ".json" },
  { dir: "docs/research/craft-mining", ext: ".md" },
  { dir: "docs/kb/sources", ext: ".json" },
  { dir: "docs/kb/sources/transcripts", ext: ".txt" },
];
const URL_RE = /https?:\/\/[^\s"'`)<>\]]+/g;

function filesUnder(dir: string, ext: string, skip: string | undefined): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return e.name === skip ? [] : filesUnder(path, ext, skip);
    return e.name.endsWith(ext) ? [path] : [];
  });
}

/** Curated data trees, and exactly the files the Coach ingests (docs/kb manifest corpus). */
function curatedFiles(): { data: string[]; corpus: string[] } {
  const data = TREES.flatMap(({ dir, ext, skip }) => filesUnder(join(ROOT, dir), ext, skip));
  const corpus = readKbManifest(ROOT).corpus.map((entry) => join(ROOT, entry.path));
  return { data, corpus };
}

function rmtHits(files: readonly string[]): string[] {
  return files.flatMap((file) =>
    (readFileSync(file, "utf8").match(URL_RE) ?? []).filter(isRmtUrl).map((url) => `${relative(ROOT, file)}: ${url}`),
  );
}

// A shop cited by name in prose ("per <shop>: 200+ div") is still a citation, just one without a
// link for the URL sweep to catch; so the bare brand (the host's first label) must not appear in the
// data trees either. The KB corpus is exempt: it names shops in its reliability warnings and in the
// removal logs, never as a source, and those warnings are what keep the Coach from trusting them.
const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const BRAND_RE = new RegExp(`\\b(?:${RMT_DOMAINS.map((d) => escapeRe(d.split(".")[0] ?? d)).join("|")})\\b`, "gi");

function brandHits(files: readonly string[]): string[] {
  return files.flatMap((file) => (readFileSync(file, "utf8").match(BRAND_RE) ?? []).map((name) => `${relative(ROOT, file)}: ${name}`));
}

const { data, corpus } = curatedFiles();
const files = [...data, ...corpus];
assert.ok(files.length > 50, `expected to scan the curated data, found only ${files.length} files`);
assert.ok(corpus.some((f) => f.endsWith(".md")), "the Coach corpus must be part of the sweep");
// a shop once slipped into the craft recipes as a source and as prose (2026-10-01)
const CRAFT_FILES = ["craftProvenanceData2.ts", "craftRecipeData5.ts", "craftGuideData5.ts"];
const missingCraft = CRAFT_FILES.filter((name) => !data.some((f) => f.endsWith(join("src", "core", name))));
assert.deepEqual(missingCraft, [], "the craft provenance, recipe and guide data must be part of the sweep");
// the craft-mining tree and its transcripts are cited to players through route cards and priors
const MINING_FILES = [join("docs", "research", "craft-mining", "ring-attack-flat", "candidates.json"), join("docs", "kb", "sources", "transcripts", "index.json")];
const missingMining = MINING_FILES.filter((path) => !data.some((f) => f.endsWith(path)));
assert.deepEqual(missingMining, [], "the craft-mining research tree and the transcript index must be part of the sweep");
const hits = rmtHits(files);
assert.deepEqual(hits, [], `curated data cites real-money-trading shops (RMT_DOMAINS):\n${hits.join("\n")}`);
const named = brandHits(data);
assert.deepEqual(named, [], `curated data names real-money-trading shops (RMT_DOMAINS):\n${named.join("\n")}`);
assert.ok(
  "per P2PAH: 200+ div".match(BRAND_RE)?.length === 1 && "notiggm".match(BRAND_RE) === null,
  "the brand sweep matches a bare shop name as a word, not inside another word",
);

const SHOP_SOURCE = {
  kind: "guide",
  title: "How to Craft Mana Stacking Rings in Path of Exile 2",
  url: "https://www.p2pah.com/blog/path-of-exile-2/1893-how-to-craft-mana-stacking-rings-in-path-of-exile-2.html",
  creator: null,
  date: "2026-03-28",
  datePrecision: "exact",
  tier: "secondary",
  ref: null,
};
assert.ok(!recipeSourceSchema.safeParse(SHOP_SOURCE).success, "the craft provenance schema rejects an RMT shop as a recipe source");
console.log(`PASS  curated sources: ${files.length} files incl. the Coach corpus and craft provenance, no link to or name of any of ${RMT_DOMAINS.length} RMT shops`);
