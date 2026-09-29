import { cpSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import Database from "better-sqlite3";
import { migratePatchProvenance } from "../db/sourceMigrations";
import { migratePatchSummaries } from "../db/patchSummaryMigrations";
import type { HttpFetcher } from "../sources/patchNotes/client";
import { catalogManifestSchema } from "../sources/patchNotes/contracts";

export const fixtureDir = join(process.cwd(), "src/sources/patchNotes/fixtures");

export function readFixture(name: string): string {
  return readFileSync(join(fixtureDir, name), "utf8");
}

export function openPatchDb(): Database.Database {
  const db = new Database(":memory:");
  db.exec(readFileSync(join(process.cwd(), "src/db/schema.sql"), "utf8"));
  migratePatchProvenance(db);
  migratePatchSummaries(db);
  return db;
}

export function syncOptions(db: Database.Database, projectRoot: string, responses: Response[]) {
  return {
    db,
    projectRoot,
    artifactRoot: join(projectRoot, "data"),
    contact: "tests@example.invalid",
    minimumEntries: 2,
    fetcher: queueFetcher(responses),
  } as const;
}

export function response(body: string, etag: string, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", etag, ...extra },
  });
}

export function notModified(): Response {
  return new Response(null, { status: 304, headers: { etag: "unchanged" } });
}

export function queueFetcher(responses: Response[]): HttpFetcher {
  return async () => {
    const next = responses.shift();
    if (!next) throw new Error("unexpected offline fetch");
    return next;
  };
}

// The catalog filename is content-addressed, so it changes on every RePoE re-sync.
function currentCatalogPath(): string {
  const manifestPath = join(process.cwd(), "src/data/poe2/repoe/manifest.json");
  const { artifact } = catalogManifestSchema.parse(JSON.parse(readFileSync(manifestPath, "utf8")));
  return `src/data/poe2/repoe/${artifact}`;
}

// Sync verifies the RePoE catalog SHA against the coverage file, so tests need the real trio.
export function createProjectFixture(): string {
  const root = mkdtempSync(join(tmpdir(), "poe-patch-notes-"));
  for (const relativePath of [
    "src/data/poe2/patch-coverage.json",
    "src/data/poe2/repoe/manifest.json",
    currentCatalogPath(),
  ]) {
    const target = join(root, relativePath);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(join(process.cwd(), relativePath), target);
  }
  return root;
}
