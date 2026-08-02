import { createHash } from "node:crypto";
import { mkdir, readFile, realpath, rename, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { z } from "zod";

const REPOE_ROOT = "https://repoe-fork.github.io/poe2";
const OUTPUT_DIR = join(process.cwd(), "src", "data", "poe2", "repoe");
const SCHEMA_VERSION = 1 as const;
type JsonRecord = Record<string, unknown>;
type JsonSource = JsonRecord | unknown[];

const recordSchema = z.record(z.string(), z.unknown());
const sourceSchema = z.union([recordSchema, z.array(z.unknown())]);
const baseItemSchema = z.object({
  item_class: z.string(),
  name: z.string(),
  tags: z.array(z.string()),
}).passthrough();
const modSchema = z.object({
  generation_type: z.string(),
  required_level: z.number(),
  stats: z.array(z.unknown()),
}).passthrough();
const manifestSchema = z.object({
  schema_version: z.literal(SCHEMA_VERSION),
  payload_schema_version: z.literal(SCHEMA_VERSION),
  repoe_version: z.string().min(1),
  artifact: z.string().min(1),
  artifact_bytes: z.number().int().positive(),
  artifact_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  source_count: z.number().int().positive(),
  sources: z.record(z.string(), z.object({ records: z.number().int().nonnegative() }).passthrough()),
}).passthrough();

interface SourceFile {
  name: string;
  url: string;
  data: JsonSource;
  sha256: string;
  bytes: number;
  records: number;
}

interface Snapshot {
  schema_version: typeof SCHEMA_VERSION;
  repoe_version: string;
  synced_at: string;
  sources: Record<string, JsonSource>;
}

async function main(): Promise<void> {
  const mode = parseMode(process.argv.slice(2));
  if (mode === "verify") {
    await verifyCommittedSnapshot();
    return;
  }
  const index = await fetchIndex();
  const files = await Promise.all(index.sourceNames.map(fetchSource));
  validateDataset(files);
  const syncedAt = new Date().toISOString();
  const snapshot = buildSnapshot(files, index.version, syncedAt);
  const compressed = gzipSync(Buffer.from(JSON.stringify(snapshot)), { level: 9 });
  const artifactSha256 = sha256(compressed);
  const artifact = `catalog-${artifactSha256.slice(0, 16)}.json.gz`;
  const manifest = buildManifest(
    files,
    index.version,
    syncedAt,
    artifact,
    compressed,
    artifactSha256,
  );
  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeImmutable(join(OUTPUT_DIR, artifact), compressed);
  await atomicWrite(join(OUTPUT_DIR, "manifest.json"), Buffer.from(JSON.stringify(manifest, null, 2)));
  console.log(
    `[poe2-data] RePoE ${index.version}: ${files.length} exports, ` +
      `${files.reduce((sum, file) => sum + file.records, 0)} records, ` +
      `${(compressed.byteLength / 1_048_576).toFixed(2)} MiB compressed`,
  );
}

function parseMode(args: string[]): "sync" | "verify" {
  if (args.length === 0) return "sync";
  if (args.length === 1 && args[0] === "--verify") return "verify";
  throw new Error(`Unsupported arguments: ${args.join(" ")}`);
}

async function verifyCommittedSnapshot(): Promise<void> {
  const manifestPath = join(OUTPUT_DIR, "manifest.json");
  const manifest = manifestSchema.parse(JSON.parse(await readFile(manifestPath, "utf8")));
  validateArtifactName(manifest.artifact, manifest.artifact_sha256);
  const artifactPath = resolve(OUTPUT_DIR, manifest.artifact);
  await validateArtifactLocation(artifactPath);
  const compressed = await readFile(artifactPath);
  if (compressed.byteLength !== manifest.artifact_bytes) {
    throw new Error(`RePoE artifact byte count mismatch: expected ${manifest.artifact_bytes}`);
  }
  if (sha256(compressed) !== manifest.artifact_sha256) {
    throw new Error("RePoE artifact SHA-256 mismatch");
  }
  const snapshot = parseSnapshot(compressed);
  validateSnapshot(snapshot, manifest);
  console.log(
    `[poe2-data] verified RePoE ${manifest.repoe_version}: ` +
      `${manifest.source_count} exports, ${manifest.artifact_sha256.slice(0, 12)}`,
  );
}

function validateArtifactName(artifact: string, sha: string): void {
  const expected = `catalog-${sha.slice(0, 16)}.json.gz`;
  if (isAbsolute(artifact) || basename(artifact) !== artifact || artifact !== expected) {
    throw new Error(`Unsafe or non-content-addressed RePoE artifact name: ${artifact}`);
  }
}

async function validateArtifactLocation(artifactPath: string): Promise<void> {
  const [realOutput, realArtifact] = await Promise.all([realpath(OUTPUT_DIR), realpath(artifactPath)]);
  if (dirname(realArtifact) !== realOutput) {
    throw new Error("RePoE artifact resolves outside its snapshot directory");
  }
}

function parseSnapshot(compressed: Buffer): Snapshot {
  let decoded: unknown;
  try {
    decoded = JSON.parse(gunzipSync(compressed).toString("utf8"));
  } catch (error: unknown) {
    throw new Error("RePoE artifact is not valid gzip JSON", { cause: error });
  }
  const parsed = z.object({
    schema_version: z.literal(SCHEMA_VERSION),
    repoe_version: z.string().min(1),
    synced_at: z.string().min(1),
    sources: z.record(z.string(), sourceSchema),
  }).parse(decoded);
  return parsed;
}

function validateSnapshot(snapshot: Snapshot, manifest: z.infer<typeof manifestSchema>): void {
  if (snapshot.repoe_version !== manifest.repoe_version) {
    throw new Error("RePoE payload version does not match its manifest");
  }
  const sourceNames = Object.keys(snapshot.sources).sort();
  const manifestNames = Object.keys(manifest.sources).sort();
  if (sourceNames.length !== manifest.source_count || sourceNames.join("\0") !== manifestNames.join("\0")) {
    throw new Error("RePoE payload source set does not match its manifest");
  }
  for (const name of sourceNames) {
    const source = snapshot.sources[name];
    const records = Array.isArray(source) ? source.length : Object.keys(source ?? {}).length;
    if (records !== manifest.sources[name]?.records) {
      throw new Error(`RePoE source ${name} record count does not match its manifest`);
    }
  }
  validateSnapshotDataset(snapshot.sources);
}

function validateSnapshotDataset(sources: Record<string, JsonSource>): void {
  const files = Object.entries(sources).map(([name, data]) => ({
    name,
    data,
    url: "offline-verification",
    sha256: "offline-verification",
    bytes: 0,
    records: Array.isArray(data) ? data.length : Object.keys(data).length,
  }));
  validateDataset(files);
}

async function fetchIndex(): Promise<{ version: string; sourceNames: string[] }> {
  const response = await fetchWithRetry(`${REPOE_ROOT}/`);
  const html = await response.text();
  const match = html.match(/PoE2 version\s+([^<\s]+)/i);
  if (!match?.[1]) throw new Error("RePoE index did not expose a PoE2 version");
  const names = [...html.matchAll(/href=["'][^"']*?([a-z0-9_]+)\.min\.json["']/gi)]
    .map((entry) => entry[1])
    .filter((name): name is string => Boolean(name));
  const sourceNames = [...new Set(names)].sort();
  for (const required of ["base_items", "mods", "mods_by_base"]) {
    if (!sourceNames.includes(required)) throw new Error(`RePoE index is missing ${required}`);
  }
  if (sourceNames.length < 15) {
    throw new Error(`RePoE index exposed only ${sourceNames.length} JSON exports`);
  }
  return { version: match[1], sourceNames };
}

async function fetchSource(name: string): Promise<SourceFile> {
  const url = `${REPOE_ROOT}/${name}.min.json`;
  const response = await fetchWithRetry(url);
  const bytes = Buffer.from(await response.arrayBuffer());
  let decoded: unknown;
  try {
    decoded = JSON.parse(bytes.toString("utf8"));
  } catch (error: unknown) {
    throw new Error(`${name} is not valid JSON`, { cause: error });
  }
  const data = sourceSchema.parse(decoded);
  const records = Array.isArray(data) ? data.length : Object.keys(data).length;
  return { name, url, data, sha256: sha256(bytes), bytes: bytes.length, records };
}

async function fetchWithRetry(url: string): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": "poe2-flip-assistant-data-sync/1.0" },
        signal: AbortSignal.timeout(120_000),
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return response;
    } catch (error: unknown) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
    }
  }
  throw new Error(`Failed to download ${url}`, { cause: lastError });
}

