/*
 * Reader for the craft-mining artifacts: the research tree (docs/research/craft-mining/<id>/) and
 * the runtime files the planner will read (src/data/poe2/craft/{routes,priors}/). Curated and
 * immutable for a release, so one parse per process. Any defect throws — a malformed file, an id
 * that is not its filename, an unknown file in the research tree, a ref that does not resolve, a
 * prior that does not trace to its extraction — because a silently skipped route or prior would
 * look like "the creators never did this" and the planner would fall back without saying so.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { z } from "zod";
import {
  checkBasesAndRoles,
  checkCandidates,
  checkExtraction,
  checkPriorsScope,
  checkPriorTrace,
  checkRoute,
} from "./crossChecks";
import { archetypeSchema, candidatesFileSchema, marketSampleSchema, type Archetype, type CandidatesFile, type MarketSample } from "./scaffoldSchema";
import { craftVideoExtractionSchema, priorsFileSchema, routeFileSchema, type CraftVideoExtraction, type PriorsFile, type RouteFile } from "./schema";

export const CRAFT_MINING_DIR = join(process.cwd(), "docs", "research", "craft-mining");
export const ROUTES_DIR = join(process.cwd(), "src", "data", "poe2", "craft", "routes");
export const PRIORS_DIR = join(process.cwd(), "src", "data", "poe2", "craft", "priors");

/** Files an archetype directory may hold besides extractions/; prose (*.md) is free-form. */
const ARCHETYPE_FILES = new Set(["archetype.json", "candidates.json", "market-sample.json", "extractions"]);

export interface ArchetypeBundle {
  archetype: Archetype;
  candidates: CandidatesFile;
  marketSample: MarketSample | null;
  extractions: CraftVideoExtraction[];
}

export interface CraftMining {
  archetypes: ArchetypeBundle[];
  routes: RouteFile[];
  priors: PriorsFile[];
}

let cached: CraftMining | null = null;

/** Parse one JSON file with its schema; the error names the file and the first issues. */
export function parseResearchFile<T>(path: string, schema: z.ZodType<T, z.ZodTypeDef, unknown>): T {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`craft mining ${path} is not readable JSON`, { cause: error });
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const where = parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`);
    throw new Error(`craft mining ${path} is malformed (${where.join("; ")})`);
  }
  return parsed.data;
}

/** The JSON files of a data directory; anything else there is a mistake, not something to skip. */
function jsonFiles(dir: string): string[] {
  const entries = readdirSync(dir).sort();
  const stray = entries.filter((f) => !f.endsWith(".json"));
  if (stray.length > 0) throw new Error(`craft mining ${dir}: only .json files belong here, found ${stray.join(", ")}`);
  return entries;
}

function readExtractions(dir: string, archetype: Archetype, candidates: CandidatesFile): CraftVideoExtraction[] {
  const xdir = join(dir, "extractions");
  if (!existsSync(xdir)) return [];
  return jsonFiles(xdir).map((file) => {
    const path = join(xdir, file);
    const x = parseResearchFile(path, craftVideoExtractionSchema);
    checkExtraction(path, file.replace(/\.json$/, ""), archetype, candidates, x);
    return x;
  });
}

/** One archetype directory, validated on its own and against the catalogs. Exposed for tests. */
export function readArchetypeDir(dir: string, id: string): ArchetypeBundle {
  for (const entry of readdirSync(dir)) {
    if (!ARCHETYPE_FILES.has(entry) && !entry.endsWith(".md")) throw new Error(`craft mining ${dir}: unknown file "${entry}"`);
  }
  const archetypePath = join(dir, "archetype.json");
  const archetype = parseResearchFile(archetypePath, archetypeSchema);
  if (archetype.id !== id) throw new Error(`craft mining ${archetypePath}: id "${archetype.id}" must equal the directory "${id}"`);
  checkBasesAndRoles(archetypePath, archetype.itemClass, archetype.bases, archetype.targets);
  const candidatesPath = join(dir, "candidates.json");
  const candidates = parseResearchFile(candidatesPath, candidatesFileSchema);
  checkCandidates(candidatesPath, archetype, candidates);
  const samplePath = join(dir, "market-sample.json");
  const marketSample = existsSync(samplePath) ? parseResearchFile(samplePath, marketSampleSchema) : null;
  if (marketSample && marketSample.archetype !== id) throw new Error(`craft mining ${samplePath}: archetype "${marketSample.archetype}", expected "${id}"`);
  return { archetype, candidates, marketSample, extractions: readExtractions(dir, archetype, candidates) };
}

/** The golden craft set (goldenSchema.ts) lives beside the archetypes but is not one; craft:eval reads it. */
export const GOLDEN_DIR_NAME = "golden";

/** Every archetype under `root` (one directory each); at least one must exist. */
export function readArchetypes(root: string): ArchetypeBundle[] {
  const ids = readdirSync(root)
    .filter((e) => e !== GOLDEN_DIR_NAME && statSync(join(root, e)).isDirectory())
    .sort();
  if (ids.length === 0) throw new Error(`craft mining: no archetype directories in ${root}`);
  return ids.map((id) => readArchetypeDir(join(root, id), id));
}

/** Route files (<archetype>.json). An absent directory means no route has been mined yet. */
export function readRouteFiles(dir: string, archetypeIds: ReadonlySet<string>): RouteFile[] {
  if (!existsSync(dir)) return [];
  return jsonFiles(dir).map((file) => {
    const path = join(dir, file);
    const routes = parseResearchFile(path, routeFileSchema);
    const id = file.replace(/\.json$/, "");
    if (routes.archetype !== id) throw new Error(`craft mining ${path}: archetype "${routes.archetype}" must equal the filename "${id}"`);
    for (const t of routes.templates) checkRoute(path, archetypeIds, t);
    return routes;
  });
}

/** Prior files (global.json, <itemClass>.json). An absent directory means no prior exists yet. */
export function readPriorFiles(dir: string, extractions: ReadonlyMap<string, CraftVideoExtraction>): PriorsFile[] {
  if (!existsSync(dir)) return [];
  return jsonFiles(dir).map((file) => {
    const path = join(dir, file);
    const priors = parseResearchFile(path, priorsFileSchema);
    checkPriorsScope(path, file.replace(/\.json$/, ""), priors);
    checkPriorTrace(path, priors, extractions);
    return priors;
  });
}

/** The whole tree, every cross-check applied. Exposed with dirs for tests and research:validate. */
export function readCraftMining(dirs: { research: string; routes: string; priors: string }): CraftMining {
  const archetypes = readArchetypes(dirs.research);
  const extractions = new Map<string, CraftVideoExtraction>();
  for (const x of archetypes.flatMap((a) => a.extractions)) {
    if (extractions.has(x.videoId)) throw new Error(`craft mining: ${x.videoId} is extracted twice; list both archetypes in one extraction`);
    extractions.set(x.videoId, x);
  }
  const routes = readRouteFiles(dirs.routes, new Set(archetypes.map((a) => a.archetype.id)));
  return { archetypes, routes, priors: readPriorFiles(dirs.priors, extractions) };
}

/** The committed craft-mining data (parsed once per process; throws on any defect). */
export function loadCraftMining(): CraftMining {
  cached ??= readCraftMining({ research: CRAFT_MINING_DIR, routes: ROUTES_DIR, priors: PRIORS_DIR });
  return cached;
}
