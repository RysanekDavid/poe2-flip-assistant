import type Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { config } from "../../config/env";
import {
  conditionalRequestForParser,
  insertSourceSnapshot,
  latestSourceSnapshot,
  markOfficialPatchBodyInvalid,
  patchBodyTargets,
  recordSourceFailure,
  recordValidIndexCheck,
  sourceSyncState,
  updateOfficialPatchBody,
  upsertIndexPatches,
} from "../../db/sourceQueries";
import { fetchPatchHtml, type HttpFetcher } from "./client";
import {
  catalogManifestSchema,
  PATCH_ARTIFACT_DIR,
  PATCH_INDEX_URL,
  PATCH_PARSER_NAME,
  PATCH_PARSER_VERSION,
  PATCH_THREAD_VALIDATION_POLICY,
  patchIndexValidationPolicy,
  PATCH_SOURCE_ID,
  patchCoverageSchema,
  type HtmlFetchResult,
  type PatchCoverage,
  type PatchDocument,
  type PatchIndexEntry,
  type PatchSyncResult,
} from "./contracts";
import { parsePatchIndex, parsePatchThread } from "./parser";

interface SyncOptions {
  db?: Database.Database;
  fetcher?: HttpFetcher;
  projectRoot?: string;
  artifactRoot?: string;
  contact?: string;
  minimumEntries?: number;
  maxBytes?: number;
}

interface ArtifactRecord {
  path: string;
  sha256: string;
  bytes: number;
}

export async function syncPatchNotes(options: SyncOptions = {}): Promise<PatchSyncResult> {
  const db = options.db;
  const root = options.projectRoot ?? process.cwd();
  const artifactRoot = options.artifactRoot ?? dirname(resolve(config.dbPath));
  const contact = options.contact ?? config.dataSourceContact;
  const checkedAt = new Date().toISOString();
  try {
    if (!contact.trim()) throw new Error("DATA_SOURCE_CONTACT or POE_CONTACT is required");
    const coverage = await loadVerifiedPatchCoverage(root);
    return await runSync(coverage, { ...options, projectRoot: root, artifactRoot, contact });
  } catch (error) {
    const message = errorMessage(error);
    recordSourceFailure(PATCH_SOURCE_ID, checkedAt, message, db);
    return { ok: false, indexChanged: false, checkedThreads: 0, changedThreads: 0, errors: [message] };
  }
}

async function runSync(
  coverage: PatchCoverage,
  options: Required<Pick<SyncOptions, "projectRoot" | "artifactRoot" | "contact">> & SyncOptions,
): Promise<PatchSyncResult> {
  const state = sourceSyncState(PATCH_SOURCE_ID, options.db);
  const minimumEntries = options.minimumEntries ?? config.patchNotes.minIndexEntries;
  const validationPolicy = patchIndexValidationPolicy(
    minimumEntries,
    coverage.official_patch_thread_id,
  );
  const conditional = conditionalRequestForParser(
    state.indexEtag,
    state.indexLastModified,
    state.validIndexParserVersion,
    PATCH_PARSER_VERSION,
    state.validIndexValidationPolicy,
    validationPolicy,
    state.lastSuccessAt != null,
  );
  const index = await fetchPatchHtml(
    PATCH_INDEX_URL,
    options.contact,
    conditional.headers,
    options.maxBytes ?? config.patchNotes.maxResponseBytes,
    options.fetcher,
  );
  if (index.status === 304) {
    if (!conditional.allowsNotModified) throw new Error("index returned 304 after parser version changed");
    recordValidIndexCheck(
      PATCH_SOURCE_ID, index.retrievedAt, index.etag, index.lastModified,
      null, PATCH_PARSER_VERSION, validationPolicy, options.db,
    );
    return syncBodies(false, coverage.official_patch_thread_id, options);
  }
  const parsed = await persistAndParseIndex(index, coverage, options);
  if (!parsed) {
    return { ok: false, indexChanged: true, checkedThreads: 0, changedThreads: 0, errors: ["patch index validation failed"] };
  }
  recordValidIndexCheck(
    PATCH_SOURCE_ID, index.retrievedAt, index.etag, index.lastModified,
    parsed.snapshotId, PATCH_PARSER_VERSION, validationPolicy, options.db,
  );
  return syncBodies(true, coverage.official_patch_thread_id, options);
}

async function persistAndParseIndex(
  response: HtmlFetchResult,
  coverage: PatchCoverage,
  options: Required<Pick<SyncOptions, "artifactRoot">> & SyncOptions,
): Promise<{ snapshotId: number } | null> {
  const artifact = await persistArtifact(response, options.artifactRoot);
  const minimumEntries = options.minimumEntries ?? config.patchNotes.minIndexEntries;
  const validationPolicy = patchIndexValidationPolicy(
    minimumEntries,
    coverage.official_patch_thread_id,
  );
  let entries: PatchIndexEntry[];
  try {
    entries = parsePatchIndex(requiredHtml(response), minimumEntries);
    validateIndexCoverage(entries, coverage.official_patch_thread_id);
  } catch (error) {
    const message = errorMessage(error);
    insertSnapshot(
      response, artifact, "index", "2222", false, message, validationPolicy, options.db,
    );
    recordSourceFailure(PATCH_SOURCE_ID, response.retrievedAt, message, options.db);
    return null;
  }
  const snapshotId = insertSnapshot(
    response, artifact, "index", "2222", true, null, validationPolicy, options.db,
  );
  upsertIndexPatches(entries, snapshotId, coverage.official_patch_thread_id, options.db);
  return { snapshotId };
}

function validateIndexCoverage(entries: PatchIndexEntry[], baselineThreadId: number): void {
  if (!entries.some((entry) => entry.threadId >= baselineThreadId)) {
    throw new Error(`patch index does not reach coverage baseline thread ${baselineThreadId}`);
  }
}