function validateDataset(files: SourceFile[]): void {
  const byName = Object.fromEntries(files.map((file) => [file.name, file.data]));
  const baseItems = recordSchema.parse(byName.base_items);
  const modifierRecords = recordSchema.parse(byName.mods);
  const modsByBase = recordSchema.parse(byName.mods_by_base);
  const bases = Object.values(baseItems);
  const mods = Object.values(modifierRecords);
  if (bases.length < 500) throw new Error(`base_items is unexpectedly small (${bases.length})`);
  if (mods.length < 10_000) throw new Error(`mods is unexpectedly small (${mods.length})`);
  bases.slice(0, 100).forEach((entry) => baseItemSchema.parse(entry));
  mods.slice(0, 100).forEach((entry) => modSchema.parse(entry));
  const hasStaffBase = bases.some(
    (entry) =>
      typeof entry === "object" &&
      entry !== null &&
      "item_class" in entry &&
      typeof entry.item_class === "string" &&
      /staff|staves/i.test(entry.item_class),
  );
  if (!hasStaffBase) throw new Error("No Staves base exists in base_items");
  if (Object.keys(modsByBase).length === 0) throw new Error("mods_by_base is empty");
}

function buildSnapshot(files: SourceFile[], version: string, syncedAt: string): Snapshot {
  const sources = Object.fromEntries(files.map((file) => [file.name, file.data]));
  return {
    schema_version: SCHEMA_VERSION,
    repoe_version: version,
    synced_at: syncedAt,
    sources,
  };
}

function buildManifest(
  files: SourceFile[],
  version: string,
  syncedAt: string,
  artifact: string,
  compressed: Buffer,
  artifactSha256: string,
) {
  return {
    schema_version: SCHEMA_VERSION,
    payload_schema_version: SCHEMA_VERSION,
    repoe_version: version,
    synced_at: syncedAt,
    upstream: REPOE_ROOT,
    artifact,
    artifact_bytes: compressed.byteLength,
    artifact_sha256: artifactSha256,
    source_count: files.length,
    sources: Object.fromEntries(
      files.map((file) => [file.name, {
        url: file.url,
        bytes: file.bytes,
        records: file.records,
        sha256: file.sha256,
      }]),
    ),
  };
}

async function atomicWrite(path: string, content: Buffer): Promise<void> {
  const temporary = `${path}.${process.pid}.tmp`;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(temporary, content);
  await rename(temporary, path);
}

async function writeImmutable(path: string, content: Buffer): Promise<void> {
  try {
    await writeFile(path, content, { flag: "wx" });
  } catch (error: unknown) {
    if (!isAlreadyExists(error)) throw error;
    const existing = await readFile(path);
    if (sha256(existing) !== sha256(content)) {
      throw new Error(`Existing content-addressed artifact has different bytes: ${path}`);
    }
  }
}

function isAlreadyExists(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "EEXIST";
}

function sha256(content: Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

main().catch((error: unknown) => {
  console.error("[poe2-data] sync failed", error);
  process.exitCode = 1;
});