async function syncBodies(
  indexChanged: boolean,
  baselineThreadId: number,
  options: SyncOptions,
): Promise<PatchSyncResult> {
  const errors: string[] = [];
  let changedThreads = 0;
  const targets = patchBodyTargets(baselineThreadId, options.db);
  for (const target of targets) {
    try {
      if (await syncOneBody(target.threadId, target.sourceUrl, options)) changedThreads += 1;
    } catch (error) {
      errors.push(`thread ${target.threadId}: ${errorMessage(error)}`);
    }
  }
  if (errors.length > 0) {
    recordSourceFailure(PATCH_SOURCE_ID, new Date().toISOString(), errors.join("; "), options.db);
  }
  return {
    ok: errors.length === 0,
    indexChanged,
    checkedThreads: targets.length,
    changedThreads,
    errors,
  };
}

async function syncOneBody(threadId: number, url: string, options: SyncOptions): Promise<boolean> {
  const previous = latestSourceSnapshot(PATCH_SOURCE_ID, "thread", String(threadId), options.db);
  const conditional = conditionalRequestForParser(
    previous?.etag ?? null,
    previous?.lastModified ?? null,
    previous?.parserVersion ?? null,
    PATCH_PARSER_VERSION,
    previous?.validationPolicy ?? null,
    PATCH_THREAD_VALIDATION_POLICY,
    previous?.valid === true,
  );
  const response = await fetchPatchHtml(
    url,
    options.contact ?? config.dataSourceContact,
    conditional.headers,
    options.maxBytes ?? config.patchNotes.maxResponseBytes,
    options.fetcher,
  );
  if (response.status === 304) {
    if (!conditional.allowsNotModified) {
      throw new Error(`thread ${threadId} returned 304 after parser version changed`);
    }
    return false;
  }
  const artifactRoot = options.artifactRoot ?? dirname(resolve(config.dbPath));
  const artifact = await persistArtifact(response, artifactRoot);
  let document: PatchDocument;
  try {
    document = parsePatchThread(requiredHtml(response), threadId);
  } catch (error) {
    const message = errorMessage(error);
    insertSnapshot(
      response, artifact, "thread", String(threadId), false, message,
      PATCH_THREAD_VALIDATION_POLICY, options.db,
    );
    markOfficialPatchBodyInvalid(threadId, options.db);
    throw new Error(message);
  }
  const snapshotId = insertSnapshot(
    response, artifact, "thread", String(threadId), true, null,
    PATCH_THREAD_VALIDATION_POLICY, options.db,
  );
  updateOfficialPatchBody(document, snapshotId, options.db);
  return true;
}

export async function loadVerifiedPatchCoverage(projectRoot = process.cwd()): Promise<PatchCoverage> {
  const coveragePath = join(projectRoot, "src/data/poe2/patch-coverage.json");
  const manifestPath = join(projectRoot, "src/data/poe2/repoe/manifest.json");
  const coverage = patchCoverageSchema.parse(JSON.parse(await readFile(coveragePath, "utf8")) as unknown);
  const manifest = catalogManifestSchema.parse(JSON.parse(await readFile(manifestPath, "utf8")) as unknown);
  const manifestDir = dirname(manifestPath);
  const artifactPath = resolve(manifestDir, manifest.artifact);
  if (isAbsolute(manifest.artifact) || relative(manifestDir, artifactPath).startsWith("..")) {
    throw new Error("RePoE manifest artifact path escapes its directory");
  }
  const actualSha = sha256(await readFile(artifactPath));
  if (actualSha !== manifest.artifact_sha256) throw new Error("active RePoE artifact SHA does not match its manifest");
  if (coverage.catalog_sha256 !== actualSha) throw new Error("patch coverage is not bound to the active RePoE catalog SHA");
  return coverage;
}

async function persistArtifact(response: HtmlFetchResult, artifactRoot: string): Promise<ArtifactRecord> {
  if (!response.raw) throw new Error("cannot persist an empty patch response");
  const raw = Buffer.from(response.raw);
  const hash = sha256(raw);
  const relativePath = `${PATCH_ARTIFACT_DIR}/${hash}.html.gz`;
  const target = join(artifactRoot, ...relativePath.split("/"));
  await mkdir(dirname(target), { recursive: true });
  if (!(await pathExists(target))) {
    const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporary, gzipSync(raw, { level: 9 }), { flag: "wx" });
    await rename(temporary, target);
  }
  const restored = gunzipSync(await readFile(target));
  if (sha256(restored) !== hash || !restored.equals(raw)) {
    throw new Error(`immutable artifact verification failed: ${relativePath}`);
  }
  return { path: relativePath, sha256: hash, bytes: raw.byteLength };
}

function insertSnapshot(
  response: HtmlFetchResult,
  artifact: ArtifactRecord,
  kind: "index" | "thread",
  externalId: string,
  valid: boolean,
  parseError: string | null,
  validationPolicy: string,
  db?: Database.Database,
): number {
  return insertSourceSnapshot({
    sourceId: PATCH_SOURCE_ID,
    kind,
    externalId,
    sourceUrl: response.url,
    statusCode: response.status,
    etag: response.etag,
    lastModified: response.lastModified,
    sha256: artifact.sha256,
    artifactPath: artifact.path,
    bytes: artifact.bytes,
    valid,
    parseError,
    parserName: PATCH_PARSER_NAME,
    parserVersion: PATCH_PARSER_VERSION,
    validationPolicy,
    retrievedAt: response.retrievedAt,
  }, db);
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return false;
    throw error;
  }
}

function requiredHtml(response: HtmlFetchResult): string {
  if (response.html == null) throw new Error("expected an HTML response body");
  return response.html;
}

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
